"""The code check (fact-checking.md §1, §3, §4): every injected fault is caught; real templates and good lines pass."""
import copy

import pytest

from fact_checker import normalise, numeric_check


def by_id(moments, i):
    return copy.deepcopy(next(m for m in moments if m["id"] == i))


def line(text, claims, mode="casual", lang="en", id_=None):
    return {"id": id_ or mode, "mode": mode, "lang": lang, "text": text,
            "claims": [{"key": k, "value": v} for k, v in claims]}


CLUSTER, GOAL, RED, SWING, PRESS = "MO-1017-0013", "MO-1017-0012", "MO-1017-0014", "MO-1017-0003", "MO-1017-0004"


def test_good_lines_pass(moments):
    cluster = by_id(moments, CLUSTER)
    assert numeric_check(line("Kestlebury United keep coming: 3 shots in the last 5 minutes.",
                              [("shots_last_5min", 3), ("window_duration_min", 5)]), cluster) == []
    goal = by_id(moments, GOAL)
    f = {x["key"]: x["value"] for x in goal["evidence"]["facts"]}
    assert numeric_check(line(f"Goal! {f['shot_xg']} xG from {f['shot_distance_m']} m. "
                              f"{f['team_goals_match']}–{f['opponent_goals_match']}.",
                              [("shot_xg", f["shot_xg"]), ("shot_distance_m", f["shot_distance_m"]),
                               ("team_goals_match", f["team_goals_match"]),
                               ("opponent_goals_match", f["opponent_goals_match"])], mode="analyst"), goal) == []


@pytest.mark.parametrize("moment_id,text,claims,code", [
    (CLUSTER, "Kestlebury United have taken 4 shots in the last 5 minutes.",
     [("shots_last_5min", 4), ("window_duration_min", 5)], "wrong_value:shots_last_5min"),         # wrong value
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes.",
     [("shots_last_5min", 3)], "numbers_without_claims"),                                          # missing claim
    (CLUSTER, "Kestlebury United have taken 3 shots.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "claims_without_numbers"),              # extra claim
    (CLUSTER, "Kestlebury United have taken three shots in the last 5 minutes.",
     [("window_duration_min", 5)], "spelled_number:three"),                                        # number word
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes, with 11 on target.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "numbers_without_claims"),              # stale context
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes and dominate.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "cluster_inference"),                   # unsupported
    (CLUSTER, "Kestlebury United: 3 shots in the last 5 minutes. A goal is coming.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "cluster_inference"),
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5), ("shots_last_5min", 3)], "duplicate_claim"),
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("xg_from_another_match", 5)], "unknown_fact:xg_from_another_match"),  # wrong match
    (CLUSTER, "Kestlebury United have taken 3% shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "unit_wrong:shots_last_5min"),          # wrong unit
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 seconds.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "unit_wrong:window_duration_min"),
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5.0 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "too_precise:window_duration_min"),
    (CLUSTER, "Kestlebury United have taken 3–5 shots lately.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "score_not_from_facts"),                # range/score
    (CLUSTER, "KES have taken 3 shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "internal_id"),
    (CLUSTER, "See https://x.example: 3 shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "url"),
    (CLUSTER, "<b>3</b> shots in the last 5 minutes.",
     [("shots_last_5min", 3), ("window_duration_min", 5)], "markup"),
    (CLUSTER, "Kestlebury United have taken 3 shots in the last 5 minutes. " + "Still going. " * 8,
     [("shots_last_5min", 3), ("window_duration_min", 5)], "too_long"),
    (RED, "Orrinford Albion are down to 9.", [("team_players_on_pitch", 9)], "wrong_value:team_players_on_pitch"),
    (RED, "Orrinford Albion are down to 10 after a second yellow.", [("team_players_on_pitch", 10)],
     "red_card_reason"),
    (SWING, "Kestlebury United now have 100% of the possession in the last 5 minutes, up from 49%.",
     [("momentum_share_last_5min_pct", 100), ("window_duration_min", 5), ("momentum_share_previous_10min_pct", 49)],
     "momentum_possession"),
    (SWING, "Kestlebury United have 100 of the attacking actions in the last 5 minutes, up from 49%.",
     [("momentum_share_last_5min_pct", 100), ("window_duration_min", 5), ("momentum_share_previous_10min_pct", 49)],
     "unit_missing:momentum_share_last_5min_pct"),
    (PRESS, "Kestlebury United are pressing harder: 0.55 pressures per opponent pass, down from 1.07.",
     [("pressures_per_opp_pass_last_5min", 0.55), ("pressures_per_opp_pass_previous_10min", 1.07)],
     "press_direction"),                                                                            # direction
    (PRESS, "Kestlebury United look tired: 0.55 pressures per opponent pass, down from 1.07.",
     [("pressures_per_opp_pass_last_5min", 0.55), ("pressures_per_opp_pass_previous_10min", 1.07)], "press_intent"),
])
def test_faults_are_caught(moments, moment_id, text, claims, code):
    problems = numeric_check(line(text, claims), by_id(moments, moment_id))
    assert code in problems, problems


def test_score_claims_must_be_in_order(moments):
    goal = by_id(moments, GOAL)
    for f in goal["evidence"]["facts"]:
        if f["key"] in ("team_goals_match", "opponent_goals_match"):
            f["value"] = 1                                                  # 1–1: swapped claims are the same values
    good = line("Kestlebury United score. 1–1.", [("team_goals_match", 1), ("opponent_goals_match", 1)])
    swapped = line("Kestlebury United score. 1–1.", [("opponent_goals_match", 1), ("team_goals_match", 1)])
    assert numeric_check(good, goal) == []
    assert "score_not_from_facts" in numeric_check(swapped, goal)


def test_score_from_context_is_rejected(moments):
    goal = by_id(moments, GOAL)
    text = "Kestlebury United score. 1–0."                                  # the shot count is not a score
    assert "score_not_from_facts" in numeric_check(line(text, [("team_shots_match", 1), ("team_goals_match", 1)]),
                                                   goal)


def test_hat_trick_needs_three_and_ordinals_are_checked(moments):
    milestone = copy.deepcopy(by_id(moments, GOAL))
    milestone["evidence"]["trigger"] = "milestone"
    milestone["evidence"]["facts"] = [{"key": "player_goals_match", "value": 2, "decimals": 0, "label": "goals"},
                                      {"key": "shot_xg", "value": 0.31, "unit": "xG", "decimals": 2, "label": "xG"}]
    assert "hat_trick_wrong" in numeric_check(line("A hat-trick! His 2nd goal.", [("player_goals_match", 2)]),
                                              milestone)
    assert "wrong_value:player_goals_match" in numeric_check(line("His 3rd goal.", [("player_goals_match", 3)]),
                                                             milestone)
    assert numeric_check(line("His 2nd goal of the match.", [("player_goals_match", 2)]), milestone) == []
    assert "ordinal_wrong:shot_xg" in numeric_check(line("A 0.31st chance.", [("shot_xg", 0.31)]), milestone)


def test_penalty_wording_needs_the_flag(moments):
    goal = by_id(moments, GOAL)
    flag = next(f for f in goal["evidence"]["facts"] if f["key"] == "shot_is_penalty")
    assert flag["value"] == 0
    assert "penalty_wording" in numeric_check(line("Kestlebury United score from the spot.", []), goal)


@pytest.mark.parametrize("lang,text,ok", [
    ("es", "Kestlebury United presiona menos: 0,55 presiones por pase rival, frente a 1,07.", True),
    ("fr", "Kestlebury United presse moins : 0,55 pression par passe adverse, contre 1,07.", True),
    ("hi", "Kestlebury United कम दबाव डाल रहे हैं: ०.५५ दबाव प्रति विरोधी पास, १.०७ से नीचे।", True),
    ("es", "Kestlebury United presiona menos: 0,56 presiones por pase rival, frente a 1,07.", False),   # changed
    ("es", "Kestlebury presiona menos: 0,55 presiones por pase rival, frente a 1,07.", False),          # name
    ("fr", "Kestlebury United presse deux fois moins : 0,55 contre 1,07.", False),                      # word
    ("es", "Kestlebury United presiona menos: 0,55 presiones por pase rival.", False),                  # dropped
])
def test_translations_are_rechecked(moments, lang, text, ok):
    press = by_id(moments, PRESS)
    english = line("Kestlebury United are pressing less: 0.55 pressures per opponent pass, down from 1.07.",
                   [("pressures_per_opp_pass_last_5min", 0.55), ("pressures_per_opp_pass_previous_10min", 1.07)])
    translated = {**english, "lang": lang, "text": text}
    problems = numeric_check(translated, press, english=english, names=["Kestlebury United", "Orrinford Albion"])
    assert (problems == []) is ok, problems


def test_locale_normalisation():
    assert normalise("71 % y 0,15", "es") == "71% y 0.15"
    assert normalise("७१ %", "hi") == "71%"
