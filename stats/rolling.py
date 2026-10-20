# rolling.py — Rolling windows
#
# Purpose: compute momentum share, PPDA, pressing rate, press height, shots and tempo over windows within a period,
#          and the last-5-minutes v previous-10-minutes comparisons
# Inputs:  state.MatchState (each team's timelines)
# Outputs: window metrics
# Spec:    stats/specs/windows.md; stats/specs/metrics.md §4–§5, §7
#
# A window at period time `now` holds records with `now − hi < period_ms ≤ now − lo` in the current period: it never
# reaches back past the period's start, and it includes stoppage time.

from __future__ import annotations

from dataclasses import dataclass

from state import MatchState

MIN = 60_000
LAST_5 = (0, 5 * MIN)
LAST_10 = (0, 10 * MIN)
PREVIOUS_10 = (5 * MIN, 15 * MIN)          # the 10 minutes before the last 5 (windows.md §2)
COMPARE_FROM_MS = 15 * MIN

# Minimum samples (metrics.md §7, windows.md §2)
MIN_MOMENTUM_POINTS = 6.0
MIN_PPDA_ACTIONS = 3
MIN_PRESS_ACTIONS = 8
MIN_OPP_PASSES_RECENT = 20
MIN_OPP_PASSES_BASELINE = 40


@dataclass(frozen=True)
class At:
    """Where a window is measured from: the current period and its period_ms."""
    period: int
    period_ms: int


def now(state: MatchState) -> At:
    return At(state.period, state.period_ms)


def _records(state: MatchState, side: str, name: str, at: At, span: tuple[int, int]):
    """Timeline values in the window, newest first. Timelines are in event order, so the scan stops at the window's
    start (or at an earlier period) instead of reading the whole match every second."""
    lo, hi = span
    start, end = at.period_ms - hi, at.period_ms - lo
    for period, pms, value, _ in reversed(state.teams[side].timeline.get(name, ())):
        if period != at.period or pms <= start:
            break
        if pms <= end:
            yield value


def event_ids(state: MatchState, side: str, name: str, at: At, span: tuple[int, int]) -> list[str]:
    """The ids of the timeline's events in the window, oldest first."""
    lo, hi = span
    start, end = at.period_ms - hi, at.period_ms - lo
    out = []
    for period, pms, _, event_id in reversed(state.teams[side].timeline.get(name, ())):
        if period != at.period or pms <= start:
            break
        if pms <= end:
            out.append(event_id)
    return out[::-1]


def total(state: MatchState, side: str, name: str, at: At, span: tuple[int, int]) -> float:
    return sum(_records(state, side, name, at, span))


def count(state: MatchState, side: str, name: str, at: At, span: tuple[int, int]) -> int:
    return sum(1 for _ in _records(state, side, name, at, span))


def duration_min(at: At, span: tuple[int, int]) -> float:
    """The window's true length: shorter than asked for early in a period."""
    lo, hi = span
    return max(min(at.period_ms - lo, hi - lo), 0) / MIN


def momentum_share_pct(state: MatchState, side: str, at: At, span: tuple[int, int]) -> int | None:
    mine = total(state, side, "momentum", at, span)
    both = mine + total(state, state.other(side), "momentum", at, span)
    return round(100 * mine / both) if both >= MIN_MOMENTUM_POINTS else None


def ppda(state: MatchState, side: str, at: At, span: tuple[int, int]) -> float | None:
    actions = count(state, side, "ppda_actions", at, span)
    if actions < MIN_PPDA_ACTIONS:
        return None
    return round(count(state, state.other(side), "passes_own_60", at, span) / actions, 1)


def pressing_rate(state: MatchState, side: str, at: At, span: tuple[int, int], min_opp_passes: int = 1) -> float | None:
    """Our pressures per opponent pass (metrics.md §4)."""
    opp_passes = count(state, state.other(side), "passes", at, span)
    if opp_passes < min_opp_passes or opp_passes == 0:
        return None
    return round(count(state, side, "pressures", at, span) / opp_passes, 2)


def press_height_m(state: MatchState, side: str, at: At, span: tuple[int, int]) -> int | None:
    values = list(_records(state, side, "press_m", at, span))
    return round(sum(values) / len(values)) if len(values) >= MIN_PRESS_ACTIONS else None


def shots(state: MatchState, side: str, at: At, span: tuple[int, int]) -> int:
    return count(state, side, "shots", at, span)


def tempo(state: MatchState, side: str, at: At, span: tuple[int, int]) -> float | None:
    minutes = duration_min(at, span)
    return round(count(state, side, "passes", at, span) / minutes, 1) if minutes > 0 else None


# --- comparisons (windows.md §2) -------------------------------------------------------------------------------


def can_compare(at: At) -> bool:
    return at.period_ms >= COMPARE_FROM_MS


def momentum_change_pp(state: MatchState, side: str, at: At) -> tuple[int, int] | None:
    """(recent share, baseline share) in %, or None without a full comparison or enough points."""
    if not can_compare(at):
        return None
    recent = momentum_share_pct(state, side, at, LAST_5)
    mine = total(state, side, "momentum", at, PREVIOUS_10)
    both = mine + total(state, state.other(side), "momentum", at, PREVIOUS_10)
    if recent is None or both <= 0:
        return None
    return recent, round(100 * mine / both)


def pressing_rate_change(state: MatchState, side: str, at: At) -> tuple[float, float] | None:
    """(recent rate, baseline rate) with the windows.md §2 minimum samples, or None."""
    if not can_compare(at):
        return None
    recent = pressing_rate(state, side, at, LAST_5, MIN_OPP_PASSES_RECENT)
    baseline = pressing_rate(state, side, at, PREVIOUS_10, MIN_OPP_PASSES_BASELINE)
    if recent is None or baseline is None:
        return None
    return recent, baseline
