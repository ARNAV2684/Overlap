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
