# batch.py — Batch mode
#
# Purpose: generate a full synthetic season (or a repeat run of one fixture) and save it
# Inputs:  the world's clubs, a season id, a seed; optionally how many repeats, whether to keep tracking and how many
#          processes to play in
# Outputs: data/seasons/<run>/: run.json, fixtures.json, table.json and one folder per match
# Spec:    generator/specs/live-and-batch.md §3
#
# A season is a double round robin; a repeat run plays the same fixture again and again with different seeds (the
# two-club check before the other clubs exist). Suspensions carry over between season matches only, so a season plays
# one matchweek at a time; the matches inside a matchweek (or every match of a repeat run) can play in parallel.
# Every match has its own seed, so the files are the same however many processes play them.

from __future__ import annotations

import datetime as dt
import hashlib
import json
import random
from concurrent.futures import ProcessPoolExecutor
from itertools import groupby
from pathlib import Path

import engine
import recording
import world

SEASONS_DIR = Path(__file__).resolve().parents[1] / "data" / "seasons"
SEASON_START = dt.datetime(2026, 8, 15, 15, 0, tzinfo=dt.UTC)
YELLOW_BAN_AT = 5


def match_seed(season_seed: int, match_id: str) -> int:
    return int.from_bytes(hashlib.sha256(f"{season_seed}:{match_id}".encode()).digest()[:4], "big")


def kickoff(matchweek: int) -> str:
    return (SEASON_START + dt.timedelta(days=7 * (matchweek - 1))).strftime("%Y-%m-%dT%H:%M:%SZ")


def fixtures(team_ids: list[str], seed: int) -> list[tuple[int, str, str]]:
    """(matchweek, home, away): circle-method round robin, shuffled by the seed; the second half mirrors the first."""
    teams = sorted(team_ids)
    random.Random(seed).shuffle(teams)
    if len(teams) % 2:
        teams.append("")                        # a bye
    n = len(teams)
    rounds = []
    order = teams[:]
    for r in range(n - 1):
        pairs = []
        for i in range(n // 2):
            a, b = order[i], order[n - 1 - i]
            if a and b:
                pairs.append((a, b) if (r + i) % 2 == 0 else (b, a))
        rounds.append(pairs)
        order = [order[0]] + [order[-1]] + order[1:-1]
    first = [(mw + 1, h, a) for mw, pairs in enumerate(rounds) for h, a in pairs]
    second = [(mw + len(rounds), a, h) for mw, h, a in first]
    return first + second


def _table(clubs: dict, results: list[dict]) -> list[dict]:
    rows = {t: {"team_id": t, "name": clubs[t].name, "played": 0, "won": 0, "drawn": 0, "lost": 0,
                "goals_for": 0, "goals_against": 0, "points": 0} for t in clubs}
    for r in results:
        h, a, gh, ga = r["home"], r["away"], r["score"]["home"], r["score"]["away"]
        for t, gf, gag in ((h, gh, ga), (a, ga, gh)):
            row = rows[t]
            row["played"] += 1
            row["goals_for"] += gf
            row["goals_against"] += gag
            if gf > gag:
                row["won"] += 1
                row["points"] += 3
            elif gf == gag:
                row["drawn"] += 1
                row["points"] += 1
            else:
                row["lost"] += 1
    for row in rows.values():
        row["goal_difference"] = row["goals_for"] - row["goals_against"]
    return sorted(rows.values(), key=lambda r: (-r["points"], -r["goal_difference"], -r["goals_for"], r["team_id"]))


def _play_one(job: dict) -> dict:
    """Play and save one match; return what the run needs afterwards (runs in a worker process)."""
    r = engine.play(job["clubs"], job["home"], job["away"], match_id=job["match_id"], seed=job["seed"],
                    kickoff_utc=kickoff(job["matchweek"]), season_id=job["season_id"], matchweek=job["matchweek"],
                    keep_frames=job["keep_tracking"], unavailable=job["unavailable"], storylines=job["storylines"])
    recording.save(r, job["out"], world_version=job["world_version"])
    cards = [(e["player_id"], e["card"]) for e in r.events if e["type"] == "Card"]
    return {"score": r.score, "cards": cards}


def play_run(clubs: dict[str, world.Club], *, season_id: str = "S1", seed: int = 1, repeat: int | None = None,
             home: str = "CAL", away: str = "DTN", keep_tracking: bool = False, out_dir: Path = SEASONS_DIR,
             world_version: int | None = None, storylines: tuple[str, ...] = (), jobs: int = 1, log=print) -> Path:
    """Play a season (or a repeat run) and save it. Returns the run's folder. `jobs` > 1 plays in that many
    processes; the saved files don't change."""
    if repeat:
        run = f"{season_id}-repeat-{home}-{away}-{repeat}" + "".join(f"-{s}" for s in storylines)
        plan = [(i + 1, home, away) for i in range(repeat)]
    else:
        run = season_id
        plan = fixtures(list(clubs), seed)
    d = out_dir / run
    (d / "matches").mkdir(parents=True, exist_ok=True)
    bans: dict[str, int] = {}
    yellows: dict[str, int] = {}
    results = []
    numbered = [(n, mw, h, a) for n, (mw, h, a) in enumerate(plan, start=1)]
    # A repeat run has no suspensions, so all its matches are one batch; a season goes a matchweek at a time.
    batches = [numbered] if repeat else [list(g) for _, g in groupby(numbered, key=lambda x: x[1])]
    pool = ProcessPoolExecutor(max_workers=jobs) if jobs > 1 else None
    try:
        for batch in batches:
            work = []
            for n, mw, h, a in batch:
                match_id = f"SYN-{n:04d}"
                unavailable = None
                if not repeat:
                    unavailable = {}
                    for tid in (h, a):
                        shirts = frozenset(int(pid[4:]) for pid, left in bans.items()
                                           if left > 0 and pid.startswith(tid))
                        if shirts:
                            unavailable[tid] = shirts
                work.append({"clubs": clubs, "home": h, "away": a, "match_id": match_id,
                             "seed": match_seed(seed, match_id), "matchweek": mw, "season_id": season_id,
                             "keep_tracking": keep_tracking, "unavailable": unavailable, "storylines": storylines,
                             "out": d / "matches", "world_version": world_version})
            done = list(pool.map(_play_one, work)) if pool else [_play_one(job) for job in work]
            for job, out in zip(work, done):
                h, a = job["home"], job["away"]
                if not repeat:
                    for pid in [p for p, left in bans.items() if left > 0 and p.startswith((h, a))]:
                        bans[pid] -= 1
                    for pid, card in out["cards"]:
                        if card in ("red", "second_yellow"):
                            bans[pid] = bans.get(pid, 0) + 1
                        if card in ("yellow", "second_yellow"):
                            yellows[pid] = yellows.get(pid, 0) + 1
                            if yellows[pid] % YELLOW_BAN_AT == 0:
                                bans[pid] = bans.get(pid, 0) + 1
                results.append({"match_id": job["match_id"], "matchweek": job["matchweek"], "home": h, "away": a,
                                "seed": job["seed"], "score": out["score"]})
                log(f"{job['match_id']} MW{job['matchweek']} {h} {out['score']['home']}-{out['score']['away']} {a} "
                    f"(seed {job['seed']})")
    finally:
        if pool:
            pool.shutdown()
    (d / "fixtures.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
    (d / "table.json").write_text(json.dumps(_table({t: clubs[t] for t in {x for _, h2, a2 in plan for x in (h2, a2)}},
                                                    results), indent=2) + "\n", encoding="utf-8")
    meta = {"run": run, "season_id": season_id, "seed": seed, "repeat": repeat, "storylines": list(storylines),
            "matches": len(results),
            "world_version": world_version, "keep_tracking": keep_tracking}
    (d / "run.json").write_text(json.dumps(meta, indent=2) + "\n", encoding="utf-8")
    return d
