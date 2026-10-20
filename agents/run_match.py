# run_match.py — One match through the seven agents, with a report
#
# Purpose: run every moment of a played match (and its recap) through the real agents and the configured model,
#          then re-check every line in every outbox independently (AC-04: zero wrong numbers)
# Inputs:  a match in the local Cosmos (moments, match_state; the MCP server reads Cosmos too), or the stats engine's
#          fixture SYN-1017 (moments and context files; the MCP server reads them as fixtures)
# Outputs: a JSON report: per moment status, verified/fallback lines, model calls, time; totals; wrong numbers
# Spec:    agents/specs/evaluation.md; plans/active/PLAN_agents_insights-build_S4.md AC-04c
#
#   uv run python run_match.py --match SYN-0508 --report ../out/SYN-0508.json
#   uv run python run_match.py --fixture --report ../out/SYN-1017.json
#
# Jobs and outboxes are written to an in-memory copy, never to Cosmos (the moment trigger owns those), so a run can be
# repeated. Settings come from the environment (infra/local/env.example); for Foundry Local on a laptop use longer
# OVERLAP_MODEL_TIMEOUT_S and OVERLAP_MOMENT_DEADLINE_S than the Azure defaults.

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import json
import shutil
import statistics
import sys
import tempfile
import time
from collections import Counter
from pathlib import Path

from config import Settings
from fact_checker import _template, core, numeric_check
from fallbacks import template_line
from recap_writer import recap_moment
from runtime import agent_deps
from state import MemoryStore
from workflow import process_moment, process_recap

ROOT = Path(__file__).resolve().parents[1]
FIXTURE_MOMENTS = ROOT / "mcp_server" / "tests" / "data" / "SYN-1017-moments.json"
FIXTURE_TOOLS = ROOT / "mcp_server" / "tests" / "data" / "tools"


async def load_cosmos(match_id: str) -> tuple[list[dict], dict | None]:
    from state import CosmosStore
    store = CosmosStore.from_env()
    try:
        moments = sorted(await store.moments(match_id), key=lambda m: m["id"])
        return [_clean(m) for m in moments], await store.match_state(match_id)
    finally:
        await store.close()


def load_fixture(directory: Path) -> tuple[list[dict], dict | None]:
    """SYN-1017 as the MCP fixture source expects it: <dir>/<moment_id>.json plus match_state/ and stats/."""
    moments = json.loads(FIXTURE_MOMENTS.read_text(encoding="utf-8"))
    shutil.copytree(FIXTURE_TOOLS, directory, dirs_exist_ok=True)
    for m in moments:
        (directory / f"{m['id']}.json").write_text(json.dumps(m), encoding="utf-8")
    state = json.loads((FIXTURE_TOOLS / "match_state" / "SYN-1017" / "state.json").read_text(encoding="utf-8"))
    return moments, state


def _clean(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if not k.startswith("_")}


def recheck(intent: dict, moment: dict) -> list[dict]:
    """Every audience line re-checked from scratch: English against the facts; a translation against the English
    line it was translated from (the model's line, or for a fallback the template, which is checked too)."""
    english = {}
    for a in intent["audiences"]:
        if a["lang"] == "en":
            english[(a["mode"], a.get("club") or a.get("player"))] = a["line"]
    wrong = []
    for a in intent["audiences"]:
        target = a.get("club") or a.get("player")
        line_id = f"{a['mode']}:{target}" if target else a["mode"]
        line = {"id": line_id, **a["line"]}
        if a["lang"] == "en":
            problems = numeric_check(line, moment)
        else:
            sources = [{"id": line_id, **english[(a["mode"], target)]}] if (a["mode"], target) in english else []
            if (a.get("overlay") or a.get("recap") or {}).get("fallback"):
                sources.append(core(_template(moment, line_id, template_line)))
            results = [numeric_check(line, moment, english=src) for src in sources] or [["no_english_line"]]
            problems = [] if any(r == [] for r in results) else results[0]
            if problems == [] and len(sources) > 1 and results[0]:
                problems = numeric_check(sources[-1], moment)          # the template itself must pass too
        if problems:
            wrong.append({"group": a["group"], "text": a["line"]["text"], "problems": problems})
    return wrong


async def run(match_id: str, moments: list[dict], state: dict | None, settings: Settings) -> dict:
    store = MemoryStore()
    for i, m in enumerate(moments):
        await store.create({**m, "_ts": i})
    if state is not None:
        store.states[match_id] = state
    deps = agent_deps(store, settings)
    rows, wrong = [], []
    for m in moments:
        start = time.perf_counter()
        result = await process_moment(m, deps)
        seconds = time.perf_counter() - start
        job = (await store.read(match_id, f"job:{m['id']}"))[0]
        calls = [c for out in job.get("stage_outputs", {}).values() if isinstance(out, dict)
                 for c in out.get("calls", [])]
        row = {"moment_id": m["id"], "trigger": m["evidence"]["trigger"], "status": result["status"],
               "reason": result.get("reason"), "seconds": round(seconds, 2), "model": bool(
                   job.get("stage_outputs", {}).get("spotter", {}).get("model")),
               "calls": [(c["agent"], c["ok"], c.get("reason")) for c in calls]}
        found = await store.read(match_id, f"outbox:{m['id']}")
        if found:
            intent = found[0]["intent"]
            row.update(audiences=len(intent["audiences"]), verified=intent["verified"], fallback=intent["fallback"],
                       lines=Counter(f"{a['mode']}|{a['lang']}|{'verified' if a['overlay']['verified'] else 'template'}"
                                     for a in intent["audiences"]),
                       interpretation=job["stage_outputs"]["analyst"].get("interpretation"),
                       sample={a["group"]: a["line"]["text"] for a in intent["audiences"]
                               if a["lang"] in ("en", "es") and a["mode"] in ("casual", "analyst")})
            bad = recheck(intent, m)
            row["wrong_numbers"] = len(bad)
            wrong += bad
        rows.append(row)
        print(f"{m['id']} {row['trigger']:<15} {row['status']:<16} {seconds:6.1f}s "
              f"model={row['model']} verified={row.get('verified')}", flush=True)
    recap = None
    if state is not None and state.get("phase") == "full_time":
        start = time.perf_counter()
        result = await process_recap(match_id, deps)
        recap = {"status": result["status"], "seconds": round(time.perf_counter() - start, 2),
                 "verified": result.get("verified")}
        found = await store.read(match_id, f"outbox:RC-{match_id[4:]}")
        if found:
            intent = found[0]["intent"]
            recap_doc = recap_moment(state, moments)
            bad = recheck({"audiences": [{**a, "overlay": a["recap"]} for a in intent["audiences"]]}, recap_doc)
            recap.update(wrong_numbers=len(bad), audiences=len(intent["audiences"]),
                         sample={a["group"]: a["line"]["text"] for a in intent["audiences"] if a["lang"] == "en"})
            wrong += bad
        print(f"recap {recap}", flush=True)
    return summarise(match_id, settings, rows, recap, wrong)


def summarise(match_id: str, settings: Settings, rows: list[dict], recap: dict | None, wrong: list[dict]) -> dict:
    times = [r["seconds"] for r in rows if r["model"]]
    lines = Counter()
    for r in rows:
        lines.update(r.get("lines", {}))
    calls = Counter(f"{a}:{'ok' if ok else reason}" for r in rows for a, ok, reason in r["calls"])
    return {"match_id": match_id, "provider": settings.provider, "model": settings.model_name,
            "translator": settings.translator, "moments": len(rows),
            "status": dict(Counter(r["status"] for r in rows)),
            "model_jobs": sum(r["model"] for r in rows),
            "verified_cards": sum(1 for r in rows if r.get("verified")),
            "lines": dict(sorted(lines.items())), "calls": dict(sorted(calls.items())),
            "seconds_per_model_moment": {"p50": round(statistics.median(times), 1) if times else None,
                                         "max": max(times) if times else None},
            "recap": recap, "wrong_numbers": len(wrong), "wrong": wrong[:20], "per_moment": rows}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="run_match")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--match", help="a played match in the local Cosmos, e.g. SYN-0508")
    src.add_argument("--fixture", action="store_true", help="the stats engine's fixture match SYN-1017")
    ap.add_argument("--report", type=Path, help="write the JSON report here")
    args = ap.parse_args(argv)
    settings = Settings.from_env()
    if args.fixture:
        directory = Path(tempfile.mkdtemp(prefix="overlap-fixture-"))
        moments, state = load_fixture(directory)
        settings = dataclasses.replace(settings, mcp_source="fixture", mcp_fixture_dir=str(directory))
        match_id = "SYN-1017"
    else:
        moments, state = asyncio.run(load_cosmos(args.match))
        match_id = args.match
    if not moments:
        print(f"no moments for {match_id}")
        return 1
    report = asyncio.run(run(match_id, moments, state, settings))
    text = json.dumps(report, indent=2, ensure_ascii=False, default=dict)
    if args.report:
        args.report.parent.mkdir(parents=True, exist_ok=True)
        args.report.write_text(text, encoding="utf-8")
    print(json.dumps({k: report[k] for k in ("match_id", "model", "moments", "status", "model_jobs",
                                              "verified_cards", "calls", "seconds_per_model_moment",
                                              "wrong_numbers")}, ensure_ascii=False))
    return 0 if report["wrong_numbers"] == 0 else 2


if __name__ == "__main__":
    sys.exit(main())
