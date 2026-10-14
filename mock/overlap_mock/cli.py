"""Command line for the TEMPORARY mock.

  mock list                                   the mock matches
  mock validate [--match ID|all]              play, check against CONTRACTS.md + invariants, check determinism
  mock record   [--match ID|all] [--out DIR]  write recorded match files
  mock play     [--match ID|all] [--speed N] [--hubs off|emulator|azure] [--web] [--stdout off|events|all] [--loop]
  mock tail     [--hubs emulator|azure] [--seconds N]   read the hubs back and summarise what arrived
  mock watch    [--hubs emulator|azure] [--port 8788]   live viewer page reading both hubs
"""

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
import time
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

from . import world
from .contracts import validate_match
from .engine import play as play_match
from .stream import EnvelopeBuilder, Pacer, timeline


def _indices(match: str) -> list[int]:
    return list(range(len(world.MATCHES))) if match == "all" else [world.match_index(match)]


def _play(index: int, run: int = 0):
    return play_match(world.build_setup(index, run))


def _digest(result) -> str:
    h = hashlib.sha256()
    for e in result.events:
        h.update(json.dumps(e, sort_keys=True).encode())
    for f in result.frames[::50]:
        h.update(json.dumps(f, sort_keys=True).encode())
    return h.hexdigest()[:16]


def _generate(indices: list[int], run: int = 0):
    with ProcessPoolExecutor(max_workers=len(indices)) as pool:
        return list(pool.map(_play, indices, [run] * len(indices)))


def cmd_list(args):
    for match_id, seed, home, away, week, kickoff, storylines in world.MATCHES:
        h, a = world.CLUBS[home], world.CLUBS[away]
        print(f"{match_id}  {h.name} ({h.formation}) vs {a.name} ({a.formation})  seed={seed}  "
              f"storylines={','.join(storylines)}")


def cmd_validate(args):
    idx = _indices(args.match)
    t = time.monotonic()
    first = _generate(idx)
    again = _generate(idx)
    ok = True
    for r, r2 in zip(first, again):
        try:
            summary = validate_match(r)
        except AssertionError as ex:
            ok = False
            print(f"FAIL {r.setup['match_id']}: {ex}")
            continue
        same = _digest(r) == _digest(r2)
        ok &= same
        summary["same_seed_same_match"] = same
        print(json.dumps(summary, ensure_ascii=False))
    print(f"{'OK' if ok else 'FAILED'} in {time.monotonic() - t:.1f}s")
    sys.exit(0 if ok else 1)


def cmd_record(args):
    from .sinks.files import record
    for r in _generate(_indices(args.match)):
        validate_match(r)
        d = record(r, Path(args.out))
        print(f"{r.setup['match_id']} → {d}  ({len(r.events)} events, {len(r.frames)} frames)")


async def _play_one(index: int, args, hubs, web, run: int):
    loop = asyncio.get_running_loop()
    result = await loop.run_in_executor(None, _play, index, run)
    validate_match(result)
    mid = result.setup["match_id"]
    items = timeline(result)
    builder = EnvelopeBuilder(result.setup)
    if web:
        web.register(result.setup)
    print(f"[{mid}] kick-off in {args.pre_kickoff_s:.0f}s at {args.speed}× "
          f"({result.events[-1]['clock']} of play ≈ {result.frames[-1]['match_ms'] / 1000 / args.speed / 60:.1f} min)",
          file=sys.stderr)
    pacer = Pacer(items, args.speed, args.pre_kickoff_s, args.halftime_s)
    last_clock = ""
    async for batch in pacer.batches():
        if hubs:
            await hubs.send(mid, batch)
        if web:
            pairs = [p for it in batch for p in builder.feed(it)]
            await web.publish(mid, pairs)
        if args.stdout != "off":
            for it in batch:
                if args.stdout == "all" or it.kind != "tracking":
                    sys.stdout.write(json.dumps(it.data, ensure_ascii=False, separators=(",", ":")) + "\n")
            sys.stdout.flush()
        for it in batch:
            if it.kind == "event":
                e = it.data
                if e["type"] in ("PeriodStart", "PeriodEnd") or (e["type"] == "Shot" and e["shot_outcome"] == "goal") \
                        or (e["type"] == "Card" and e["card"] != "yellow"):
                    who = f" {e.get('player_id', '')}".rstrip()
                    print(f"[{mid}] {e['clock']} {e['type']}{who} {e.get('shot_outcome', e.get('card', ''))}".rstrip(),
                          file=sys.stderr)
                last_clock = e["clock"]
    if web:
        await web.publish(mid, builder.flush())
    print(f"[{mid}] full time {last_clock}", file=sys.stderr)


async def _play_async(args):
    hubs = web = None
    if args.hubs != "off":
        from .sinks.eventhubs import EventHubsSink
        hubs = EventHubsSink(args.hubs, args.namespace)
        await hubs.start()
    if args.web:
        from .sinks.webpubsub import WebPubSubStandIn
        web = WebPubSubStandIn(args.host, args.port)
        await web.start()
        print(f"[web] Web PubSub stand-in on http://{args.host}:{args.port}/ (negotiate, ws, snapshot)",
              file=sys.stderr)
    try:
        run = 0
        while True:
            await asyncio.gather(*(_play_one(i, args, hubs, web, run) for i in _indices(args.match)))
            if not args.loop:
                break
            run += 1
            await asyncio.sleep(args.pre_kickoff_s)
        if web and args.linger_s:
            print(f"[web] matches finished; serving snapshots for {args.linger_s:.0f}s more", file=sys.stderr)
            await asyncio.sleep(args.linger_s)
    finally:
        if hubs:
            print(f"[hubs] sent {hubs.sent}, failures {hubs.failures}", file=sys.stderr)
            await hubs.close()
        if web:
            print(f"[web] delivered {web.delivered} group messages", file=sys.stderr)
            await web.close()


def cmd_play(args):
    try:
        asyncio.run(_play_async(args))
    except KeyboardInterrupt:
        pass


async def _tail_async(args):
    from .sinks.eventhubs import EVENTS_HUB, TRACKING_HUB, make_client
    summary: dict = {}

    async def on_event(partition_context, event):
        if event is None:
            return
        props = {(k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
                 for k, v in (event.properties or {}).items()}
        body = json.loads(event.body_as_str())
        mid = props.get("match_id", body.get("match_id"))
        s = summary.setdefault(mid, {"setup": 0, "event": 0, "tracking": 0, "last_seq": 0, "seq_in_order": True,
                                     "last_clock": None})
        kind = props.get("kind", "?")
        s[kind] = s.get(kind, 0) + 1
        if kind == "event":
            if body["seq"] <= s["last_seq"]:
                s["seq_in_order"] = False
            s["last_seq"] = body["seq"]
            s["last_clock"] = body["clock"]

    clients = [make_client(args.hubs, hub, args.namespace, consumer=True, consumer_group=args.consumer_group)
               for hub in (EVENTS_HUB, TRACKING_HUB)]
    tasks = [asyncio.create_task(c.receive(on_event=on_event, starting_position="-1", max_wait_time=2))
             for c in clients]
    await asyncio.sleep(args.seconds)
    for c in clients:
        await c.close()
    for t in tasks:
        t.cancel()
    print(json.dumps(summary, indent=2))


def cmd_tail(args):
    asyncio.run(_tail_async(args))


def cmd_watch(args):
    from .viewer import Viewer
    viewer = Viewer(args.hubs, args.namespace, args.consumer_group, args.start, args.host, args.port)
    try:
        asyncio.run(viewer.run())
    except KeyboardInterrupt:
        pass


def main(argv=None):
    ap = argparse.ArgumentParser(prog="mock", description="TEMPORARY mock of the generator's live output")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list").set_defaults(fn=cmd_list)

    p = sub.add_parser("validate")
    p.add_argument("--match", default="all")
    p.set_defaults(fn=cmd_validate)

    p = sub.add_parser("record")
    p.add_argument("--match", default="all")
    p.add_argument("--out", default="recorded")
    p.set_defaults(fn=cmd_record)

    p = sub.add_parser("play")
    p.add_argument("--match", default="all", help="a match ID from `mock list`, or all (played at the same time)")
    p.add_argument("--speed", type=float, default=1.0, help="1, 5, 20 … (match seconds per real second)")
    p.add_argument("--hubs", choices=["off", "emulator", "azure"], default="off")
    p.add_argument("--namespace", help="Azure only: <name>.servicebus.windows.net (or OVERLAP_EVENTHUBS_NAMESPACE)")
    p.add_argument("--web", action="store_true", help="serve the local Web PubSub stand-in")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8787)
    p.add_argument("--stdout", choices=["off", "events", "all"], default="off",
                   help="also print raw messages as NDJSON (events only, or events + tracking)")
    p.add_argument("--loop", action="store_true", help="when a match ends, start a new one (new IDs and seed)")
    p.add_argument("--pre-kickoff-s", type=float, default=5.0)
    p.add_argument("--halftime-s", type=float, default=10.0, help="real seconds of half-time break")
    p.add_argument("--linger-s", type=float, default=0.0, help="keep the web server up after full time")
    p.set_defaults(fn=cmd_play)

    p = sub.add_parser("tail")
    p.add_argument("--hubs", choices=["emulator", "azure"], default="emulator")
    p.add_argument("--namespace")
    p.add_argument("--consumer-group", default="$Default")
    p.add_argument("--seconds", type=float, default=20.0)
    p.set_defaults(fn=cmd_tail)

    p = sub.add_parser("watch", help="live viewer page reading both hubs")
    p.add_argument("--hubs", choices=["emulator", "azure"], default="emulator")
    p.add_argument("--namespace", help="Azure only: <name>.servicebus.windows.net (or OVERLAP_EVENTHUBS_NAMESPACE)")
    p.add_argument("--consumer-group", default="$Default", help="read-only group; never stats, relay or archiver")
    p.add_argument("--from", dest="start", choices=["latest", "start"], default="latest",
                   help="where tracking starts (events are always read from the start to rebuild scores)")
    p.add_argument("--host", default="localhost")
    p.add_argument("--port", type=int, default=8788)
    p.set_defaults(fn=cmd_watch)

    args = ap.parse_args(argv)
    for stream in (sys.stdout, sys.stderr):
        if hasattr(stream, "reconfigure"):
            stream.reconfigure(encoding="utf-8")
    args.fn(args)


if __name__ == "__main__":
    main()
