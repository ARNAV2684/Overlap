# pass_difficulty.py — Pass difficulty
#
# Purpose: rate every pass from 0 to 1, and tell progressive passes apart
# Inputs:  Pass events
# Outputs: difficulty, length and progressive flag per pass
# Spec:    stats/specs/metrics.md §2
#
# Difficulty is 1 − P(complete), an expected-completion model fitted on generated passes, using event fields only.

from __future__ import annotations

import math

from xg import goal_distance_m, metres

INTERCEPT = 2.10
B_LENGTH = 0.026
UNDER_PRESSURE = -0.30
B_PROGRESS = -0.013
LOFTED = -2.44
THROUGH_BALL = -1.61
SET_PIECE = -0.85
ENDS_IN_FINAL_THIRD = -0.31

LOFTED_QUALIFIERS = frozenset({"long_ball", "cross", "switch_of_play"})
SET_PIECE_QUALIFIERS = frozenset({"corner", "free_kick", "goal_kick", "throw_in"})
FINAL_THIRD_X = 66.7
DIFFICULT = 0.5
PROGRESSIVE_FROM_X = 35.0
PROGRESSIVE_SHARE = 0.75          # ends at most 75 % as far from goal as it started


def length_m(p: dict) -> float:
    (x0, y0), (x1, y1) = metres(p["x"], p["y"]), metres(p["end_x"], p["end_y"])
    return math.hypot(x1 - x0, y1 - y0)


def p_complete(p: dict) -> float:
    quals = set(p.get("qualifiers", ()))
    z = INTERCEPT + B_LENGTH * length_m(p) + B_PROGRESS * (p["end_x"] - p["x"]) * 1.05
    if p.get("under_pressure"):
        z += UNDER_PRESSURE
    if quals & LOFTED_QUALIFIERS:
        z += LOFTED
    if "through_ball" in quals:
        z += THROUGH_BALL
    if quals & SET_PIECE_QUALIFIERS:
        z += SET_PIECE
    if p["end_x"] >= FINAL_THIRD_X:
        z += ENDS_IN_FINAL_THIRD
    return 1 / (1 + math.exp(-z))


def difficulty(p: dict) -> float:
    return 1 - p_complete(p)


def is_set_piece(p: dict) -> bool:
    return bool(set(p.get("qualifiers", ())) & SET_PIECE_QUALIFIERS)


def is_progressive(p: dict) -> bool:
    """A completed open-play pass from x ≥ 35 that ends at least 25 % closer to the goal centre."""
    if p.get("outcome") != "success" or is_set_piece(p) or p["x"] < PROGRESSIVE_FROM_X:
        return False
    return goal_distance_m(p["end_x"], p["end_y"]) <= PROGRESSIVE_SHARE * goal_distance_m(p["x"], p["y"])
