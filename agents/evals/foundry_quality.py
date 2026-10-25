# foundry_quality.py — Groundedness, relevance and fluency of published lines (Azure AI Evaluation)
#
# Purpose: take a sample of published English lines with the evidence they were written from, and score them with
#          the Azure AI Evaluation evaluators (GroundednessEvaluator, RelevanceEvaluator, FluencyEvaluator) on the
#          Foundry deployment, as a judge independent of our own fact-checker
# Inputs:  bench results (<bench>/matches/*.json) or the Cosmos `moments` container (moments and outboxes of the
#          given matches); the Foundry endpoint and deployment from the OVERLAP_AZURE_OPENAI_* settings
# Outputs: <out>/input.jsonl (the exact sample), rows.jsonl (scores per line), summary.json, report.md
# Spec:    agents/specs/observability.md §3
#
# It costs model calls (three per line), so nothing is sent unless --run is given; without it the sample is written
# and counted only. Install the evaluators first: uv sync --group foundry-evals. Managed identity or az login, no key.
#
#   uv run python -m evals.foundry_quality --results evals/results/round-1/matches --out evals/results/foundry-1
#   uv run python -m evals.foundry_quality --cosmos --match SYN-3001 SYN-3002 --out ... --run
#
# Model lines (verified, not a fallback) are the sample; --include-templates adds template lines as a baseline.

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from collections import defaultdict
from collections.abc import Callable, Iterable
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from statistics import mean
from typing import Any

from evals.review_sheet import _spread
from fact_checker import evidence_view
from fallbacks import mode_of

METRICS = ("groundedness", "relevance", "fluency")
THRESHOLD = 3                                   # the evaluators' 1–5 scale; at or above passes (their default)
MODE_WORDS = {"casual": "a casual fan", "analyst": "an analytics-minded fan", "club": "a fan of this club",
              "player": "a fan following this player"}
Evaluator = Callable[..., dict]


# --- the sample -----------------------------------------------------------------------------------------------------

def lines_of(moment: dict, intent: dict | None, *, include_templates: bool) -> list[dict]:
    """The published English lines of one moment's intent, with what the evaluators need."""
    if not intent:
        return []
    out = []
    for a in intent.get("audiences", []):
        body, line = a.get("overlay") or {}, a.get("line") or {}
        if a.get("lang") != "en" or not line.get("text"):
            continue
        model_line = bool(body.get("verified")) and not body.get("fallback")
        if not model_line and not include_templates:
            continue
        mode = a.get("mode") or mode_of(line.get("mode", ""))
        out.append({"sample_id": f"{moment['moment_id']}|{a['group']}", "match_id": moment["match_id"],
                    "moment_id": moment["moment_id"], "trigger": moment["evidence"]["trigger"], "mode": mode,
                    "kind": "model" if model_line else "template", "response": line["text"],
                    "query": query(moment, mode), "context": context(moment)})
    return out


def query(moment: dict, mode: str) -> str:
    view = evidence_view(moment)
    who = f" involving {view['actor']}" if view.get("actor") else ""
    return (f"Write one short live-commentary line for {MODE_WORDS.get(mode, 'a fan')} about this "
            f"{view['trigger'].replace('_', ' ')} moment for {view['team']}{who} at {moment['evidence']['clock']} "
            f"(period {view['period']}), using only the facts given.")


def context(moment: dict) -> str:
    """The evidence as the evaluator reads it: teams, players, the moment and every fact with its label."""
    view = evidence_view(moment)
    facts = "\n".join(f"- {f['label']}: {f['value']}{' ' + f['unit'] if f.get('unit') else ''}" for f in view["facts"])
    players = ", ".join(f"{p['name']} ({p['pos']})" for p in view["players"].values()) or "none named"
    return (f"Teams: {', '.join(view['teams'].values())}. Team in this moment: {view['team']}. Players: {players}.\n"
            f"Moment: {view['trigger'].replace('_', ' ')}, period {view['period']}, clock "
            f"{moment['evidence']['clock']}.\nFacts:\n{facts}")


def from_results(folder: Path, *, include_templates: bool) -> list[dict]:
    rows = []
    for path in sorted(folder.glob("*.json")):
        result = json.loads(path.read_text(encoding="utf-8"))
        for r in result.get("moments", []):
            rows += lines_of(r["moment"], r.get("intent"), include_templates=include_templates)
    return rows


async def from_cosmos(match_ids: Iterable[str], *, include_templates: bool, store: Any = None) -> list[dict]:
    from state import OUTBOX, CosmosStore
    own = store is None
    store = store or CosmosStore.from_env()
    rows = []
    try:
        for match_id in match_ids:
            moments = {m["moment_id"]: m for m in await store.moments(match_id)}
            for doc in sorted(await store.of_kind(match_id, OUTBOX), key=lambda d: d["moment_id"]):
                if doc["moment_id"] in moments:                  # the recap is left out: its evidence is the match
                    rows += lines_of(moments[doc["moment_id"]], doc.get("intent"),
                                     include_templates=include_templates)
    finally:
        if own:
            await store.close()
    return rows


def sample(rows: list[dict], n: int) -> list[dict]:
    """Up to n lines, spread across triggers (then modes, in id order), so rare triggers are scored too."""
    rows = sorted(rows, key=lambda r: (r["mode"], r["sample_id"]))
    return sorted(_spread(rows, n), key=lambda r: r["sample_id"])


# --- the evaluators -------------------------------------------------------------------------------------------------

def make_evaluators(endpoint: str, deployment: str, api_version: str, *, reasoning_model: bool = True,
                    credential: Any = None) -> dict[str, Evaluator]:
    """The three Azure AI Evaluation evaluators on our Foundry deployment, signed in with Entra ID."""
    from azure.ai.evaluation import FluencyEvaluator, GroundednessEvaluator, RelevanceEvaluator
    if credential is None:
        from azure.identity import DefaultAzureCredential
        credential = DefaultAzureCredential()
    config = {"azure_endpoint": endpoint, "azure_deployment": deployment}
    if api_version:
        config["api_version"] = api_version
    kw = {"credential": credential, "threshold": THRESHOLD, "is_reasoning_model": reasoning_model}
    return {"groundedness": GroundednessEvaluator(config, **kw), "relevance": RelevanceEvaluator(config, **kw),
            "fluency": FluencyEvaluator(config, **kw)}


def score_one(row: dict, evaluators: dict[str, Evaluator]) -> dict:
    """Every metric for one line; an evaluator that fails is recorded as an error, never retried silently."""
    inputs = {"groundedness": {"query": row["query"], "response": row["response"], "context": row["context"]},
              "relevance": {"query": row["query"], "response": row["response"]},
              "fluency": {"response": row["response"]}}
    out = {k: row[k] for k in ("sample_id", "match_id", "moment_id", "trigger", "mode", "kind", "response")}
    for name, evaluate in evaluators.items():
        start = time.perf_counter()
        try:
            got = evaluate(**inputs[name])
        except Exception as e:  # noqa: BLE001 — any judge failure (network, auth, quota) is recorded as an error
            out[name] = {"score": None, "result": "error", "reason": type(e).__name__}
            continue
        score = got.get(name, got.get(f"gpt_{name}"))
        out[name] = {"score": float(score) if isinstance(score, int | float) else None,
                     "result": got.get(f"{name}_result") or ("pass" if isinstance(score, int | float)
                                                              and score >= THRESHOLD else "fail"),
                     "threshold": got.get(f"{name}_threshold", THRESHOLD),
                     "reason": (got.get(f"{name}_reason") or "")[:500],
                     "seconds": round(time.perf_counter() - start, 2)}
    return out


def score(rows: list[dict], evaluators: dict[str, Evaluator], workers: int = 4) -> list[dict]:
    with ThreadPoolExecutor(max_workers=max(1, workers)) as pool:
        return list(pool.map(lambda r: score_one(r, evaluators), rows))


# --- the outputs ----------------------------------------------------------------------------------------------------

def _metric(scored: list[dict], name: str) -> dict:
    vals = [r[name]["score"] for r in scored if name in r and r[name]["score"] is not None]
    results = [r[name]["result"] for r in scored if name in r]
    judged = [x for x in results if x in ("pass", "fail")]
    return {"n": len(vals), "mean": round(mean(vals), 2) if vals else None,
            "pass_rate": round(judged.count("pass") / len(judged), 3) if judged else None,
            "errors": results.count("error"), "not_applicable": results.count("not_applicable"),
            "threshold": THRESHOLD}


def summarise(scored: list[dict], source: str, model: str, metrics: Iterable[str] = METRICS) -> dict:
    metrics = list(metrics)
    groups: dict[str, dict[str, list[dict]]] = {"kind": defaultdict(list), "trigger": defaultdict(list),
                                                "mode": defaultdict(list)}
    for r in scored:
        for g in groups:
            groups[g][r[g]].append(r)
    return {"created_utc": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "source": source,
            "judge_model": model, "evaluators": [f"azure-ai-evaluation:{m}" for m in metrics], "lines": len(scored),
            "by_metric": {m: _metric(scored, m) for m in metrics},
            **{f"by_{g}": {k: {m: _metric(v, m)["mean"] for m in metrics} | {"n": len(v)}
                           for k, v in sorted(rows.items())} for g, rows in groups.items()}}


def markdown(s: dict) -> str:
    out = ["# Line quality — Azure AI Evaluation", "",
           f"Source: {s['source']}. Judge: {s['judge_model']}. Lines: {s['lines']}. Created {s['created_utc']}.", "",
           ("Scores are 1–5 (5 best); a line passes at 3 or above. Groundedness is judged against the moment's "
            "evidence only (facts, names, clock)."), "",
           "| Metric | n | Mean | Pass rate | Errors |", "|---|---|---|---|---|"]
    for m, v in s["by_metric"].items():
        rate = f"{v['pass_rate']:.1%}" if v["pass_rate"] is not None else "–"
        out.append(f"| {m} | {v['n']} | {v['mean'] if v['mean'] is not None else '–'} | {rate} | {v['errors']} |")
    metrics = list(s["by_metric"])
    for g in ("kind", "trigger", "mode"):
        out += ["", f"## By {g}", "", f"| {g} | n | " + " | ".join(metrics) + " |",
                "|---|---|" + "---|" * len(metrics)]
        for k, v in s[f"by_{g}"].items():
            out.append(f"| {k} | {v['n']} | " + " | ".join("–" if v[m] is None else str(v[m]) for m in metrics) + " |")
    return "\n".join(out) + "\n"


def write_jsonl(path: Path, rows: list[dict]) -> None:
    path.write_text("".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows), encoding="utf-8")


def main(argv: list[str] | None = None, *, evaluators: dict[str, Evaluator] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="foundry_quality")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--results", type=Path, help="bench results folder (<bench>/matches)")
    src.add_argument("--cosmos", action="store_true", help="read moments and outboxes from Cosmos")
    ap.add_argument("--match", nargs="*", default=[], help="match ids (with --cosmos)")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--sample", type=int, default=60, help="lines to score (three model calls each)")
    ap.add_argument("--include-templates", action="store_true", help="also score template lines, as a baseline")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--deployment", help="judge deployment (default: OVERLAP_AZURE_OPENAI_DEPLOYMENT)")
    ap.add_argument("--not-reasoning-model", action="store_true", help="the judge is not a reasoning model")
    ap.add_argument("--run", action="store_true", help="call the evaluators (costs model calls); else a dry run")
    args = ap.parse_args(argv)
    if args.cosmos and not args.match:
        ap.error("--cosmos needs --match")
    if args.results:
        rows, source = from_results(args.results, include_templates=args.include_templates), str(args.results)
    else:
        rows = asyncio.run(from_cosmos(args.match, include_templates=args.include_templates))
        source = "cosmos:" + ",".join(args.match)
    chosen = sample(rows, args.sample)
    args.out.mkdir(parents=True, exist_ok=True)
    write_jsonl(args.out / "input.jsonl", chosen)
    print(f"{len(rows)} lines found, {len(chosen)} sampled -> {args.out / 'input.jsonl'}", flush=True)
    if not args.run:
        print(f"dry run: add --run to score them ({len(chosen) * len(METRICS)} model calls)")
        return 0
    endpoint = os.environ.get("OVERLAP_AZURE_OPENAI_ENDPOINT", "")
    deployment = args.deployment or os.environ.get("OVERLAP_AZURE_OPENAI_DEPLOYMENT", "")
    if evaluators is None:
        if not endpoint.startswith("https://") or not deployment:
            ap.error("--run needs OVERLAP_AZURE_OPENAI_ENDPOINT (https) and a deployment")
        evaluators = make_evaluators(endpoint, deployment, os.environ.get("OVERLAP_AZURE_OPENAI_API_VERSION", ""),
                                     reasoning_model=not args.not_reasoning_model)
    scored = score(chosen, evaluators, args.workers)
    summary = summarise(scored, source, deployment or "injected", evaluators)
    write_jsonl(args.out / "rows.jsonl", scored)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    (args.out / "report.md").write_text(markdown(summary), encoding="utf-8")
    print(json.dumps(summary["by_metric"], ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
