# test_triggers.py — Trigger tests
#
# Purpose: check that each trigger fires exactly when it should: rules, warm-ups, cooldowns, order, no look-ahead
# Inputs:  small hand-made events; the generated KES v ORR fixture
# Outputs: pass / fail
# Spec:    stats/specs/triggers.md; CONTRACTS.md §10.1

from __future__ import annotations

from pathlib import Path

import main
import triggers
from state import MatchState

MIN = 60_000
FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"


def setup() -> dict:
    def lineup(t):
        return [{"player_id": f"{t}-{n:02d}", "name": f"{t} {n}", "pos": "GK" if n == 1 else "ST", "shirt": n}
                for n in range(1, 12)]
    return {"match_id": "SYN-0001", "teams": {
        "home": {"team_id": "AAA", "name": "Alpha", "lineup": lineup("AAA"), "bench": []},
        "away": {"team_id": "BBB", "name": "Beta", "lineup": lineup("BBB"), "bench": []}}}


class Feed:
    """Applies hand-made events and evaluates triggers after each, as the pipeline does."""

    def __init__(self):
        self.state = MatchState(setup())
        self.triggers = triggers.Triggers(self.state)
        self.seq = 0
        self.fired: list[triggers.Fired] = []

    def __call__(self, period: int, period_ms: int, team: str | None, kind: str, player: int = 9, **kw):
        self.seq += 1
        e = {"event_id": f"SYN-0001-{self.seq:05d}", "match_id": "SYN-0001", "seq": self.seq,
             "possession_id": self.seq, "period": period, "period_ms": period_ms,
             "match_ms": period_ms + (0 if period == 1 else 47 * MIN), "clock": "0:00", "type": kind}
        if team:
            e.update(team_id=team, player_id=f"{team}-{player:02d}")
        e.update(kw)
        numbers = self.state.apply(e)
        new = self.triggers.evaluate(e, numbers)
        self.fired += new
        return [f.trigger for f in new]


def shot(f: Feed, period: int, ms: int, team: str = "AAA", outcome: str = "missed", dist_x: float = 80,
         situation: str = "open_play", player: int = 9):
    return f(period, ms, team, "Shot", player=player, x=dist_x, y=50, situation=situation, body_part="right_foot",
             qualifiers=[], shot_outcome=outcome)


def test_goal_milestone_and_order():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    assert shot(f, 1, 1 * MIN, outcome="goal", dist_x=95) == ["goal"]                     # a goal is never a big chance
    assert shot(f, 1, 2 * MIN, outcome="goal", dist_x=95) == ["goal", "milestone"]       # his 2nd
    assert shot(f, 1, 3 * MIN, outcome="goal", dist_x=95) == ["goal", "milestone"]       # 3rd
    assert shot(f, 1, 4 * MIN, outcome="goal", dist_x=95) == ["goal"]                     # 4th: no milestone


def test_big_chance_needs_xg_0_20_and_no_goal():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    assert shot(f, 1, MIN, dist_x=95) == ["big_chance"]          # about 5 m out, missed
    assert shot(f, 1, 2 * MIN, dist_x=70) == []                   # about 31 m: low xG


def test_penalty_fires_only_when_missed_or_saved():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    assert shot(f, 1, MIN, outcome="saved", situation="penalty", dist_x=89.5) == ["penalty"]
    assert shot(f, 1, 2 * MIN, outcome="goal", situation="penalty", dist_x=89.5) == ["goal"]


def test_red_card_is_about_the_carded_team():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    assert f(1, MIN, "BBB", "Card", card="yellow") == []
    assert f(1, 2 * MIN, "BBB", "Card", card="second_yellow") == ["red_card"]
    assert f.fired[-1].side == "away"


def test_shot_cluster_warm_up_window_and_cooldown():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for m in (1, 2, 4):                                          # three shots inside the first 5 minutes
        shot(f, 1, m * MIN)
    assert not any(x.trigger == "shot_cluster" for x in f.fired)  # warm-up: none before 5:00
    assert "shot_cluster" in shot(f, 1, 5 * MIN + 1000)          # 2:00, 4:00 and 5:01 are in (0:01, 5:01]
    assert "shot_cluster" not in shot(f, 1, 6 * MIN)             # cooldown
    assert "shot_cluster" not in shot(f, 1, 10 * MIN)            # 4:59 after the last one: still cooling
    shot(f, 1, 10 * MIN + 500)
    assert "shot_cluster" in shot(f, 1, 10 * MIN + 1000)         # exactly 5:00 later: allowed


def test_a_cluster_never_counts_the_other_team_or_period():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    shot(f, 1, 44 * MIN)
    shot(f, 1, 45 * MIN)
    f(1, 46 * MIN, None, "PeriodEnd")
    f(2, 0, None, "PeriodStart")
    shot(f, 2, 6 * MIN, team="BBB")
    assert "shot_cluster" not in shot(f, 2, 6 * MIN + 1000)


def test_momentum_swing_needs_a_rise_and_the_comparison_warm_up():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for m in range(1, 15):                                       # Beta dominates the early minutes
        f(1, m * MIN, "BBB", "TakeOn", outcome="success", x=60, y=50)
    for s in range(15, 20):                                      # then Alpha shoots repeatedly
        shot(f, 1, s * MIN, dist_x=70)
    swings = [x for x in f.fired if x.trigger == "momentum_swing"]
    assert swings and swings[0].side == "home" and swings[0].event["period_ms"] >= 15 * MIN
    assert swings[0].data["recent_pct"] >= 60


def test_press_change_compares_pressures_per_opponent_pass():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for i in range(60):                                          # baseline: 5:00-15:00, few pressures
        f(1, 5 * MIN + i * 10_000, "BBB", "Pass", x=40, y=50, end_x=45, end_y=50, outcome="success")
        if i % 6 == 0:
            f(1, 5 * MIN + i * 10_000 + 1, "AAA", "Pressure", x=60, y=50, target_player_id="BBB-05")
    for i in range(30):                                          # recent: 15:00-20:00, a pressure on every pass
        f(1, 15 * MIN + i * 10_000, "BBB", "Pass", x=40, y=50, end_x=45, end_y=50, outcome="success")
        f(1, 15 * MIN + i * 10_000 + 1, "AAA", "Pressure", x=60, y=50, target_player_id="BBB-05")
    press = [x for x in f.fired if x.trigger == "press_change"]
    assert len(press) == 1 and press[0].side == "home" and press[0].data["direction"] == "higher"


def test_the_fixture_fires_pranavs_shot_cluster():
    clusters = [m for m in main.replay_moments(FIXTURE)["SYN-1017"] if m["evidence"]["trigger"] == "shot_cluster"]
    ids = [m["evidence"]["event_ids"] for m in clusters]
    assert ["SYN-1017-01477", "SYN-1017-01542", "SYN-1017-01592"] in ids
