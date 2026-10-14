"""Pitch geometry, frames and clock, exactly as CONTRACTS.md §1 defines them.

Internally everything is in pitch-frame metres: x 0 (west goal line) → 105 (east), y 0 (north touchline) → 68.
Outputs use 0–100 on both axes.
"""

from __future__ import annotations

import math

LENGTH = 105.0
WIDTH = 68.0
GOAL_HALF_WIDTH = 3.66  # metres
GOAL_HEIGHT = 2.44


def attacks_east(is_home: bool, period: int) -> bool:
    """Home attacks east in periods 1 and 3, west in periods 2 and 4."""
    home_east = period in (1, 3)
    return home_east if is_home else not home_east


def to_team_m(x: float, y: float, east: bool) -> tuple[float, float]:
    """Pitch-frame metres → the acting team's frame, still in metres (180° rotation if attacking west)."""
    return (x, y) if east else (LENGTH - x, WIDTH - y)


def from_team_m(x: float, y: float, east: bool) -> tuple[float, float]:
    """The acting team's frame in metres → pitch-frame metres. The rotation is its own inverse."""
    return to_team_m(x, y, east)


def pct(x_m: float, y_m: float) -> tuple[float, float]:
    """Metres → 0–100 coordinates, rounded to 1 decimal and clamped."""
    return (
        round(min(100.0, max(0.0, x_m / LENGTH * 100.0)), 1),
        round(min(100.0, max(0.0, y_m / WIDTH * 100.0)), 1),
    )


def clamp_m(x: float, y: float) -> tuple[float, float]:
    return min(LENGTH, max(0.0, x)), min(WIDTH, max(0.0, y))


def dist(ax: float, ay: float, bx: float, by: float) -> float:
    return math.hypot(ax - bx, ay - by)


def clock(period: int, period_ms: int) -> str:
    """Display clock, e.g. "62:14", "45+2:10", "90+1:05". Display only: never sort or compute with it."""
    base_min = {1: 0, 2: 45, 3: 90, 4: 105}[period]
    end_min = {1: 45, 2: 90, 3: 105, 4: 120}[period]
    total_s = base_min * 60 + period_ms // 1000
    minute, second = divmod(total_s, 60)
    if minute >= end_min:
        return f"{end_min}+{minute - end_min}:{second:02d}"
    return f"{minute}:{second:02d}"
