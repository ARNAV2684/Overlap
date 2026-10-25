# spotter.py — Moment spotter
#
# Purpose: decide which moments get a card: code rules first, then (behind a setting) a small-model ranking of the
#          remaining normal moments
# Inputs:  a validated moment; the match's other moments and jobs; the per-match budget
# Outputs: {decision: admit | merge_into:<moment_id> | suppress, reason, priority, model, merged, ...}
# Spec:    agents/specs/agents.md §1; stats/agents-guide.md §4 (Moment spotter)
#
# Priority is a fixed table, never a model output. The engine has already applied warm-ups and cooldowns, so nothing
# here re-detects or re-scores a trigger.

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from models import ModelFailed, _maybe
from runtime import RunState

PRIORITY = {"goal": "high", "red_card": "high", "penalty": "high"}                   # everything else: normal
ORDER = ("goal", "red_card", "penalty", "big_chance", "shot_cluster", "momentum_swing", "press_change", "milestone",
         "head_to_head", "connection", "workhorse")
# Thinned when the budget is tight: the comparison triggers and the insight moments (head-to-head, connection, workhorse)
COMPARISON = ("momentum_swing", "press_change", "head_to_head", "connection", "workhorse")
THIN_WINDOW_MS = 600_000                                     # one comparison card per team per 10 match minutes


class Rank(BaseModel):
    decision: Literal["admit", "suppress"]
    reason: str = Field(min_length=1, max_length=120)


def priority(trigger: str) -> str:
    return PRIORITY.get(trigger, "normal")


def _rank_key(m: dict) -> tuple[int, str]:
    return ORDER.index(m["evidence"]["trigger"]), m["moment_id"]


async def run(run: RunState) -> dict:
    m, e, s = run.moment, run.moment["evidence"], run.deps.settings
    store, models = run.deps.store, run.deps.models
    base = {"trigger": e["trigger"], "team_id": e["team_id"], "period": e["period"], "match_ms": e["match_ms"],
            "priority": priority(e["trigger"]), "model": False, "merged": []}

    # Too late already (the playhead is past its live window, a new half, or full time): no model call, no card.
    if s.skip_stale:
        from publisher import eligibility
        if eligibility("overlay", e["period"], e["match_ms"], await store.match_state(m["match_id"])) == "late":
            return {**base, "decision": "suppress", "reason": "stale"}

    # Same triggering event, several moments: the highest-priority one shows; the others feed its card.
    last = e["event_ids"][-1] if e["event_ids"] else None
    siblings = [o for o in await store.moments(m["match_id"]) if o["moment_id"] != m["moment_id"] and last
                and o["evidence"]["event_ids"][-1:] == [last]]
    leader = min([m, *siblings], key=_rank_key)
    if leader is not m:
        return {**base, "decision": f"merge_into:{leader['moment_id']}", "reason": "same_event"}
    base["merged"] = sorted(o["moment_id"] for o in siblings)

    # Comparison triggers come in bulk: when the model budget is tight, one per team per 10 match minutes.
    budget = models.gate.budget if models.gate is not None else None
    used = await _maybe(budget.model_jobs_used(m["match_id"])) if budget is not None else 0
    tight = used >= s.max_model_jobs_per_match // 2
    if e["trigger"] in COMPARISON and tight and await _recent_comparison(run):
        return {**base, "decision": "suppress", "reason": "thinned"}

    high = base["priority"] == "high"
    if models.on and budget is not None:
        free = used < (s.max_model_jobs_per_match if high else s.max_model_jobs_per_match - s.high_priority_reserve)
        if free and not high and s.spotter_rank:
            try:
                rank = await run.ask("spotter", _rank_payload(m, used, s.max_model_jobs_per_match), Rank)
            except ModelFailed:
                rank = None                                  # code rules already admitted it
            if rank is not None and rank.decision == "suppress":
                return {**base, "decision": "suppress", "reason": f"ranked:{rank.reason}"}
        base["model"] = await _maybe(budget.claim_model_job(
            m["match_id"], m["moment_id"], high=high, max_jobs=s.max_model_jobs_per_match,
            reserve=s.high_priority_reserve))
    return {**base, "decision": "admit", "reason": "high_priority" if high else "admitted"}


async def _recent_comparison(run: RunState) -> bool:
    e = run.moment["evidence"]
    for job in await run.deps.store.of_kind(run.match_id, "insight_job"):
        spot = (job.get("stage_outputs") or {}).get("spotter") or {}
        if (job["moment_id"] != run.moment_id and spot.get("decision") == "admit"
                and spot.get("trigger") in COMPARISON and spot.get("team_id") == e["team_id"]
                and spot.get("period") == e["period"] and 0 <= e["match_ms"] - spot.get("match_ms", -10**9)
                < THIN_WINDOW_MS):
            return True
    return False


def _rank_payload(m: dict, used: int, limit: int) -> dict:
    e = m["evidence"]
    teams = {m["context"]["teams"][s]["team_id"]: m["context"]["teams"][s]["name"] for s in ("home", "away")}
    return {"trigger": e["trigger"], "team": teams[e["team_id"]], "clock": e["clock"], "period": e["period"],
            "facts": [{"key": f["key"], "value": f["value"], "label": f["label"]} for f in e["facts"]],
            "model_jobs_used": used, "model_jobs_limit": limit}
