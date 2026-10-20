# recall.py — Recall eval
#
# Purpose: how many of the moments that should exist did the stats engine detect, and how many reached a card;
#          and whether each generated storyline was caught compared with its control match
# Inputs:  a match's ordered event log (independent labels), the engine's moments, the agents' outcomes, and the
#          generator's storyline answer keys (evaluator only — never given to an agent)
# Outputs: per trigger: eligible, detected, recall; displayed coverage; storyline hit rates vs controls
# Spec:    agents/specs/evaluation.md §1; stats/specs/triggers.md; CONTRACTS.md §10.1
#
# Independent labels are rebuilt here from the events with the agreed rules, without the stats engine's code, for
# the triggers the events alone define: goal, red card, missed or saved penalty, milestone, shot cluster. Big chance
# (needs the xG model), momentum swing and press change (need the engine's windowed metrics) have no independent
# label: their recall is N/A, and the storyline comparison covers them. A zero denominator is N/A, never 100%.

from __future__ import annotations

from collections import defaultdict

PERIOD_WARMUP_MS = 300_000                   # shot clusters: no cluster in a period's first 5 minutes
CLUSTER_WINDOW_MS = 300_000
CLUSTER_COOLDOWN_MS = 300_000
LABELLED = ("goal", "red_card", "penalty", "milestone", "shot_cluster")
NOT_LABELLED = ("big_chance", "momentum_swing", "press_change")

# Storyline answer-key signals -> moments that would show them, for the storyline's team.
STORY_TRIGGERS = {
    "late_pressure_surge": {"press_change", "momentum_swing", "shot_cluster"},
    "fading_legs": {"press_change", "momentum_swing"},
    "red_card": {"red_card"},
    "star_night": {"milestone", "goal"},
    "comeback": {"goal", "momentum_swing", "shot_cluster"},
    "low_block_resistance": {"shot_cluster", "momentum_swing", "big_chance"},
}


def labels(events: list[dict]) -> list[dict]:
    """Expected moments from the event log alone: {trigger, team_id, event_id, match_ms, period}."""
    out: list[dict] = []
    goals_by_player: dict[str, int] = defaultdict(int)
    shots: dict[tuple[int, str], list[dict]] = defaultdict(list)
    last_cluster: dict[tuple[int, str], int] = {}
    for e in sorted(events, key=lambda x: x["seq"]):
        t = e.get("type")
        if t == "Card" and e.get("card") in ("red", "second_yellow"):
            out.append(_label("red_card", e))
        if t != "Shot" or e.get("period") not in (1, 2):
            continue
        if e.get("shot_outcome") == "goal":
            out.append(_label("goal", e))
            goals_by_player[e["player_id"]] += 1
            if goals_by_player[e["player_id"]] in (2, 3):
                out.append(_label("milestone", e))
        elif e.get("situation") == "penalty":
            out.append(_label("penalty", e))
        key = (e["period"], e["team_id"])
        shots[key].append(e)
        if e["period_ms"] < PERIOD_WARMUP_MS:
            continue
        recent = [s for s in shots[key] if e["match_ms"] - CLUSTER_WINDOW_MS < s["match_ms"] <= e["match_ms"]]
        if len(recent) >= 3 and (key not in last_cluster or e["match_ms"] - last_cluster[key] >= CLUSTER_COOLDOWN_MS):
            out.append(_label("shot_cluster", e))
            last_cluster[key] = e["match_ms"]
    return out


def _label(trigger: str, e: dict) -> dict:
    return {"trigger": trigger, "team_id": e["team_id"], "event_id": e["event_id"], "match_ms": e["match_ms"],
            "period": e["period"]}


def detection(events: list[dict], moments: list[dict]) -> dict:
    """Per trigger: eligible (labelled), detected (an engine moment with the same trigger and triggering event),
    extra (engine moments with no label), recall."""
    expected = labels(events)
    found = {(m["evidence"]["trigger"], m["evidence"]["event_ids"][-1] if m["evidence"]["event_ids"] else None)
             for m in moments}
    labelled = {(x["trigger"], x["event_id"]) for x in expected}
    out = {}
    for trig in LABELLED:
        eligible = [x for x in expected if x["trigger"] == trig]
        hit = sum((trig, x["event_id"]) in found for x in eligible)
        extra = sum(1 for t, ev in found if t == trig and (t, ev) not in labelled)
        out[trig] = {"eligible": len(eligible), "detected": hit, "extra": extra,
                     "recall": round(hit / len(eligible), 3) if eligible else None}
    for trig in NOT_LABELLED:
        out[trig] = {"eligible": None, "detected": sum(1 for t, _ in found if t == trig), "extra": None,
                     "recall": None}
    return out


def effect_showed(story: dict) -> bool:
    """The generator measured at least one of the storyline's signals in the data (an effect that never showed is
    not something the agents could catch)."""
    measured = story.get("measured") or {}
    return any(v.get("up") or v.get("after") is True for v in measured.values() if isinstance(v, dict))


def story_window(story: dict) -> tuple[int, int]:
    """From the storyline's onset to its end (or, open-ended, the point it reaches full strength), plus the answer
    key's detection allowance. The same window is applied to the control match."""
    start = story.get("onset_ms") or 0
    end = story.get("end_ms") or story.get("full_ms") or start
    return start, end + int((story.get("detect_within_min") or 10) * 60_000)


def storyline_hits(story: dict, moments: list[dict], team_id: str) -> dict:
    """Did a moment that shows the storyline fire for its team within its window? Evaluator only."""
    start, end = story_window(story)
    wanted = STORY_TRIGGERS.get(story["name"], set())
    hits = [m for m in moments if m["evidence"]["trigger"] in wanted and m["evidence"]["team_id"] == team_id
            and start <= m["evidence"]["match_ms"] <= end]
    return {"storyline": story["name"], "triggered": story.get("triggered"), "effect": effect_showed(story),
            "team_id": team_id, "window_ms": [start, end], "hit": bool(hits),
            "first": hits[0]["evidence"]["trigger"] if hits else None}


def sum_detection(rows: list[dict]) -> dict:
    """Detection summed over matches, recall recomputed from the sums."""
    total: dict[str, dict] = {}
    for row in rows:
        for trig, v in row.items():
            t = total.setdefault(trig, {"eligible": 0 if v["eligible"] is not None else None, "detected": 0,
                                        "extra": 0 if v["extra"] is not None else None})
            if v["eligible"] is not None:
                t["eligible"] += v["eligible"]
                t["extra"] += v["extra"]
            t["detected"] += v["detected"]
    for t in total.values():
        t["recall"] = round(t["detected"] / t["eligible"], 3) if t["eligible"] else None
    return total
