# test_evidence.py — Evidence pack tests
#
# Purpose: check each pack's facts, windows and ids, and that the fixture's shot cluster is exactly Pranav's example
# Inputs:  tests/fixtures/SYN-1017 (generated KES v ORR, seed 1017); agents/specs/examples/shot-cluster.md values
# Outputs: pass / fail
# Spec:    stats/specs/evidence-packs.md; CONTRACTS.md §5, §10.1–§10.2

from __future__ import annotations

from pathlib import Path

import pytest

import main

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"
KEYS = {
    "shot_cluster": {"shots_last_5min", "window_duration_min"},
    "goal": {"shot_xg", "shot_distance_m", "team_goals_match", "opponent_goals_match", "player_goals_match",
             "team_shots_match", "shot_is_penalty"},
    "red_card": {"team_players_on_pitch", "team_fouls_match", "team_cards_match"},
    "momentum_swing": {"momentum_share_last_5min_pct", "momentum_share_previous_10min_pct", "team_shots_last_5min",
                       "window_duration_min"},
    "press_change": {"pressures_per_opp_pass_last_5min", "pressures_per_opp_pass_previous_10min",
                     "team_pressures_last_5min", "team_high_regains_last_5min", "window_duration_min"},
}


@pytest.fixture(scope="module")
def moments() -> list[dict]:
    return main.replay_moments(FIXTURE)["SYN-1017"]


def test_the_fixture_cluster_is_pranavs_example(moments):
    # agents/specs/examples/shot-cluster.md §2. The ordinal there is illustrative; ours counts every moment in order.
    m = next(m for m in moments if m["evidence"]["event_ids"][-1] == "SYN-1017-01592"
             and m["evidence"]["trigger"] == "shot_cluster")
    e = m["evidence"]
    assert e["clock"] == "65:34" and e["period"] == 2 and e["match_ms"] == 4174400 and e["team_id"] == "KES"
    assert e["player_ids"] == ["KES-11", "KES-10", "KES-07"]
    assert e["event_ids"] == ["SYN-1017-01477", "SYN-1017-01542", "SYN-1017-01592"]
    assert e["window"] == {"from_ms": 3874400, "to_ms": 4174400}
    assert e["facts"] == [
        {"key": "shots_last_5min", "value": 3, "decimals": 0,
         "label": "Kestlebury United shots in this five-minute window"},
        {"key": "window_duration_min", "value": 5, "unit": "min", "decimals": 0,
         "label": "Duration of the evidence window in minutes"},
    ]
    assert m["source"] == {"event_seq": 1592, "period": 2, "match_ms": 4174400}
    context = {k: v for k, v in m["context"].items() if k != "players"}
    assert context == {"phase": "live", "score": {"home": 3, "away": 0},
                       "teams": {"home": {"team_id": "KES", "name": "Kestlebury United"},
                                 "away": {"team_id": "ORR", "name": "Orrinford Albion"}}}
    assert [p["player_id"] for p in m["context"]["players"]] == e["player_ids"]
    assert {k: m[k] for k in ("kind", "schema_version", "evidence_version")} == \
        {"kind": "moment", "schema_version": 1, "evidence_version": 1}
    assert m["id"] == m["moment_id"] == e["moment_id"] and m["moment_id"].startswith("MO-1017-")


def test_every_pack_has_its_trigger_keys_and_well_formed_ids(moments):
    for m in moments:
        e = m["evidence"]
        keys = {f["key"] for f in e["facts"]}
        assert len(keys) == len(e["facts"])                                    # unique keys
        required = KEYS.get(e["trigger"])
        if required is not None:
            assert required <= keys <= required | {"press_height_last_5min_m"}, e["trigger"]
        seqs = [int(i[-5:]) for i in e["event_ids"]]
        assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
        assert seqs[-1] == m["source"]["event_seq"]                            # ends with the triggering event
        assert all(p.startswith(e["team_id"]) for p in e["player_ids"])
        assert e["window"]["from_ms"] <= e["window"]["to_ms"] == e["match_ms"]
        for f in e["facts"]:
            assert f.get("unit", "set") is not None                            # never "unit": null
            assert f["value"] == round(f["value"], f["decimals"])


def test_goal_facts_agree_with_the_score(moments):
    goals = [m for m in moments if m["evidence"]["trigger"] == "goal"]
    assert len(goals) == 3
    last = goals[-1]
    facts = {f["key"]: f["value"] for f in last["evidence"]["facts"]}
    assert (facts["team_goals_match"], facts["opponent_goals_match"]) == (3, 0) == \
        (last["context"]["score"]["home"], last["context"]["score"]["away"])
    assert facts["shot_is_penalty"] in (0, 1) and 0 < facts["shot_xg"] <= 0.95


def test_a_red_card_counts_the_players_left(moments):
    reds = [m for m in moments if m["evidence"]["trigger"] == "red_card"]
    facts = {f["key"]: f["value"] for f in reds[0]["evidence"]["facts"]}
    assert facts["team_players_on_pitch"] == 10
