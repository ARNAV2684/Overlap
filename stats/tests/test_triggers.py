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


# --- insight triggers (triggers.md §2.8–§2.10) --------------------------------------------------------------------

def test_head_to_head_waits_for_20_minutes_a_clear_lead_and_a_new_leader():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    shot(f, 1, 5 * MIN, team="BBB")                                            # Beta's forward gets going
    for ms in (6, 7, 8):
        assert "head_to_head" not in shot(f, 1, ms * MIN, outcome="saved")      # before 20 minutes
    fired = shot(f, 1, 21 * MIN, outcome="saved")
    assert "head_to_head" in fired
    h2h = next(x for x in f.fired if x.trigger == "head_to_head")
    assert (h2h.side, h2h.data["role"], h2h.data["player"], h2h.data["rival"]) == ("home", "forward", "AAA-09", "BBB-09")
    assert "head_to_head" not in shot(f, 1, 22 * MIN, outcome="saved")          # same leader: nothing new
    for ms in (23, 24, 25, 26):
        assert "head_to_head" not in shot(f, 1, ms * MIN, team="BBB", outcome="goal")   # new leader, in the cooldown
    assert "head_to_head" in shot(f, 1, 37 * MIN, team="BBB", outcome="goal")   # after 15 minutes, Beta's turn


def test_connection_needs_eight_passes_in_15_minutes_and_a_new_pair():
    f = Feed()
    f(1, 0, None, "PeriodStart")

    def pass_(ms: int, a: int = 4, b: int = 7):
        return f(1, ms, "AAA", "Pass", player=a, x=40, y=50, end_x=70, end_y=50, outcome="success",
                 receiver_id=f"AAA-{b:02d}", body_part="right_foot", qualifiers=[])

    for i in range(7):
        assert "connection" not in pass_(15 * MIN + i * 1000)                  # seven passes: not yet
    assert "connection" in pass_(15 * MIN + 8000)
    c = next(x for x in f.fired if x.trigger == "connection")
    assert c.data["pair"] == ("AAA-04", "AAA-07") and len(c.data["passes"]) == 8
    for i in range(10):
        assert "connection" not in pass_(16 * MIN + i * 1000)                  # same pair: nothing new


def test_a_connection_never_counts_passes_from_before_its_window():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for i in range(6):
        f(1, MIN + i * 1000, "AAA", "Pass", player=4, x=40, y=50, end_x=70, end_y=50, outcome="success",
          receiver_id="AAA-07", body_part="right_foot", qualifiers=[])
    for i in range(3):
        fired = f(1, 20 * MIN + i * 1000, "AAA", "Pass", player=4, x=40, y=50, end_x=70, end_y=50,
                  outcome="success", receiver_id="AAA-07", body_part="right_foot", qualifiers=[])
        assert "connection" not in fired


def test_workhorse_from_25_minutes_with_a_lead_and_a_cooldown():
    f = Feed()
    f(1, 0, None, "PeriodStart")
    for ms in (2, 3, 4):
        assert "workhorse" not in f(1, ms * MIN, "AAA", "Tackle", player=5, outcome="success")
    assert "workhorse" in f(1, 26 * MIN, "AAA", "Tackle", player=5, outcome="success")
    w = next(x for x in f.fired if x.trigger == "workhorse")
    assert (w.side, w.data["player"]) == ("home", "AAA-05")
    for ms in range(27, 33):
        assert "workhorse" not in f(1, ms * MIN, "BBB", "Tackle", player=5, outcome="success")   # cooldown
    assert "workhorse" in f(1, 42 * MIN, "BBB", "Tackle", player=5, outcome="success")
    assert f.fired[-1].data["player"] == "BBB-05"


def test_the_role_and_work_scores_match_the_web_cards():
    s = MatchState(setup())
    p = s.players["AAA-09"]
    p.counts.update(goals=1, on_target=2, shots=3, take_ons_completed=2, key_passes=1)
    p.xg = 0.5
    assert triggers.role_score("forward", p) == 3 + 2 + 2 + 1.5 + 1 + 1
    p.counts.update(tackles_won=2, aerials_won=1, recoveries=3, interceptions=1, pressures=10)
    assert triggers.work_score(p) == 1.5 * (2 + 2 + 1) + 3 + 1 + 0.3 * 10
    assert [triggers.role_of(x) for x in ("GK", "RWB", "AM", "LW", "??")] == \
        ["keeper", "defender", "midfielder", "forward", "midfielder"]
