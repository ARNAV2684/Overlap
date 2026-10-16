# pitch.py — Pitch geometry and coordinate frames
#
# Purpose: the one coordinate helper: pitch size, team frame <-> pitch frame, metres <-> 0-100, goal geometry
# Inputs:  positions in metres, the period and which side attacks east
# Outputs: positions in either frame, distances and angles to goal
# Spec:    generator/specs/movement.md
#
# CONTRACTS.md §1.1: the pitch is 105 x 68 m; coordinates are 0-100 on both axes. The home team attacks east in
# periods 1 and 3. A team attacking east sees north on its left, so for it both frames are identical; a team
# attacking west converts with the 180° rotation. Nobody converts coordinates anywhere else.

from __future__ import annotations

import math

LENGTH = 105.0
WIDTH = 68.0
GOAL_Y = WIDTH / 2
GOAL_HALF_WIDTH = 3.66
GOAL_HEIGHT = 2.44
BOX_DEPTH = 16.5
BOX_HALF_WIDTH = 20.16
SIX_DEPTH = 5.5
SIX_HALF_WIDTH = 9.16
PENALTY_SPOT = 11.0


def attacks_east(home: bool, period: int) -> bool:
    return home == (period in (1, 3))


def to_team(x: float, y: float, east: bool) -> tuple[float, float]:
    """Pitch-frame metres -> team-frame metres for a side attacking east (or west). Its own inverse."""
    return (x, y) if east else (LENGTH - x, WIDTH - y)


def clamp(x: float, y: float) -> tuple[float, float]:
    return min(max(x, 0.0), LENGTH), min(max(y, 0.0), WIDTH)


def pct(x: float, y: float) -> tuple[float, float]:
    """Metres -> the 0-100 scale, rounded to one decimal, clamped to the pitch."""
    x, y = clamp(x, y)
    return round(x / LENGTH * 100, 1), round(y / WIDTH * 100, 1)


def from_pct(px: float, py: float) -> tuple[float, float]:
    return px / 100 * LENGTH, py / 100 * WIDTH


def team_pct(x: float, y: float, east: bool) -> tuple[float, float]:
    """Pitch-frame metres -> team-frame 0-100, as events use."""
    return pct(*to_team(x, y, east))


def goal_distance(tx: float, ty: float) -> float:
    """Team-frame metres to the centre of the opponent's goal."""
    return math.hypot(LENGTH - tx, GOAL_Y - ty)


def goal_angle(tx: float, ty: float) -> float:
    """Visible angle of the opponent's goal mouth (radians) from a team-frame position."""
    dx = max(LENGTH - tx, 0.01)
    a1 = math.atan2(GOAL_Y + GOAL_HALF_WIDTH - ty, dx)
    a2 = math.atan2(GOAL_Y - GOAL_HALF_WIDTH - ty, dx)
    return abs(a1 - a2)


def in_box(tx: float, ty: float) -> bool:
    """Inside the opponent's penalty area (team frame)."""
    return tx >= LENGTH - BOX_DEPTH and abs(ty - GOAL_Y) <= BOX_HALF_WIDTH


def in_own_box(tx: float, ty: float) -> bool:
    return tx <= BOX_DEPTH and abs(ty - GOAL_Y) <= BOX_HALF_WIDTH


def segment_distance(ax: float, ay: float, bx: float, by: float, px: float, py: float) -> tuple[float, float]:
    """(distance from p to segment a-b, how far along it the closest point is, 0-1)."""
    dx, dy = bx - ax, by - ay
    seg2 = dx * dx + dy * dy
    if seg2 == 0:
        return math.hypot(px - ax, py - ay), 0.0
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / seg2))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy)), t
