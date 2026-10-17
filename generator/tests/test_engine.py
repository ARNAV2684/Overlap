# test_engine.py — Engine pieces
#
# Purpose: check the coordinate helper, the shot model, match conditions and the match setup the engine sends
# Inputs:  small hand-made positions; one seeded match without tracking
# Outputs: pass / fail
# Spec:    generator/specs/engine.md, generator/specs/actions.md §4, generator/specs/movement.md

from __future__ import annotations

import math

import pytest

import config
import engine
import movement
import outcomes
import pitch
import world


@pytest.fixture(scope="module")
def clubs():
    _, loaded = world.load_reference_clubs()
    return {c.team_id: c for c in loaded}


# --- pitch.py ----------------------------------------------------------------------------------------------------


def test_team_frame_is_its_own_inverse():
    for x, y in ((0, 0), (12.3, 50.1), (105, 68)):
        assert pitch.to_team(*pitch.to_team(x, y, False), False) == pytest.approx((x, y))
        assert pitch.to_team(x, y, True) == (x, y)


def test_left_winger_attacking_west_renders_bottom():
    # CONTRACTS.md §4: team-frame (76, 10) for a side attacking west is pitch-frame (24, 90)
    x, y = pitch.from_pct(76, 10)
    assert pitch.pct(*pitch.to_team(x, y, False)) == (24.0, 90.0)


def test_home_attacks_east_in_odd_periods():
    assert pitch.attacks_east(True, 1) and not pitch.attacks_east(True, 2)
    assert not pitch.attacks_east(False, 1) and pitch.attacks_east(False, 2)


# --- the shot model ----------------------------------------------------------------------------------------------


def shot(d: float, wide: float = 0.0, **kw) -> float:
    args = {"header": False, "weak": False, "weak_foot": 3, "situation": "open_play", "assist": "none",
            "defenders_in_way": 0, "keeper_off_line_m": 0.0}
    args.update(kw)
    return outcomes.xg(pitch.LENGTH - d, pitch.GOAL_Y + wide, **args)


def test_penalty_is_078():
    assert shot(11, situation="penalty") == config.PENALTY_XG == 0.78


def test_xg_falls_with_distance_and_angle():
    assert shot(4.5) > shot(11) > shot(16.5) > shot(25) > shot(35)
    assert shot(11) > shot(11, wide=12)


def test_xg_anchor_points():
    # CALIBRATION.md anchors; measured values are recorded in config.py
    assert 0.35 <= shot(4.5) <= 0.50
    assert 0.06 <= shot(16.5) <= 0.10
    assert 0.02 <= shot(25) <= 0.04


def test_headers_weak_foot_and_defenders_lower_xg():
    assert shot(4.5, header=True) < 0.25 < shot(4.5)
    assert shot(11, weak=True, weak_foot=2) < shot(11, weak=True, weak_foot=5) == shot(11)
    assert shot(11, defenders_in_way=2) < shot(11)
    assert shot(11, assist="cutback") > shot(11)


# --- conditions and the setup ------------------------------------------------------------------------------------


def test_setup_carries_conditions(clubs):
    m = engine.Match(clubs["CAL"], clubs["DTN"], match_id="SYN-0011", seed=11, kickoff_utc="2026-10-24T19:00:00Z")
    c = m.setup["conditions"]
    assert set(c) == {"temperature_c", "precipitation", "wind_ms", "attendance"}
    assert c["precipitation"] in ("none", "light", "heavy")
    assert c["wind_ms"] >= 0 and isinstance(c["attendance"], int)
    assert list(m.setup) == ["match_id", "seed", "competition", "season_id", "venue", "kickoff_utc", "conditions",
                             "storylines", "teams"]
    assert set(m.setup["teams"]["home"]["style"]) == {"press_intensity", "directness", "width"}


def test_random_streams_are_independent():
    a = engine.stream(5, "decisions").random()
    b = engine.stream(5, "outcomes").random()
    assert a != b and engine.stream(5, "decisions").random() == a


def test_a_match_has_both_teams_playing(clubs):
    r = engine.play(clubs, "CAL", "DTN", match_id="SYN-0012", seed=12, keep_frames=False)
    s = r.summary
    for side in ("home", "away"):
        assert s[side]["passes"] > 200
        assert 0.3 < s[side]["possession"] < 0.8
    assert math.isclose(s["home"]["possession"] + s["away"]["possession"], 1.0, abs_tol=0.01)
    assert r.events[0]["type"] == "PeriodStart" and r.events[-1]["type"] == "PeriodEnd"


# --- shape (movement.md §1) and the counter window (actions.md §2) -----------------------------------------------


def _frozen(clubs, poss: str, ball_pct: tuple[float, float]):
    """CAL v DTN at kickoff time, `poss` on the ball at `ball_pct` in that side's team frame, everyone on his anchor."""
    m = engine.Match(clubs["CAL"], clubs["DTN"], match_id="SYN-0060", seed=60, kickoff_utc="2026-10-24T19:00:00Z")
    m._update_style()
    for side in ("home", "away"):
        for b in m.on_pitch(side):
            ax, ay = movement.ANCHORS[m.formation[side]][b.slot_index]
            b.x, b.y = pitch.to_team(*pitch.from_pct(ax, ay), m.east(side))
    m._update_lines()
    m.poss_side, m.mode = poss, "held"
    m.ball_x, m.ball_y = pitch.to_team(*pitch.from_pct(*ball_pct), m.east(poss))
    return m


def _target_pct(m, b):
    return pitch.team_pct(*m.shape_of(b), m.east(b.side))


def test_a_five_four_one_supports_its_carrier_in_the_final_third(clubs):
    m = _frozen(clubs, "away", (75, 50))
    m.offside_line["away"] = 88.0
    ahead = [b.slot for b in m.on_pitch("away") if not b.is_gk and _target_pct(m, b)[0] >= config.ZONE_X[1]]
    assert len(ahead) >= 3 and "ST" in ahead and {"RM", "LM"} <= set(ahead)


def test_a_low_block_is_more_compact_than_a_high_line(clubs):
    def depth(m, side):
        xs = [_target_pct(m, b)[0] for b in m.on_pitch(side) if not b.is_gk]
        return max(xs) - min(xs)

    amh_defending = depth(_frozen(clubs, "home", (50, 50)), "away")
    skh_defending = depth(_frozen(clubs, "away", (50, 50)), "home")
    assert amh_defending < skh_defending


def test_the_back_line_stays_goal_side_of_the_ball(clubs):
    m = _frozen(clubs, "home", (60, 50))           # CAL on the ball 40 % from DTN's goal
    for b in m.on_pitch("away"):
        if not b.is_gk and movement.ANCHORS[m.formation["away"]][b.slot_index][0] < 40:
            assert _target_pct(m, b)[0] <= 40 - config.GOAL_SIDE_PCT + 1e-6


def test_a_counter_starts_only_from_a_regain_in_the_own_half(clubs):
    m = _frozen(clubs, "away", (40, 50))
    m.last_regain["away"] = (m.match_ms, 30.0)
    assert m.in_counter("away")
    m.last_regain["away"] = (m.match_ms, 60.0)       # a high regain is a high turnover, not a counter
    assert not m.in_counter("away")
