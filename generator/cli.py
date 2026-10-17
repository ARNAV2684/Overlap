# cli.py — Command line
#
# Purpose: the generator's commands: build the world, play a match, stream matches live, validate
# Inputs:  command-line options
# Outputs: the saved world, recorded matches, live streams, validation reports
# Spec:    generator/specs/live-and-batch.md §5
#
# Run from generator/:  uv run python cli.py <command> --help

from __future__ import annotations

import argparse
import asyncio
import hashlib
import json
import sys
from pathlib import Path

import batch
import engine
import live
import realism_report
import recording
import world

STORYLINE_HELP = "a storyline from generator/storylines/ (repeat for two)"


def _clubs() -> tuple[int, dict]:
    version, loaded = world.load_reference_clubs()
    return version, {c.team_id: c for c in loaded}


def _match_id(n: int) -> str:
    return f"SYN-{n:04d}"


def cmd_world(args) -> int:
    w = world.build_world(args.season, seed=args.seed)
    out = world.save_world(w)
    for c in w["clubs"]:
        print(f"{c['team_id']} {c['name']}: {len(c['squad'])} players, strength {c['strength']}")
    print(f"saved {out} (seed {args.seed})")
    return 0


def cmd_play(args) -> int:
    version, clubs = _clubs()
    r = engine.play(clubs, args.home, args.away, match_id=args.match_id, seed=args.seed, kickoff_utc=args.kickoff,
                    storylines=tuple(args.storyline or ()))
    out = recording.save(r, Path(args.out) if args.out else recording.MATCHES_DIR, world_version=version)
    s = r.summary
    print(f"{args.match_id} {s['home']['team_id']} {r.score['home']}-{r.score['away']} {s['away']['team_id']} "
          f"(seed {args.seed}): {len(r.events)} events, {len(r.frames)} frames -> {out}")
    return 0


def cmd_live(args) -> int:
    if len(args.home) != len(args.away):
        print("give one --away for every --home", file=sys.stderr)
        return 2
    version, clubs = _clubs()
    results = []
    for i, (h, a) in enumerate(zip(args.home, args.away)):
        seed = args.seed + i
        mid = _match_id(args.first_match + i)
        r = engine.play(clubs, h, a, match_id=mid, seed=seed, kickoff_utc=args.kickoff,
                        storylines=tuple(args.storyline or ()))
        print(f"{mid} {h} v {a} (seed {seed}) played: {r.score['home']}-{r.score['away']}, {len(r.events)} events")
        if args.record:
            recording.save(r, world_version=version)
        results.append(r)
    sinks: list = []
    if args.hubs != "off":
        sinks.append(live.EventHubsSink(args.hubs, args.namespace))
    if args.stdout:
        sinks.append(live.StdoutSink(events_only=args.stdout == "events"))
    if not sinks:
        print("nothing to stream to: use --hubs emulator|azure and/or --stdout", file=sys.stderr)
        return 2
    try:
        asyncio.run(live.stream_many(results, sinks, args.speed))
    except live.StreamError as err:
        print(err, file=sys.stderr)
        return 1
    return 0


def cmd_season(args) -> int:
    version, clubs = _clubs()
    d = batch.play_run(clubs, season_id=args.season, seed=args.seed, repeat=args.repeat, home=args.home,
                       away=args.away, keep_tracking=args.keep_tracking, world_version=version,
                       storylines=tuple(args.storyline or ()))
    print(f"saved {d} (season seed {args.seed})")
    if args.report:
        print(f"report {realism_report.write(d)}")
    return 0


def cmd_report(args) -> int:
    d = Path(args.run) if args.run else batch.SEASONS_DIR / args.season
    if not (d / "matches").exists():
        print(f"no run found at {d}", file=sys.stderr)
        return 1
    print(f"report {realism_report.write(d)}")
    return 0


def _digest(obj) -> str:
    return hashlib.sha256(json.dumps(obj, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def _problems(r) -> list[str]:
    out = []
    seqs = [e["seq"] for e in r.events]
    if seqs != list(range(1, len(seqs) + 1)):
        out.append("seq is not 1, 2, 3, ...")
    if [e["match_ms"] for e in r.events] != sorted(e["match_ms"] for e in r.events):
        out.append("match_ms goes backwards")
    if r.events[-1]["type"] != "PeriodEnd":
        out.append("events after full time")
    side = {r.setup["teams"][s]["team_id"]: s for s in ("home", "away")}
    goals = {"home": 0, "away": 0}
    for e in r.events:
        if e["type"] == "Shot" and e["shot_outcome"] == "goal":
            goals[side[e["team_id"]]] += 1
        if e["type"] == "Pass" and e.get("outcome") == "success" and e["receiver_id"] == e["player_id"]:
            out.append(f"{e['event_id']}: pass to self")
    if goals != r.score:
        out.append(f"score {r.score} != goal shots {goals}")
    for a, b in zip(r.frames, r.frames[1:]):
        if a["period"] == b["period"] and b["period_ms"] - a["period_ms"] != 200:
            out.append(f"frames not 5 Hz at {b['match_ms']}")
            break
    return out


def cmd_validate(args) -> int:
    _, clubs = _clubs()
    bad = 0
    for i in range(args.matches):
        seed = args.seed + i
        a = engine.play(clubs, args.home, args.away, match_id=_match_id(seed), seed=seed)
        b = engine.play(clubs, args.home, args.away, match_id=_match_id(seed), seed=seed)
        problems = _problems(a)
        if (_digest(a.events), _digest(a.frames)) != (_digest(b.events), _digest(b.frames)):
            problems.append("same seed gave a different match")
        status = "OK" if not problems else "FAIL: " + "; ".join(problems[:3])
        bad += bool(problems)
        print(f"seed {seed}: {a.score['home']}-{a.score['away']}, {len(a.events)} events, "
              f"{len(a.frames)} frames: {status}")
    return 1 if bad else 0


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="cli.py", description="Overlap synthetic match generator")
    sub = p.add_subparsers(dest="command", required=True)

    w = sub.add_parser("world", help="build and save the world")
    w.add_argument("--season", default="S1")
    w.add_argument("--seed", type=int, default=1)
    w.set_defaults(func=cmd_world)

    pl = sub.add_parser("play", help="play one match and record it")
    pl.add_argument("--home", default="SKH")
    pl.add_argument("--away", default="AMH")
    pl.add_argument("--match-id", default="SYN-0001")
    pl.add_argument("--seed", type=int, default=1)
    pl.add_argument("--kickoff", default="2026-10-24T19:00:00Z")
    pl.add_argument("--out", help="folder for recorded matches (default data/generated/matches)")
    pl.add_argument("--storyline", action="append", help=STORYLINE_HELP)
    pl.set_defaults(func=cmd_play)

    lv = sub.add_parser("live", help="play matches and stream them live")
    lv.add_argument("--home", action="append", help="home club id; repeat for several matches")
    lv.add_argument("--away", action="append", help="away club id; one per --home")
    lv.add_argument("--speed", type=float, default=1.0, help="match seconds per real second (1, 5, 20, ...)")
    lv.add_argument("--hubs", choices=("emulator", "azure", "off"), default="off")
    lv.add_argument("--namespace", help=f"Azure Event Hubs namespace (default: ${live.NAMESPACE_VAR})")
    lv.add_argument("--stdout", choices=("events", "all"), help="also print raw messages as NDJSON")
    lv.add_argument("--record", action="store_true", help="also save each match to data/generated/matches")
    lv.add_argument("--seed", type=int, default=1, help="seed of the first match; the next ones count up")
    lv.add_argument("--first-match", type=int, default=1, help="number of the first match id (SYN-NNNN)")
    lv.add_argument("--kickoff", default="2026-10-24T19:00:00Z")
    lv.add_argument("--storyline", action="append", help=STORYLINE_HELP)
    lv.set_defaults(func=cmd_live)

    se = sub.add_parser("season", help="play a full season, or a repeat run of one fixture")
    se.add_argument("--season", default="S1")
    se.add_argument("--seed", type=int, default=1)
    se.add_argument("--repeat", type=int, help="play --home v --away this many times instead of a season")
    se.add_argument("--home", default="SKH")
    se.add_argument("--away", default="AMH")
    se.add_argument("--keep-tracking", action="store_true", help="also save tracking (about 13 MB a match)")
    se.add_argument("--report", action="store_true", help="write the realism report afterwards")
    se.add_argument("--storyline", action="append", help=STORYLINE_HELP)
    se.set_defaults(func=cmd_season)

    rp = sub.add_parser("report", help="write the realism report for a season or run")
    rp.add_argument("--season", default="S1")
    rp.add_argument("--run", help="a run folder (default data/seasons/<season>)")
    rp.set_defaults(func=cmd_report)

    v = sub.add_parser("validate", help="play matches twice and check invariants and reproducibility")
    v.add_argument("--matches", type=int, default=3)
    v.add_argument("--seed", type=int, default=1)
    v.add_argument("--home", default="SKH")
    v.add_argument("--away", default="AMH")
    v.set_defaults(func=cmd_validate)

    args = p.parse_args(argv)
    if args.command == "live":
        args.home = args.home or ["SKH"]
        args.away = args.away or ["AMH"]
    try:
        return args.func(args)
    except (world.WorldError, RuntimeError, ValueError) as err:
        print(f"error: {err}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
