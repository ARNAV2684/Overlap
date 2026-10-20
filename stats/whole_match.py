# whole_match.py — Whole-match stats
#
# Purpose: turn the match state into team and player totals, with the minimum-sample rules applied
# Inputs:  state.MatchState
# Outputs: a JSON-ready summary of the match so far
# Spec:    stats/specs/metrics.md §4–§7
#
# The pass network, zones, pressing grid and momentum buckets are the stat panel's heavy block (publishing.md §2).

from __future__ import annotations

from collections import defaultdict

from state import SIDES, MatchState

# Minimum samples (metrics.md §7): below these a value is null and listed in low_sample
MIN_PASSES = 10
MIN_PPDA_ACTIONS = 3
MIN_PRESS_ACTIONS = 8
MIN_SHOTS_FOR_XG_PER_SHOT = 3
MIN_LINK_PASSES = 3                # pass network links (metrics.md §6)
BUCKET_MS = 5 * 60_000


def _ratio(num: float, den: float, minimum: float, digits: int, scale: float = 1.0):
    """scale × num ÷ den rounded to `digits` (a whole number for 0), or None below the minimum sample."""
    if den < minimum or den <= 0:
        return None
    value = round(scale * num / den, digits)
    return int(value) if digits == 0 else value


def team_summary(state: MatchState, side: str) -> dict:
    t = state.teams[side]
    c = t.counts
    total_poss = state.possession_ms("home") + state.possession_ms("away")
    both_momentum = state.teams["home"].momentum + state.teams["away"].momentum
    out = {
        "team_id": t.team_id,
        "goals": state.score[side],
        "shots": c["shots"], "shots_on_target": c["on_target"], "shots_blocked": c["blocked"],
        "xg": round(t.xg, 2),
        "xg_per_shot": _ratio(t.xg, c["shots"], MIN_SHOTS_FOR_XG_PER_SHOT, 3),
        "big_chances": c["big_chances"],
        "possession_pct": round(100 * state.possession_ms(side) / total_poss) if total_poss else None,
        "passes": c["passes"], "passes_completed": c["completed"],
        "pass_completion_pct": _ratio(c["completed"], c["passes"], MIN_PASSES, 0, 100),
        "progressive_passes": c["progressive"], "key_passes": c["key_passes"], "crosses": c["crosses"],
        "difficult_completions": c["difficult_completions"],
        "take_ons": c["take_ons"], "take_ons_completed": c["take_ons_completed"],
        "tackles": c["tackles"], "tackles_won": c["tackles_won"], "interceptions": c["interceptions"],
        "clearances": c["clearances"], "aerials_won": c["aerials_won"], "high_regains": c["high_regains"],
        "pressures": c["pressures"],
        "ppda": _ratio(c["ppda_opp_passes"], c["ppda_actions"], MIN_PPDA_ACTIONS, 1),
        "pressures_per_opp_pass": _ratio(c["pressures"], c["opp_passes"], 1, 2),
        "press_height_m": _ratio(t.press_x_sum, c["press_actions"], MIN_PRESS_ACTIONS, 0),
        "momentum_share_match_pct": round(100 * t.momentum / both_momentum) if both_momentum >= 6 else None,
        "fouls": c["fouls"], "yellow_cards": c["yellows"], "red_cards": c["reds"],
        "corners": c["corners"], "offsides": c["offsides"], "substitutions": c["substitutions"],
    }
    out["low_sample"] = sorted(k for k in ("xg_per_shot", "possession_pct", "pass_completion_pct", "ppda",
                                           "pressures_per_opp_pass", "press_height_m", "momentum_share_match_pct")
                               if out[k] is None)
    return out


def player_summary(state: MatchState) -> dict:
    tracking = state.has_tracking()
    out = {}
    for pid, p in sorted(state.players.items()):
        if p.on_ms is None:
            continue                                   # an unused substitute
        end = p.off_ms if p.off_ms is not None else state.match_ms
        c = p.counts
        row = {
            "name": p.name, "pos": p.pos, "side": p.side, "minutes": round(max(end - p.on_ms, 0) / 60000),
            "goals": c["goals"], "shots": c["shots"], "xg": round(p.xg, 2), "assists": c["assists"],
            "key_passes": c["key_passes"], "passes": c["passes"],
            "pass_completion_pct": _ratio(c["completed"], c["passes"], MIN_PASSES, 0, 100),
            "progressive_passes": c["progressive"], "take_ons": c["take_ons"], "tackles": c["tackles"],
            "interceptions": c["interceptions"], "pressures": c["pressures"],
        }
        if tracking:
            m = p.motion
            row.update(distance_km=round(m.distance_m / 1000, 2), top_speed_kmh=round(m.top_speed_kmh, 1),
                       sprints=m.sprints, sprint_m=round(m.sprint_m), high_intensity_m=round(m.high_intensity_m))
        out[pid] = row
    return out


def summary(state: MatchState) -> dict:
    return {
        "match_id": state.match_id, "phase": state.phase, "period": state.period, "clock": state.clock,
        "match_ms": state.match_ms, "source_seq": state.source_seq,
        "score": dict(state.score),
        "teams": {s: team_summary(state, s) for s in SIDES},
        "players": player_summary(state),
    }


# --- heavy block (metrics.md §4–§6; publishing.md §2) ------------------------------------------------------------


def pass_network(state: MatchState, side: str) -> dict:
    """Starting XI until the team's first substitution: mean pass-start position per player, links with ≥ 3."""
    team = state.teams[side]
    nodes = [{"player_id": pid, "x": round(sx / n, 1), "y": round(sy / n, 1), "passes": n}
             for pid, (sx, sy, n) in sorted(team.pass_nodes.items()) if n]
    links = [{"from": a, "to": b, "count": c} for (a, b), c in sorted(team.pass_links.items()) if c >= MIN_LINK_PASSES]
    return {"nodes": nodes, "links": links}


def momentum_buckets(state: MatchState) -> list[dict]:
    """Every 5-minute bucket so far: {period, bucket, home, away} weighted points."""
    buckets: dict[tuple[int, int], dict[str, float]] = defaultdict(lambda: {"home": 0.0, "away": 0.0})
    for p in state.period_start_ms:                 # every bucket so far, empty ones as zeros
        length = state.period_length_ms.get(p, state.period_ms if p == state.period else 0)
        for b in range(length // BUCKET_MS + 1):
            buckets[(p, b)]
    for _, period, period_ms, side, weight in state.momentum_log:
        buckets[(period, period_ms // BUCKET_MS)][side] += weight
    return [{"period": p, "bucket": b, "home": v["home"], "away": v["away"]} for (p, b), v in sorted(buckets.items())]


def current_bucket(state: MatchState) -> dict:
    period, bucket = state.period, state.period_ms // BUCKET_MS
    out = {"period": period, "bucket": bucket, "home": 0.0, "away": 0.0}
    for _, p, period_ms, side, weight in state.momentum_log:
        if p == period and period_ms // BUCKET_MS == bucket:
            out[side] += weight
    return out


def heavy(state: MatchState) -> dict:
    out = {
        "momentum_buckets": momentum_buckets(state),
        "pass_network": {s: pass_network(state, s) for s in SIDES},
        "pressing_grid": {s: [row[:] for row in state.teams[s].pressing_grid] for s in SIDES},
        "zones": {s: [row[:] for row in state.teams[s].zones] for s in SIDES},
    }
    if state.has_tracking():
        out["players"] = {pid: {"distance_km": round(p.motion.distance_m / 1000, 2),
                                "top_speed_kmh": round(p.motion.top_speed_kmh, 1), "sprints": p.motion.sprints}
                          for pid, p in sorted(state.players.items()) if p.motion.top_speed_kmh > 0}
    return out
