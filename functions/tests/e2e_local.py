"""End-to-end check of the screen flow on the local stack (plan AC-05).

    generator live ─▶ Event Hubs emulator ─▶ relay (relay_runner.py) ─▶ Web PubSub stand-in ─▶ this client

Prerequisites: `infra/local` emulators up, the stand-in running, the relay runner running (all with the settings from
infra/local/env.example). Then, from functions/:

    uv run python tests/e2e_local.py --seed 501 --match 501 --speed 20

The client joins the match group the way a browser does, the generator plays and records the match, and every
envelope received is compared with the recording: all events, all frames (bundles expanded), statuses, final score,
live numbering, and the snapshot.
"""

from __future__ import annotations

import argparse
import asyncio
import gzip
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import aiohttp

ROOT = Path(__file__).resolve().parents[2]
GENERATOR = ROOT / "generator"
STANDIN = os.environ.get("OVERLAP_WEBPUBSUB_ENDPOINT", "http://localhost:8787")


async def collect(match_id: str, received: list, ready: asyncio.Event, stop: asyncio.Event):
    group = f"match-{match_id}"
    async with aiohttp.ClientSession() as http:
        async with http.get(f"{STANDIN}/negotiate?groups={group}") as r:
            url = (await r.json())["url"]
        async with http.ws_connect(url, protocols=("json.webpubsub.azure.v1",)) as ws:
            await ws.receive(timeout=10)  # connected
            await ws.send_str(json.dumps({"type": "joinGroup", "group": group, "ackId": 1}))
            await ws.receive(timeout=10)  # ack
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
                    received.append((time.monotonic(), m["data"]))


def load_recording(match_id: str) -> tuple[dict, list[dict], list[dict], dict]:
    d = ROOT / "data" / "generated" / "matches" / match_id  # where `cli.py live --record` saves
    setup = json.loads((d / "setup.json").read_text(encoding="utf-8"))
    events = [json.loads(line) for line in (d / "events.ndjson").read_text(encoding="utf-8").splitlines() if line]
    with gzip.open(d / "tracking.ndjson.gz", "rt", encoding="utf-8") as f:
        frames = [json.loads(line) for line in f if line.strip()]
    summary = json.loads((d / "summary.json").read_text(encoding="utf-8"))
    return setup, events, frames, summary


def compare(match_id: str, envs: list[dict], setup, events, frames, summary, snapshot) -> list[str]:
    problems = []
    seqs = [e["seq"] for e in envs]
    if seqs != list(range(1, len(seqs) + 1)):
        problems.append(f"live numbering not 1..N without gaps (first problem near {next((i + 1 for i, s in enumerate(seqs) if s != i + 1), '?')})")
    got_events = [e["data"] for e in envs if e["kind"] == "event"]
    if got_events != events:
        problems.append(f"events differ: received {len(got_events)}, recorded {len(events)}")
    got_frames = [f for e in envs if e["kind"] == "positions" for f in e["data"]["frames"]]
    if got_frames != frames:
        problems.append(f"frames differ: received {len(got_frames)}, recorded {len(frames)}")
    bundles = [len(e["data"]["frames"]) for e in envs if e["kind"] == "positions"]
    if any(n < 1 or n > 5 for n in bundles):
        problems.append("a positions bundle has fewer than 1 or more than 5 frames")
    statuses = [e for e in envs if e["kind"] == "status"]
    if not statuses or statuses[0]["data"].get("setup") != setup:
        problems.append("first status does not carry the recorded setup")
    phases = [s["data"]["phase"] for s in statuses]
    if [p for i, p in enumerate(phases) if i == 0 or p != phases[i - 1]] != \
            ["pre_match", "live", "half_time", "live", "full_time"]:
        problems.append(f"phase order {phases[:3]}…{phases[-3:]}")
    if statuses and statuses[-1]["data"]["score"] != summary["score"]:
        problems.append(f"final score {statuses[-1]['data']['score']} != recorded {summary['score']}")
    if snapshot is None:
        problems.append("snapshot not available")
    else:
        snap_envs = snapshot["envelopes"]
        expected = len([e for e in envs if e["kind"] != "positions"]) + 1
        if len(snap_envs) != expected:
            problems.append(f"snapshot has {len(snap_envs)} envelopes, expected {expected}")
        if snapshot["status"] != statuses[-1]:
            problems.append("snapshot status is not the last status")
        if snapshot["rejected"]["count"]:
            problems.append(f"snapshot rejected {snapshot['rejected']['count']}")
    return problems


async def main(args) -> int:
    match_id = f"SYN-{args.match:04d}"
    received: list = []
    ready, stop = asyncio.Event(), asyncio.Event()
    client = asyncio.create_task(collect(match_id, received, ready, stop))
    await asyncio.wait_for(ready.wait(), 20)
    print(f"joined match-{match_id}; starting the generator at {args.speed}x")
    t0 = time.monotonic()
    proc = await asyncio.to_thread(subprocess.run, [
        "uv", "run", "python", "cli.py", "live", "--hubs", "emulator", "--speed", str(args.speed),
        "--seed", str(args.seed), "--first-match", str(args.match), "--record"],
        cwd=GENERATOR, capture_output=True, text=True)
    print(f"generator finished in {time.monotonic() - t0:.0f}s (exit {proc.returncode})")
    if proc.returncode != 0:
        print(proc.stdout[-2000:], proc.stderr[-2000:])
    # drain: wait until nothing new arrives for `quiet` seconds
    last = -1
    while True:
        await asyncio.sleep(args.quiet)
        if len(received) == last:
            break
        last = len(received)
    stop.set()
    await client
    envs = [e for _, e in received]
    saved = ROOT / "data" / "generated" / "e2e" / f"{match_id}-received.ndjson"
    saved.parent.mkdir(parents=True, exist_ok=True)
    saved.write_text("".join(json.dumps(e) + "\n" for e in envs), encoding="utf-8")
    print(f"received envelopes saved to {saved}")
    setup, events, frames, summary = load_recording(match_id)
    async with aiohttp.ClientSession() as http:  # noqa: SIM117
        async with http.get(f"{STANDIN}/api/match/{match_id}/snapshot") as r:
            snapshot = await r.json() if r.status == 200 else None
    problems = compare(match_id, envs, setup, events, frames, summary, snapshot)
    kinds = {k: sum(1 for e in envs if e["kind"] == k) for k in ("status", "event", "positions", "stats")}
    print(json.dumps({"match_id": match_id, "envelopes": len(envs), "by_kind": kinds,
                      "recorded": {"events": len(events), "frames": len(frames), "score": summary["score"]},
                      "problems": problems}, indent=2))
    print("OK: every event and frame reached the browser through the relay" if not problems else "FAILED")
    return 0 if not problems else 1


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--seed", type=int, default=501)
    ap.add_argument("--match", type=int, default=501)
    ap.add_argument("--speed", type=float, default=20)
    ap.add_argument("--quiet", type=float, default=15, help="seconds without new messages before comparing")
    sys.exit(asyncio.run(main(ap.parse_args())))
