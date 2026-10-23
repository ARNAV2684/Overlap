# test_season.py — Season document tests
#
# Purpose: the season document adds up: table and scores equal the matches, expected points are a proper
#          distribution, percentiles stay inside their group, the same run gives the same bytes
# Inputs:  tests/fixtures/SYN-1017 as a one-match run; data/seasons/S1 when it has been generated (skipped otherwise)
# Outputs: pass / fail
# Spec:    stats/specs/season.md

from __future__ import annotations

import json
from pathlib import Path

import pytest

import season

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"
S1 = Path(__file__).resolve().parents[2] / "data" / "seasons" / "S1"
WORLD = Path(__file__).resolve().parents[2] / "data" / "generated" / "world" / "S1.json"


@pytest.fixture(scope="module")
def one() -> dict:
    return season.build(FIXTURE)


def test_goal_distribution_and_result_probabilities():
    assert season.goal_distribution([]) == [1.0]
    assert season.goal_distribution([0.5, 0.5]) == pytest.approx([0.25, 0.5, 0.25])
    win, draw, loss = season.win_draw_loss([0.5], [])
    assert (win, draw, loss) == pytest.approx((0.5, 0.5, 0.0))
    win, draw, loss = season.win_draw_loss([0.3, 0.2, 0.1], [0.4, 0.05])
    assert win + draw + loss == pytest.approx(1.0) and min(win, draw, loss) > 0


def test_rank_helpers():
    assert season.spearman([1, 2, 3, 4], [10, 20, 30, 40]) == 1.0
    assert season.spearman([1, 2, 3, 4], [4, 3, 2, 1]) == -1.0
    assert season.spearman([1, 2], [1, 2]) is None
    assert season.rank_of(5, [1, 5, 9]) == 2 and season.rank_of(5, [1, 5, 9], higher_first=False) == 2
    assert season.percentile(3, [1, 2, 3, 4]) == 75


def test_one_match_adds_up(one):
    assert one["kind"] == "season" and one["built_from"]["matches"] == 1
    (m,) = one["matches"]
    assert m["score"] == {"home": 3, "away": 0}
    home, away = (next(t for t in one["teams"] if t["team_id"] == m[s]) for s in ("home", "away"))
    assert home["table"]["points"] == 3 and away["table"]["points"] == 0
    assert home["table"]["goals_for"] == 3 == away["table"]["goals_against"]
    assert sum(m["win_probability"].values()) == pytest.approx(1.0, abs=0.002)
    assert m["xpts"]["home"] + m["xpts"]["away"] <= 3.0 + 1e-9
    assert len(home["shots_for"]) == len(away["shots_against"])
    assert sum(home["goals_by_15min"]["for"]) == 3
    scorers = sum(p["totals"]["goals"] for p in one["players"] if p["team_id"] == home["team_id"])
    assert scorers == 3


def test_players_have_minutes_and_no_percentiles_below_the_threshold(one):
    assert one["players"] and all(p["minutes"] > 0 for p in one["players"])
    assert all(p["low_sample"] and p["percentiles"] is None for p in one["players"])     # one match < 450 min


def test_the_same_run_gives_the_same_bytes(tmp_path):
    a, b = tmp_path / "a.json", tmp_path / "b.json"
    season.write(season.build(FIXTURE), a)
    season.write(season.build(FIXTURE), b)
    assert a.read_bytes() == b.read_bytes()


@pytest.mark.skipif(not (S1 / "table.json").exists() or not WORLD.exists(), reason="season S1 not generated here")
def test_season_s1_reproduces_the_generator_table():
    doc = season.build(S1, WORLD)
    table = json.loads((S1 / "table.json").read_text(encoding="utf-8"))
    assert [(t["team_id"], t["table"]["points"], t["table"]["goals_for"], t["table"]["goals_against"])
            for t in doc["teams"]] == [(t["team_id"], t["points"], t["goals_for"], t["goals_against"]) for t in table]
    assert doc["hidden_teams"] == ["CAL", "DTN"]
    assert not any(p["team_id"] in ("CAL", "DTN") for p in doc["players"])
    assert doc["dna_correlations"]["press_intensity"] >= 0.6 and doc["dna_correlations"]["press_height"] >= 0.6
    for p in doc["players"]:
        assert all(0 <= v <= 100 for v in (p["percentiles"] or {}).values())
