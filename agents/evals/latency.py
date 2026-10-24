# latency.py — Latency eval
#
# Purpose: how long the insight path takes: per moment through the agents (bench and model runs), and moment to
#          service send on a live match (Cosmos timestamps)
# Inputs:  bench results; run_match.py reports; the local Cosmos for a live match (moments, jobs, deliveries)
# Outputs: p50 / p95 / max and sample size, kept separate for template and model-backed moments
# Spec:    agents/specs/evaluation.md §4
#
# A send is the service accepting the envelope, not a browser displaying it. Cosmos `_ts` has one-second
# resolution, so live figures are whole seconds.

from __future__ import annotations

import math


def stats(values: list[float]) -> dict:
    if not values:
        return {"n": 0, "p50": None, "p95": None, "max": None}
    v = sorted(values)

    def pct(p: float) -> float:
        return round(v[min(len(v) - 1, max(0, math.ceil(p * len(v)) - 1))], 2)
    return {"n": len(v), "p50": pct(0.5), "p95": pct(0.95), "max": round(v[-1], 2)}


def bench(results: list[dict]) -> dict:
    """Seconds per moment through the agents, by whether the moment used the model."""
    model, template = [], []
    for res in results:
        for row in res["moments"]:
            used = (row["stages"].get("spotter") or {}).get("model")
            (model if used else template).append(row["seconds"])
    return {"model_moments": stats(model), "template_moments": stats(template)}


def model_runs(reports: list[dict]) -> dict:
    """run_match.py reports: seconds per model-backed moment on the local model."""
    return stats([r["seconds"] for rep in reports for r in rep["per_moment"] if r["model"]])


async def live(match_id: str) -> dict:
    """Moment written (Cosmos _ts) to first send of its card, per moment, from the local Cosmos."""
    from state import CosmosStore
    moments, overlays = CosmosStore.from_env(), CosmosStore.from_env(container="overlays")
    try:
        written = {m["moment_id"]: m["_ts"] for m in await moments.moments(match_id)}
        sent: dict[str, int] = {}
        for d in await overlays.of_kind(match_id, "audience_delivery"):
            if d.get("state") == "sent" and d.get("envelope_kind") == "overlay":
                mid = "MO-" + d["overlay_id"][3:]
                sent[mid] = min(sent.get(mid, d["_ts"]), d["_ts"])
    finally:
        await moments.close()
        await overlays.close()
    gaps = [sent[m] - written[m] for m in sent if m in written]
    return {"match_id": match_id, "moment_to_send_s": stats(gaps)}


def job_timings(jobs: list[dict]) -> dict:
    """Milliseconds from saved job audits, not browser latency or model-card success.

    Legacy missing values are excluded, never interpreted as zero. Stage times include
    context/model work but exclude save_stage, queueing and downstream publication.
    """
    stages: dict[str, list[float]] = {}
    attempts: dict[str, dict[str, list[float]]] = {}

    def valid(value):
        return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value) and value >= 0

    for job in jobs:
        for name, output in job.get("stage_outputs", {}).items():
            elapsed = output.get("duration_ms")
            if valid(elapsed):
                stages.setdefault(name, []).append(elapsed)
            for call in output.get("calls", []):
                elapsed = call.get("duration_ms")
                if valid(elapsed) and isinstance(call.get("ok"), bool):
                    group = attempts.setdefault(call["agent"], {"success": [], "failure": []})
                    group["success" if call["ok"] else "failure"].append(elapsed)
    return {"unit": "ms", "stages": {k: stats(v) for k, v in stages.items()},
            "model_attempts": {k: {status: stats(v) for status, v in groups.items()}
                               for k, groups in attempts.items()}}


if __name__ == "__main__":
    import argparse
    import json
    from pathlib import Path

    parser = argparse.ArgumentParser(description="Summarize a local JSON array of saved insight job documents.")
    parser.add_argument("jobs", type=Path)
    args = parser.parse_args()
    documents = json.loads(args.jobs.read_text(encoding="utf-8"))
    if not isinstance(documents, list):
        parser.error("expected a JSON array of job documents")
    print(json.dumps(job_timings(documents), indent=2))
