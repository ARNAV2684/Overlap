# test_windows.py — Window tests
#
# Purpose: check windows stay inside a period, include stoppage time, report their true length, and that comparisons
#          wait for a full window
# Inputs:  small hand-made events
# Outputs: pass / fail
# Spec:    stats/specs/windows.md

from __future__ import annotations

import rolling
from state import MatchState

MIN = 60_000


def setup() -> dict:
    def lineup(t):
        return [{"player_id": f"{t}-{n:02d}", "name": f"{t} {n}", "pos": "CM", "shirt": n} for n in range(1, 12)]
    return {"match_id": "SYN-0001", "teams": {
        "home": {"team_id": "AAA", "name": "A", "lineup": lineup("AAA"), "bench": []},
        "away": {"team_id": "BBB", "name": "B", "lineup": lineup("BBB"), "bench": []}}}


class Feed:
    def __init__(self):
        self.state = MatchState(setup())
        self.seq = 0
        self.half_ms = 47 * MIN                # the first half ran to 47:00

    def __call__(self, period: int, period_ms: int, team: str | None, kind: str, **kw) -> None:
        self.seq += 1
        match_ms = period_ms if period == 1 else self.half_ms + period_ms
        e = {"event_id": f"SYN-0001-{self.seq:05d}", "match_id": "SYN-0001", "seq": self.seq, "possession_id": 1,
             "period": period, "period_ms": period_ms, "match_ms": match_ms, "clock": "0:00", "type": kind}
        if team:
            e.update(team_id=team, player_id=f"{team}-05")
        e.update(kw)
        self.state.apply(e)


def shot(f: Feed, period: int, period_ms: int, team: str = "AAA") -> None:
    f(period, period_ms, team, "Shot", x=88, y=50, situation="open_play", body_part="right_foot", qualifiers=[],
      shot_outcome="missed")


def test_a_window_early_in_the_second_half_holds_only_second_half_events():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    shot(f, 1, 44 * MIN)
    shot(f, 1, 46 * MIN)                      # stoppage time of the first half
    f(1, 47 * MIN, None, "PeriodEnd")
    f(2, 0, None, "PeriodStart")
    shot(f, 2, 2 * MIN)
    at = rolling.now(f.state)
    assert at.period == 2 and at.period_ms == 2 * MIN
    assert rolling.shots(f.state, "home", at, rolling.LAST_10) == 1
    assert rolling.duration_min(at, rolling.LAST_10) == 2.0


def test_stoppage_time_is_inside_the_window():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    shot(f, 1, 44 * MIN)
    shot(f, 1, 46 * MIN)
    at = rolling.now(f.state)
    assert rolling.shots(f.state, "home", at, rolling.LAST_5) == 2


def test_windows_are_half_open_at_their_start():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    shot(f, 1, 5 * MIN)
    shot(f, 1, 10 * MIN)
    at = rolling.now(f.state)
    assert rolling.shots(f.state, "home", at, rolling.LAST_5) == 1       # (5, 10]: the 5:00 shot is out


def test_comparisons_wait_for_15_minutes_of_the_period():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for m in range(1, 14):
        shot(f, 1, m * MIN)
    assert rolling.momentum_change_pp(f.state, "home", rolling.now(f.state)) is None
    for m in range(14, 20):
        shot(f, 1, m * MIN)
    f(1, 19 * MIN, "BBB", "TakeOn", x=50, y=50, outcome="success")
    recent, baseline = rolling.momentum_change_pp(f.state, "home", rolling.now(f.state))
    assert recent == round(100 * 7.5 / 8.5) and baseline == 100


def test_pressing_rate_and_ppda_need_their_minimum_samples():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for i in range(10):
        f(1, (i + 1) * 20_000, "BBB", "Pass", x=50, y=50, end_x=55, end_y=50, outcome="success")
    for i in range(5):
        f(1, (i + 1) * 30_000, "AAA", "Pressure", x=50, y=50, target_player_id="BBB-05")
    f(1, 200_000, "AAA", "Tackle", x=50, y=50, outcome="fail")
    at = rolling.now(f.state)
    assert rolling.pressing_rate(f.state, "home", at, rolling.LAST_10) == 0.5
    assert rolling.ppda(f.state, "home", at, rolling.LAST_10) is None            # 1 defensive action, below 3
    assert rolling.pressing_rate(f.state, "home", at, rolling.LAST_5, rolling.MIN_OPP_PASSES_RECENT) is None
