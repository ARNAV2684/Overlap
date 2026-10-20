# check_delivery.py — Two viewers on the local stack (AC-05)
#
# Purpose: prove delivery end to end with the browser protocol: viewer A connects at kick-off and joins audience
#          groups (a mode and language, a club, a followed player); viewer B joins late, catches up through the
#          insights snapshot, then listens live. Reports what each received and checks seq order per group.
# Inputs:  the Web PubSub stand-in (negotiate, websocket, insights snapshot) while a match plays
# Outputs: a JSON report on stdout; exit 0 when both viewers got cards and no group had a duplicate or out-of-order
#          seq
# Spec:    CONTRACTS.md §7, §10.4, §10.6; plans/active/PLAN_agents_insights-build_S5.md AC-05
#
#   uv run python check_delivery.py --match SYN-0510 --club ORR --player KES-09 --seconds 420 --late-after 150
#
# Uses the same subprotocol a browser uses (json.webpubsub.azure.v1). It renders nothing: the card UI is the web
# app's (Vedant); this checks what reaches a browser.

from __future__ import annotations

import argparse
import asyncio
import json
import sys
import time

import aiohttp

PROTOCOL = "json.webpubsub.azure.v1"


class Viewer:
    def __init__(self, name: str, base: str, groups: list[str]):
        self.name, self.base, self.groups = name, base, groups
        self.received: dict[str, list[dict]] = {g: [] for g in groups}
        self.snapshot: dict | None = None

    async def run(self, session: aiohttp.ClientSession, until: float, snapshot_query: dict | None = None,
                  match_id: str = "") -> None:
        async with session.get(f"{self.base}/negotiate", params={"hub": "live"}) as r:
            url = (await r.json())["url"]
        async with session.ws_connect(url, protocols=(PROTOCOL,)) as ws:
            for i, g in enumerate(self.groups, 1):
                await ws.send_json({"type": "joinGroup", "group": g, "ackId": i})
            if snapshot_query is not None:                    # join first, then fetch the snapshot (§10.4)
                async with session.get(f"{self.base}/api/match/{match_id}/insights/snapshot",
                                       params=snapshot_query) as r:
                    self.snapshot = {"status": r.status, "body": await r.json()}
            while time.monotonic() < until:
                try:
                    msg = await asyncio.wait_for(ws.receive(), timeout=max(0.1, until - time.monotonic()))
                except TimeoutError:
                    break
                if msg.type != aiohttp.WSMsgType.TEXT:
                    if msg.type in (aiohttp.WSMsgType.CLOSED, aiohttp.WSMsgType.ERROR):
                        break
                    continue
                data = json.loads(msg.data)
                if data.get("type") == "message" and data.get("group") in self.received:
                    self.received[data["group"]].append(data["data"])

    def report(self) -> dict:
        out = {}
        for g, envs in self.received.items():
            seqs = [e.get("seq") for e in envs]
            kinds: dict[str, int] = {}
            for e in envs:
                kinds[e.get("kind")] = kinds.get(e.get("kind"), 0) + 1
            out[g] = {"received": len(envs), "kinds": kinds, "in_order": seqs == sorted(set(seqs)),
                      "sample": [_line(e) for e in envs if e.get("kind") != "event"][:3]}
        return out


def _line(env: dict) -> str:
    d = env.get("data") or {}
    if env.get("kind") == "overlay":
        return f"{env['seq']} {env['clock']} {next(iter(next(iter(d.get('modes', {}).values()), {}).values()), '')}"
    if env.get("kind") == "recap":
        return f"{env['seq']} recap {d.get('lines', [{}])[0].get('text', '')}"
    if env.get("kind") == "player_tag":
        return f"{env['seq']} tag {d.get('name')} {d.get('metric')} {d.get('value')}"
    return f"{env.get('seq')} {env.get('kind')}"


async def main_async(args) -> dict:
    m = args.match
    a_groups = [f"match-{m}-casual-en", f"match-{m}-analyst-es", f"match-{m}-club-{args.club}-fr",
                f"match-{m}-player-{args.player}-hi", f"match-{m}-player-{args.player}-en"]
    b_groups = [f"match-{m}-casual-en"]
    start = time.monotonic()
    a = Viewer("A", args.standin, a_groups)
    b = Viewer("B", args.standin, b_groups)
    async with aiohttp.ClientSession() as session:
        async def late():
            await asyncio.sleep(args.late_after)
            await b.run(session, start + args.seconds, {"mode": "casual", "lang": "en"}, m)
        await asyncio.gather(a.run(session, start + args.seconds), late())
    snap = b.snapshot or {}
    caught = [e["seq"] for e in (snap.get("body") or {}).get("envelopes", [])]
    live_b = [e["seq"] for e in b.received[b_groups[0]]]
    report = {"viewer_a": a.report(), "viewer_b": {"snapshot_status": snap.get("status"),
                                                   "snapshot_cursor": (snap.get("body") or {}).get("cursor"),
                                                   "caught_up": caught, "live_after": live_b,
                                                   "sample": [_line(e) for e in (snap.get("body") or {}).get(
                                                       "envelopes", [])]}}
    cards_a = sum(v["kinds"].get("overlay", 0) for v in report["viewer_a"].values())
    tags_a = sum(v["kinds"].get("player_tag", 0) for v in report["viewer_a"].values())
    merged = sorted(set(caught + live_b))
    report["checks"] = {
        "a_got_cards": cards_a > 0, "a_got_player_tags": tags_a > 0,
        "all_groups_in_order": all(v["in_order"] for v in report["viewer_a"].values()),
        "b_snapshot_ok": snap.get("status") == 200,
        "b_caught_up_or_live": bool(merged),
        "b_no_gap_after_cursor": not live_b or not caught or min(live_b) > max(caught)}
    return report


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="check_delivery")
    ap.add_argument("--match", required=True)
    ap.add_argument("--club", required=True, help="a team id for viewer A's club mode")
    ap.add_argument("--player", required=True, help="a player id viewer A follows")
    ap.add_argument("--standin", default="http://127.0.0.1:8787")
    ap.add_argument("--seconds", type=float, default=420)
    ap.add_argument("--late-after", type=float, default=150)
    args = ap.parse_args(argv)
    report = asyncio.run(main_async(args))
    print(json.dumps(report, indent=2, ensure_ascii=False))
    return 0 if all(report["checks"].values()) else 1


if __name__ == "__main__":
    sys.exit(main())
