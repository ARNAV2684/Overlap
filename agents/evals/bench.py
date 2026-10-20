# bench.py — The evaluation bench
#
# Purpose: run every generated bench match through the stats engine (replay) and the seven agents, and keep what
#          the other evals read: moments, each job's decisions and lines, the outboxes, an independent re-check
# Inputs:  data/generated/bench/<match_id>/ (generator recordings: setup, events, summary with answer keys)
# Outputs: <out>/<match_id>.json per match (agents' outputs; answer keys kept apart under "evaluator")
# Spec:    agents/specs/evaluation.md §1–§4; plans/active/PLAN_agents_insights-build_S6.md
#
#   uv run python -m evals.bench --matches ../data/generated/bench --out evals/results/round-1/matches
#
# Model settings come from the environment (provider `off` by default: every agent takes its template path, so the
# bench is fast and repeatable); `--model-jobs N` caps model-backed moments per match when a model is on. Answer keys
# are read only into the "evaluator" block of the result; nothing from them reaches an agent.

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import gzip
import json
import subprocess
import sys
import time
from pathlib import Path

from config import Settings
from recap_writer import recap_moment
from run_match import recheck
from runtime import agent_deps
from state import MemoryStore
from workflow import process_moment, process_recap

ROOT = Path(__file__).resolve().parents[2]
STATS = ROOT / "stats"


def stats_python() -> str:
    venv = STATS / ".venv"
    return str(venv / ("Scripts/python.exe" if sys.platform == "win32" else "bin/python"))


def replay(folder: Path, cache: Path) -> tuple[list[dict], dict]:
    """The stats engine's moments and final numbers for one recorded match (cached next to the results)."""
    cache.mkdir(parents=True, exist_ok=True)
    moments_file, totals_file = cache / "moments.json", cache / "totals.json"
    for flag, target in (("--moments", moments_file), (None, totals_file)):
        if not target.exists():
            args = [stats_python(), "main.py", "replay", str(folder.resolve()), "--out", str(target.resolve())]
            if flag:
                args.insert(4, flag)
            subprocess.run(args, cwd=STATS, check=True, capture_output=True)
    moments = json.loads(moments_file.read_text(encoding="utf-8"))
    totals = json.loads(totals_file.read_text(encoding="utf-8"))
    moments = moments.get(folder.name, moments) if isinstance(moments, dict) else moments
    return sorted(moments, key=lambda m: m["id"]), totals[folder.name]


def final_state(match_id: str, totals: dict) -> dict:
    """The replay's whole-match numbers in the match_state shape (§4.2) the recap reads."""
    return {"id": "state", "match_id": match_id, "kind": "match_state", "phase": totals["phase"],
            "period": totals["period"], "clock": totals["clock"], "score": totals["score"],
            "source": {"event_seq": totals["source_seq"], "match_ms": totals["match_ms"]},
            "totals": totals["teams"], "players": totals["players"]}


def events_of(folder: Path) -> list[dict]:
    path = folder / "events.ndjson"
    if path.exists():
        text = path.read_text(encoding="utf-8")
    else:
        with gzip.open(folder / "events.ndjson.gz", "rt", encoding="utf-8") as f:
            text = f.read()
    return [json.loads(line) for line in text.splitlines() if line.strip()]


async def run_one(folder: Path, settings: Settings, cache: Path) -> dict:
    match_id = folder.name
    moments, totals = replay(folder, cache / match_id)
    state = final_state(match_id, totals)
    store = MemoryStore()
    for i, m in enumerate(moments):
        await store.create({**m, "_ts": i})
    store.states[match_id] = state
    if settings.provider != "off":                       # the analyst's MCP server reads this match as fixtures
        fixtures = cache / match_id / "mcp"
        (fixtures / "match_state" / match_id).mkdir(parents=True, exist_ok=True)
        for m in moments:
            (fixtures / f"{m['id']}.json").write_text(json.dumps(m), encoding="utf-8")
        (fixtures / "match_state" / match_id / "state.json").write_text(json.dumps(state), encoding="utf-8")
        settings = dataclasses.replace(settings, mcp_source="fixture", mcp_fixture_dir=str(fixtures))
    deps = agent_deps(store, settings)
    rows = []
    for m in moments:
        start = time.perf_counter()
        result = await process_moment(m, deps)
        job = (await store.read(match_id, f"job:{m['id']}"))[0]
        found = await store.read(match_id, f"outbox:{m['id']}")
        intent = found[0]["intent"] if found else None
        rows.append({"moment": m, "status": result["status"], "reason": result.get("reason"),
                     "seconds": round(time.perf_counter() - start, 3),
                     "stages": {k: v for k, v in job.get("stage_outputs", {}).items() if k != "director"},
                     "intent": intent, "wrong": recheck(intent, m) if intent else []})
    recap = await process_recap(match_id, deps)
    found = await store.read(match_id, f"outbox:RC-{match_id[4:]}")
    recap_intent = found[0]["intent"] if found else None
    recap_doc = recap_moment(state, moments)
    recap_wrong = recheck({"audiences": [{**a, "overlay": a["recap"]} for a in recap_intent["audiences"]]},
                          recap_doc) if recap_intent else []
    summary = json.loads((folder / "summary.json").read_text(encoding="utf-8"))
    setup = json.loads((folder / "setup.json").read_text(encoding="utf-8"))
    return {"match_id": match_id, "provider": settings.provider, "model": settings.model_name,
            "teams": {s: setup["teams"][s]["team_id"] for s in ("home", "away")} if isinstance(
                setup.get("teams"), dict) else None,
            "moments": rows, "recap": {"status": recap["status"], "intent": recap_intent, "wrong": recap_wrong},
            "evaluator": {"storylines": summary.get("storylines", []), "score": summary.get("score"),
                          "seed": summary.get("seed"), "events": events_of(folder)}}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="bench")
    ap.add_argument("--matches", type=Path, required=True, help="folder of recorded matches")
    ap.add_argument("--out", type=Path, required=True, help="folder for one result file per match")
    ap.add_argument("--model-jobs", type=int, help="model-backed moments per match when a model is on")
    ap.add_argument("--only", nargs="*", help="only these match ids")
    args = ap.parse_args(argv)
    settings = Settings.from_env()
    if args.model_jobs:
        settings = dataclasses.replace(settings, max_model_jobs_per_match=args.model_jobs,
                                       high_priority_reserve=min(settings.high_priority_reserve,
                                                                 max(args.model_jobs - 1, 0)))
    args.out.mkdir(parents=True, exist_ok=True)
    cache = args.out.parent / "replay"
    for folder in sorted(p for p in args.matches.iterdir() if (p / "summary.json").exists()
                         and (not args.only or p.name in args.only)):
        start = time.perf_counter()
        result = asyncio.run(run_one(folder, settings, cache))
        (args.out / f"{folder.name}.json").write_text(json.dumps(result, ensure_ascii=False), encoding="utf-8")
        wrong = sum(len(r["wrong"]) for r in result["moments"]) + len(result["recap"]["wrong"])
        print(f"{folder.name}: {len(result['moments'])} moments, wrong {wrong}, "
              f"{time.perf_counter() - start:.1f}s", flush=True)
    return 0


if __name__ == "__main__":
    sys.exit(main())
