# test_metrics.py — Metric tests
#
# Purpose: check each formula against the spec's anchors and hand-worked examples
# Inputs:  small hand-made events and frames
# Outputs: pass / fail
# Spec:    stats/specs/metrics.md

from __future__ import annotations

import pytest

import pass_difficulty
import per_event
import whole_match
import xg
from state import MatchState

# --- xG (metrics.md §1) ----------------------------------------------------------------------------------------


def shot(dist_m: float, wide_m: float = 0.0, **kw) -> dict:
    e = {"type": "Shot", "x": (105 - dist_m) / 1.05, "y": (34 + wide_m) / 0.68, "situation": "open_play",
         "body_part": "right_foot", "qualifiers": []}
    e.update(kw)
    return e


@pytest.mark.parametrize("dist, kw, expected", [
    (4.5, {}, 0.36),
    (4.5, {"body_part": "head"}, 0.18),
    (16.5, {}, 0.066),
    (25, {}, 0.023),
])
def test_xg_meets_the_spec_anchors(dist, kw, expected):
    assert xg.shot_xg(shot(dist, **kw)) == pytest.approx(expected, abs=0.006)


def test_penalty_is_078_and_the_cap_holds():
    assert xg.shot_xg(shot(11, situation="penalty")) == 0.78
    assert xg.shot_xg(shot(0.2)) <= xg.MAX_XG


def test_xg_falls_with_distance_and_angle_and_rises_with_a_cutback():
    assert xg.shot_xg(shot(6)) > xg.shot_xg(shot(12)) > xg.shot_xg(shot(20))
    assert xg.shot_xg(shot(12)) > xg.shot_xg(shot(12, wide_m=10))
    cutback = {"qualifiers": ["cutback", "cross"]}             # cutback wins over cross
    assert xg.assist_type(cutback) == "cutback"
    assert xg.shot_xg(shot(12), cutback) > xg.shot_xg(shot(12)) > xg.shot_xg(shot(12), {"qualifiers": ["cross"]})


def test_weak_foot_counts_only_for_a_foot_shot():
    assert xg.shot_xg(shot(12, qualifiers=["weak_foot"])) < xg.shot_xg(shot(12))
    head = {"body_part": "head"}
    assert xg.shot_xg(shot(8, qualifiers=["weak_foot", "headed"], **head)) == xg.shot_xg(shot(8, **head))


# --- passes (metrics.md §2) ------------------------------------------------------------------------------------


def a_pass(x, y, end_x, end_y, **kw) -> dict:
    e = {"type": "Pass", "x": x, "y": y, "end_x": end_x, "end_y": end_y, "outcome": "success", "qualifiers": []}
    e.update(kw)
    return e


def test_difficulty_rises_for_lofted_through_and_pressured_passes():
    easy = a_pass(40, 50, 45, 50)
    assert 0 < pass_difficulty.difficulty(easy) < 0.15
    assert pass_difficulty.difficulty(a_pass(40, 50, 45, 50, under_pressure=True)) > pass_difficulty.difficulty(easy)
    assert pass_difficulty.difficulty(a_pass(40, 50, 75, 50, qualifiers=["through_ball"])) > 0.3
    ground, lofted = a_pass(30, 10, 80, 90), a_pass(30, 10, 80, 90, qualifiers=["long_ball"])
    assert pass_difficulty.difficulty(lofted) > pass_difficulty.difficulty(ground) + 0.2


def test_progressive_passes():
    assert pass_difficulty.is_progressive(a_pass(50, 50, 80, 50))
    assert not pass_difficulty.is_progressive(a_pass(50, 50, 55, 50))                  # not 25 % closer
    assert not pass_difficulty.is_progressive(a_pass(20, 50, 60, 50))                  # starts before x = 35
    assert not pass_difficulty.is_progressive(a_pass(50, 50, 80, 50, outcome="fail"))
    assert not pass_difficulty.is_progressive(a_pass(50, 50, 80, 50, qualifiers=["free_kick"]))


# --- speed and distance (metrics.md §3) ------------------------------------------------------------------------


def test_a_sprint_needs_a_full_second_at_25_2_kmh():
    m = per_event.Motion()
    speeds = [20, 26, 27, 28, 29, 30, 31, 20, 26, 26, 20]
    sprints = [m.add(s, 10.0 * i) for i, s in enumerate(speeds)]
    assert sum(sprints) == 1 and m.sprints == 1 and m.top_speed_kmh == 31
    assert m.distance_m == 100.0 and m.sprint_m == pytest.approx(60.0)


# --- state, possession, pressing, momentum (metrics.md §4–§7) -------------------------------------------------


def setup() -> dict:
    def lineup(t):
        return [{"player_id": f"{t}-{n:02d}", "name": f"{t} {n}", "pos": "GK" if n == 1 else "CM", "shirt": n}
                for n in range(1, 12)]
    return {"match_id": "SYN-0001", "teams": {
        "home": {"team_id": "AAA", "name": "A", "lineup": lineup("AAA"), "bench": []},
        "away": {"team_id": "BBB", "name": "B", "lineup": lineup("BBB"), "bench": []}}}


class Feed:
    def __init__(self):
        self.state = MatchState(setup())
        self.seq = 0

    def __call__(self, ms: int, poss: int, team: str | None, kind: str, **kw) -> dict:
        self.seq += 1
        e = {"event_id": f"SYN-0001-{self.seq:05d}", "match_id": "SYN-0001", "seq": self.seq,
             "possession_id": poss, "period": 1, "period_ms": ms, "match_ms": ms, "clock": "0:00", "type": kind}
        if team:
            e.update(team_id=team, player_id=f"{team}-05")
        e.update(kw)
        return self.state.apply(e)


def test_possession_counts_time_from_each_possession_to_the_next():
    f = Feed()
    f(0, 0, None, "PeriodStart")
    f(0, 1, "AAA", "Pass", x=40, y=50, end_x=50, end_y=50, outcome="success")
    f(60000, 2, "BBB", "BallRecovery", x=30, y=50)
    f(61000, 2, "BBB", "Pass", x=30, y=50, end_x=40, end_y=50, outcome="success")
    f(90000, 3, "AAA", "Pass", x=40, y=50, end_x=50, end_y=50, outcome="success")
    f(120000, 3, None, "PeriodEnd")
    s = whole_match.summary(f.state)
    assert f.state.possession_ms("home") == 90000 and f.state.possession_ms("away") == 30000
    assert s["teams"]["home"]["possession_pct"] == 75


def test_ppda_counts_opponent_passes_in_their_60_and_our_actions_from_40():
    f = Feed()
    for i in range(9):
        f(i * 1000, 1, "BBB", "Pass", x=50, y=50, end_x=55, end_y=50, outcome="success")
    f(10000, 1, "BBB", "Pass", x=70, y=50, end_x=75, end_y=50, outcome="success")      # x > 60: not counted
    f(11000, 2, "AAA", "Tackle", x=45, y=50, outcome="fail")
    f(12000, 2, "AAA", "Interception", x=50, y=50)
    f(13000, 2, "AAA", "Foul", x=55, y=50)
    f(14000, 2, "AAA", "Tackle", x=30, y=50, outcome="success")                         # x < 40: not counted
    home = whole_match.team_summary(f.state, "home")
    assert home["ppda"] == 3.0
    assert home["press_height_m"] is None and "press_height_m" in home["low_sample"]  # 4 actions, below 8


def test_momentum_credits_a_card_to_the_other_team_and_a_goal_once():
    f = Feed()
    f(1000, 1, "AAA", "Pass", event_id="SYN-0001-K", x=80, y=50, end_x=90, end_y=50, outcome="success")
    f.state.passes["KP"] = {"event_id": "KP", "player_id": "AAA-07", "qualifiers": []}
    f(2000, 1, "AAA", "Shot", x=90, y=50, situation="open_play", body_part="right_foot", qualifiers=[],
      shot_outcome="goal", key_pass_event_id="KP", assisted_by="AAA-07")
    f(3000, 2, "BBB", "Card", card="yellow")
    home, away = f.state.teams["home"], f.state.teams["away"]
    assert home.momentum == 5 + 2 + 1 and away.momentum == 0
    assert f.state.score == {"home": 1, "away": 0}
    assert f.state.players["AAA-07"].counts["assists"] == 1


def test_small_samples_are_null_never_zero():
    f = Feed()
    f(1000, 1, "AAA", "Pass", x=40, y=50, end_x=45, end_y=50, outcome="success")
    home = whole_match.team_summary(f.state, "home")
    assert home["pass_completion_pct"] is None and home["ppda"] is None
    assert {"pass_completion_pct", "ppda", "momentum_share_match_pct"} <= set(home["low_sample"])
