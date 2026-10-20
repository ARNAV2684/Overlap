# xg.py — xG model
#
# Purpose: compute expected goals for each shot
# Inputs:  a Shot event and, if it has one, the pass named by its key_pass_event_id
# Outputs: xG per shot
# Spec:    stats/specs/metrics.md §1
#
# The shape is the generator's public-anchored model; the intercept and the weak-foot term were refitted on generated
# league shots (metrics.md §1 has the checks).

from __future__ import annotations

import math

PITCH_LENGTH_M = 105.0
PITCH_WIDTH_M = 68.0
GOAL_HALF_WIDTH_M = 3.66
PENALTY_XG = 0.78                     # Opta (CALIBRATION.md)
MAX_XG = 0.95

INTERCEPT = -5.18
B_LOG_D = 1.544
B_ANGLE = 2.231
B_D = -0.167
HEADER = -0.95
WEAK_FOOT = -0.16
SITUATION = {"counter": 0.25, "corner": -0.15, "free_kick": -0.15, "throw_in": -0.10}
ASSIST = {"cutback": 0.40, "through_ball": 0.35, "cross": -0.25}   # checked in this order
BIG_CHANCE_XG = 0.20


def metres(x: float, y: float) -> tuple[float, float]:
    """Team-frame percentages to metres (CONTRACTS.md §1.1)."""
    return x * PITCH_LENGTH_M / 100, y * PITCH_WIDTH_M / 100


def goal_distance_m(x: float, y: float) -> float:
    mx, my = metres(x, y)
    return max(math.hypot(PITCH_LENGTH_M - mx, PITCH_WIDTH_M / 2 - my), 0.5)


def goal_angle(x: float, y: float) -> float:
    """Radians between the lines from the shot spot to the two posts."""
    mx, my = metres(x, y)
    dx = PITCH_LENGTH_M - mx
    centre = PITCH_WIDTH_M / 2
    return abs(math.atan2(centre + GOAL_HALF_WIDTH_M - my, dx) - math.atan2(centre - GOAL_HALF_WIDTH_M - my, dx))


def is_header(shot: dict) -> bool:
    return shot.get("body_part") == "head" or "headed" in shot.get("qualifiers", ())


def assist_type(key_pass: dict | None) -> str | None:
    quals = set(key_pass.get("qualifiers", ())) if key_pass else set()
    return next((a for a in ASSIST if a in quals), None)


def shot_xg(shot: dict, key_pass: dict | None = None) -> float:
    if shot.get("situation") == "penalty":
        return PENALTY_XG
    d = goal_distance_m(shot["x"], shot["y"])
    z = INTERCEPT + B_LOG_D * math.log(d) + B_ANGLE * goal_angle(shot["x"], shot["y"]) + B_D * d
    if is_header(shot):
        z += HEADER
    elif "weak_foot" in shot.get("qualifiers", ()):
        z += WEAK_FOOT
    z += SITUATION.get(shot.get("situation"), 0.0)
    z += ASSIST.get(assist_type(key_pass), 0.0)
    return min(1 / (1 + math.exp(-z)), MAX_XG)
