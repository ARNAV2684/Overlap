"""Lenient on precision, strict on meaning (Arnav, 25 Oct). Spec: agents/specs/fact-checking.md §1.6.

A measured value may be written rounded, numbers may come in any order, English small counts may be spelled out and
km / km/h are units; a wrong count, a swapped score, an invented number or a value rounded to nothing still fails."""
import copy

from fact_checker import matches_fact, numeric_check

GOAL, CLUSTER = "MO-1017-0012", "MO-1017-0013"


def moment(moments, mid, **values):
    """A copy of the fixture moment with some facts pinned (and new ones added with a unit and decimals)."""
    m = copy.deepcopy(next(x for x in moments if x["id"] == mid))
    facts = {f["key"]: f for f in m["evidence"]["facts"]}
    for key, (value, unit, decimals) in values.items():
        if key in facts:
            facts[key].update(value=value, decimals=decimals)
        else:
            m["evidence"]["facts"].append({"key": key, "value": value, "unit": unit, "decimals": decimals,
                                           "label": key, "source": "test"})
    return m


def line(text, claims, mode="analyst", lang="en"):
    return {"mode": mode, "lang": lang, "text": text, "claims": [{"key": k, "value": v} for k, v in claims]}


def test_a_measured_value_may_be_written_rounded(moments):
    m = moment(moments, GOAL, shot_xg=(0.12, "xG", 2), shot_distance_m=(18, "m", 0))
    f = {x["key"]: x["value"] for x in m["evidence"]["facts"]}
    tg, og = f["team_goals_match"], f["opponent_goals_match"]
    for written in ("0.12", "0.1"):
        text = f"Goal for Kestlebury United: a {written} xG chance from 18 m. {tg}–{og}."
        claims = [("shot_xg", 0.12), ("shot_distance_m", 18), ("team_goals_match", tg), ("opponent_goals_match", og)]
        assert numeric_check(line(text, claims), m) == [], written


def test_rounding_must_be_right_and_never_to_nothing(moments):
    assert matches_fact("0.1", {"value": 0.12, "unit": "xG", "decimals": 2})
    assert matches_fact("0.2", {"value": 0.15, "unit": "xG", "decimals": 2})          # half-up
    assert not matches_fact("0.2", {"value": 0.12, "unit": "xG", "decimals": 2})      # wrongly rounded
    assert not matches_fact("0", {"value": 0.04, "unit": "xG", "decimals": 2})        # never to nothing
    assert matches_fact("58", {"value": 57.6, "unit": "%", "decimals": 1})
    assert matches_fact("10", {"value": 10.4, "unit": "km", "decimals": 1})
    assert not matches_fact("0.123", {"value": 0.12, "unit": "xG", "decimals": 2})    # more precise, not rounded


def test_counts_scores_and_minutes_stay_exact():
    assert not matches_fact("4", {"value": 3, "unit": None, "decimals": 0})           # 3 shots is not 4
    assert not matches_fact("3", {"value": 3.4, "unit": None, "decimals": 1})         # no unit: not a measure
    assert not matches_fact("30", {"value": 34, "unit": "min", "decimals": 0})        # minutes are exact


def test_numbers_may_come_in_any_order(moments):
    m = moment(moments, GOAL, shot_xg=(0.12, "xG", 2), shot_distance_m=(18, "m", 0))
    text = "Kestlebury United struck from 18 m with a 0.12 xG chance."
    assert numeric_check(line(text, [("shot_xg", 0.12), ("shot_distance_m", 18)]), m) == []


def test_km_and_kmh_are_units(moments):
    m = moment(moments, GOAL, player_distance_km=(10.4, "km", 1), player_top_speed_kmh=(33.4, "km/h", 1))
    text = "Kestlebury United have a player who has covered 10 km and hit 33.4 km/h."
    claims = [("player_distance_km", 10.4), ("player_top_speed_kmh", 33.4)]
    problems = numeric_check(line(text, claims), m)
    assert not any(p.startswith(("unit_wrong", "text_differs")) for p in problems), problems


def test_small_counts_may_be_spelled_but_must_still_be_right(moments):
    m = next(x for x in moments if x["id"] == CLUSTER)
    shots = next(f["value"] for f in m["evidence"]["facts"] if f["key"] == "shots_last_5min")
    word = {3: "three", 2: "two", 4: "four", 5: "five"}[shots]
    claims = [("shots_last_5min", shots), ("window_duration_min", 5)]
    ok = line(f"Kestlebury United have taken {word} shots in the last 5 minutes.", claims, mode="casual")
    assert numeric_check(ok, m) == []
    wrong = {3: "four", 2: "three", 4: "five", 5: "six"}[shots]
    bad = line(f"Kestlebury United have taken {wrong} shots in the last 5 minutes.", claims, mode="casual")
    assert numeric_check(bad, m)                                                       # a wrong count still fails
    big = line("Kestlebury United have taken twelve shots in the last 5 minutes.", claims, mode="casual")
    assert any(p.startswith("spelled_number") for p in numeric_check(big, m))          # beyond ten: still a word


def test_an_invented_number_still_fails(moments):
    m = moment(moments, GOAL, shot_xg=(0.12, "xG", 2), shot_distance_m=(18, "m", 0))
    text = "Kestlebury United struck from 18 m with a 0.12 xG chance in the 34th minute."
    assert "numbers_without_claims" in numeric_check(line(text, [("shot_xg", 0.12), ("shot_distance_m", 18)]), m)


def test_a_translation_keeps_the_english_numbers_even_when_rounded(moments):
    m = moment(moments, GOAL, shot_xg=(0.12, "xG", 2), shot_distance_m=(18, "m", 0))
    claims = [("shot_xg", 0.12), ("shot_distance_m", 18)]
    en = line("Kestlebury United struck from 18 m with a 0.1 xG chance.", claims)
    es = {**en, "lang": "es", "text": "Kestlebury United disparó desde 18 m con una ocasión de 0,1 xG."}
    assert numeric_check(es, m, english=en) == []
    changed = {**es, "text": "Kestlebury United disparó desde 18 m con una ocasión de 0,2 xG."}
    assert "numbers_changed" in numeric_check(changed, m, english=en)
