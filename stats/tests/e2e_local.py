"""End-to-end check of stat panels on the local stack (stats plan S2: AC-05, AC-06, S2-AC-04, S2-AC-05).

    generator live ─▶ Event Hubs emulator ─▶ stats (main.py live) ─▶ match-events (kind=stats)
                                                                      ├─▶ relay ─▶ Web PubSub stand-in ─▶ this client
                                                                      └─▶ archiver ─▶ Cosmos `stats`
                                              stats ─▶ Cosmos `match_state`

Prerequisites: `infra/local` emulators up; the stand-in, relay and archiver running, all with the settings from
infra/local/env.example (infra/specs/local-development.md §5). This script starts the stats engine itself, so it can
restart it mid-match with --restart-after. Then, from stats/:

    uv run python tests/e2e_local.py --seed 502 --match 502 --speed 20 [--restart-after 90]

Every stat panel received is compared with what `main.py replay --panels` gives for the generator's recording of the
same match. Their order and numbering are checked, and so are Cosmos `stats` and `match_state`.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

import aiohttp

HERE = Path(__file__).resolve().parents[1]
ROOT = HERE.parent
GENERATOR = ROOT / "generator"
STANDIN = os.environ.get("OVERLAP_WEBPUBSUB_ENDPOINT", "http://localhost:8787")
sys.path.insert(0, str(HERE))


async def collect(match_id: str, received: list, ready: asyncio.Event, stop: asyncio.Event) -> None:
    group = f"match-{match_id}"
    async with aiohttp.ClientSession() as http:
        async with http.get(f"{STANDIN}/negotiate?groups={group}") as r:
            url = (await r.json())["url"]
        async with http.ws_connect(url, protocols=("json.webpubsub.azure.v1",)) as ws:
            await ws.receive(timeout=10)                       # connected
            await ws.send_str(json.dumps({"type": "joinGroup", "group": group, "ackId": 1}))
            await ws.receive(timeout=10)                       # ack
            ready.set()
            while not stop.is_set():
                try:
                    msg = await ws.receive(timeout=1)
                except TimeoutError:
                    continue
                if msg.type != aiohttp.WSMsgType.TEXT:
                    break
                m = json.loads(msg.data)
                if m.get("type") == "message" and m.get("group") == group:
                    received.append(m["data"])


def start_stats(log_path: Path) -> subprocess.Popen:
    return subprocess.Popen([sys.executable, "main.py", "live"], cwd=HERE, stdout=open(log_path, "ab"),
                            stderr=subprocess.STDOUT)


def without_tracking(panel: dict) -> dict:
    """Tracking values in the heavy block depend on frame timing, so they are left out of the comparison."""
    p = dict(panel)
    if "heavy" in p:
        p["heavy"] = {k: v for k, v in p["heavy"].items() if k != "players"}
    return p


def cosmos_checks(match_id: str, last_seq: int, expected: int) -> list[str]:
    from azure.cosmos import CosmosClient
    endpoint, key = os.environ.get("OVERLAP_COSMOS_ENDPOINT"), os.environ.get("OVERLAP_COSMOS_KEY")
    if not endpoint or not key:
        return ["Cosmos settings missing; Cosmos not checked"]
    db = CosmosClient(endpoint, credential=key).get_database_client(os.environ.get("OVERLAP_COSMOS_DATABASE", "live"))
    problems = []
    archived = next(iter(db.get_container_client("stats").query_items(
        "SELECT VALUE COUNT(1) FROM c WHERE c.match_id = @m", parameters=[{"name": "@m", "value": match_id}],
        partition_key=match_id)))
    if archived != expected:
        problems.append(f"Cosmos stats holds {archived} panels, expected {expected}")
    state = db.get_container_client("match_state").read_item("state", partition_key=match_id)
    if state["phase"] != "full_time" or state["source"]["event_seq"] != last_seq:
        problems.append(f"match_state at phase {state['phase']}, seq {state['source']['event_seq']} (want {last_seq})")
    return problems


async def run(args) -> int:
    match_id = f"SYN-{args.match:04d}"
    log_path = ROOT / "data" / "generated" / "e2e" / f"{match_id}-stats.log"
    log_path.parent.mkdir(parents=True, exist_ok=True)
    received: list = []
    ready, stop = asyncio.Event(), asyncio.Event()
    client = asyncio.create_task(collect(match_id, received, ready, stop))
    await asyncio.wait_for(ready.wait(), 20)
    engine = start_stats(log_path)
    await asyncio.sleep(5)                                     # let the readers connect
    print(f"joined match-{match_id}; stats engine running; generator at {args.speed}x")
    gen = asyncio.create_task(asyncio.to_thread(subprocess.run, [
        sys.executable if args.generator_python is None else args.generator_python, "cli.py", "live", "--hubs",
        "emulator", "--speed", str(args.speed), "--seed", str(args.seed), "--first-match", str(args.match),
        "--record"], cwd=GENERATOR, capture_output=True, text=True))
    if args.restart_after:
        await asyncio.sleep(args.restart_after)
        engine.kill()
        engine.wait()
        print(f"stats engine killed after {args.restart_after}s; restarting")
        engine = start_stats(log_path)
    proc = await gen
    print(f"generator finished (exit {proc.returncode})")
    if proc.returncode != 0:
        print(proc.stdout[-2000:], proc.stderr[-2000:])
    last = -1
    while True:                                                # drain until quiet
        await asyncio.sleep(args.quiet)
        if len(received) == last:
            break
        last = len(received)
    stop.set()
    await client
    engine.kill()

    import main as stats_main  # stats/ is on the path (above)

    panels = [e for e in received if e["kind"] == "stats"]
    seqs = [e["seq"] for e in received]
    recording = ROOT / "data" / "generated" / "matches" / match_id
    expected = stats_main.replay_panels(recording)[match_id]
    problems = []
    if seqs != sorted(seqs) or len(set(seqs)) != len(seqs):
        problems.append("envelope seq not strictly increasing")
    got = [without_tracking(e["data"]) for e in panels]
    want = [without_tracking(p) for p in expected]
    if got != want:
        first = next((i for i, (a, b) in enumerate(zip(got, want, strict=False)) if a != b), min(len(got), len(want)))
        problems.append(f"panels differ: received {len(got)}, replay {len(want)}; first difference at index {first}")
    events = [json.loads(line) for line in (recording / "events.ndjson").read_text(encoding="utf-8").splitlines()
              if line]
    problems += cosmos_checks(match_id, events[-1]["seq"], len(expected))
    latency = [line for line in log_path.read_text(encoding="utf-8", errors="replace").splitlines()
               if "event-to-panel" in line]
    print(json.dumps({"match_id": match_id, "envelopes": len(received), "panels_received": len(panels),
                      "panels_expected": len(expected), "restarted": bool(args.restart_after),
                      "latency": latency[-1:] or None, "problems": problems}, indent=2))
    print("OK: every panel reached the browser and the archive" if not problems else "FAILED")
    return 0 if not problems else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=502)
    ap.add_argument("--match", type=int, default=502)
    ap.add_argument("--speed", type=float, default=20)
    ap.add_argument("--restart-after", type=float, default=0, help="kill and restart the engine after this many s")
    ap.add_argument("--quiet", type=float, default=15, help="seconds without new messages before comparing")
    ap.add_argument("--generator-python", help="the generator's Python (default: this one)")
    sys.exit(asyncio.run(run(ap.parse_args())))
