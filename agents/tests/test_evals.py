"""The evaluation code itself (agents/specs/evaluation.md): labels, storyline windows, faults, review sheet, gold."""
import csv
import gzip
import json
from pathlib import Path

import pytest

from evals import fault_injection, gold, numeric_accuracy, recall, review_sheet

ROOT = Path(__file__).resolve().parents[2]
EVENTS = ROOT / "stats/tests/fixtures/SYN-1017/events.ndjson.gz"


@pytest.fixture(scope="module")
def events():
    with gzip.open(EVENTS, "rt", encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def test_independent_labels_match_the_engine_on_its_fixture(events, moments):
    d = recall.detection(events, moments)
    for trig in ("goal", "red_card", "shot_cluster"):
        assert d[trig]["eligible"] > 0 and d[trig]["recall"] == 1.0 and d[trig]["extra"] == 0
    assert d["penalty"]["recall"] is None                              # zero denominator is N/A, never 100%
    assert d["momentum_swing"]["eligible"] is None and d["momentum_swing"]["detected"] > 0


def test_a_missed_moment_lowers_recall(events, moments):
    without_goal = [m for m in moments if m["id"] != "MO-1017-0012"]
    d = recall.detection(events, without_goal)
    assert d["goal"] == {"eligible": 3, "detected": 2, "extra": 0, "recall": 0.667}


def test_shot_cluster_rule_warm_up_and_cooldown():
    def shot(seq, ms, team="A", period=1):
        return {"seq": seq, "type": "Shot", "event_id": f"E{seq}", "team_id": team, "player_id": "A-01",
                "match_ms": ms, "period_ms": ms, "period": period, "shot_outcome": "missed"}
    early = [shot(1, 100_000), shot(2, 150_000), shot(3, 200_000)]               # inside the 5-minute warm-up
    assert recall.labels(early) == []
    burst = [shot(1, 400_000), shot(2, 450_000), shot(3, 500_000), shot(4, 520_000), shot(5, 700_000),
             shot(6, 800_000)]
    got = [x["event_id"] for x in recall.labels(burst) if x["trigger"] == "shot_cluster"]
    assert got == ["E3", "E6"]           # E4 and E5 fall in the cooldown; E6 is exactly 300 s after E3, with 3 shots


def test_storyline_window_runs_to_the_end_plus_allowance():
    story = {"name": "red_card", "onset_ms": 1_680_000, "full_ms": 1_740_000, "end_ms": 2_520_000,
             "detect_within_min": 5.0, "triggered": True, "measured": {"red_card": {"after": True, "before": False}}}
    red = {"evidence": {"trigger": "red_card", "team_id": "DTN", "match_ms": 2_342_000}}
    assert recall.story_window(story) == (1_680_000, 2_820_000)
    assert recall.storyline_hits(story, [red], "DTN")["hit"] and recall.effect_showed(story)
    assert not recall.storyline_hits(story, [red], "CAL")["hit"]
    assert not recall.effect_showed({"measured": {"player_goals": {"after": 0}}})


def bench_result(moments, store_outputs=None):
    from fallbacks import line_ids, template_lines
    rows = []
    for m in moments:
        lines = template_lines(m, line_ids(m, ("casual", "analyst"), 0))
        rows.append({"moment": m, "status": "delivery_pending", "seconds": 0.01, "wrong": [],
                     "stages": {"spotter": {"decision": "admit", "model": False},
                                "fact_checker": {"lines": lines,
                                                 "status": {ln["id"]: {"verified": False, "fallback": True}
                                                            for ln in lines}}},
                     "intent": {"audiences": [{"overlay": {"verified": False, "fallback": True}}], "dropped": [],
                                "visual": {"component": "key_events", "highlight": {"team_id": m["evidence"]["team_id"]}}}})
    return {"match_id": moments[0]["match_id"], "moments": rows, "recap": {"intent": None, "wrong": []},
            "evaluator": {"storylines": [], "events": [], "seed": 1}}


def test_fault_injection_catches_every_code_checkable_fault(moments):
    out = fault_injection.run([bench_result(moments)])
    assert out["cases"] >= 15 and out["false_rejections"] == 0
    for kind in ("numeric", "meaning"):
        assert out[kind]["code_caught"] == out[kind]["code_checkable"] > 0
    assert any(r["code_blind"] and not r["caught"] for r in out["rows"])           # reported, not hidden


def test_numeric_accuracy_counts_templates_and_wrong_numbers(moments):
    res = bench_result(moments)
    res["moments"][0]["wrong"] = [{"group": "g", "text": "t", "problems": ["wrong_value:x"]}]
    n = numeric_accuracy.overall([numeric_accuracy.match_numbers(res)])
    assert n["wrong_numbers"] == 1 and n["rates"]["template"] == 1.0 and n["published_lines"] == len(moments)


def test_review_sheet_and_gold_round_trip(moments, tmp_path):
    res = bench_result(moments)
    paths = review_sheet.write(review_sheet.build([res]), tmp_path / "sheets")
    narrator = next(p for p in paths if p.name == "narrator.csv")
    rows = list(csv.DictReader(narrator.open(encoding="utf-8-sig")))
    assert rows and set(review_sheet.COLUMNS) <= set(rows[0]) and len({r["trigger"] for r in rows}) > 1
    rows[0].update(verdict="reject", reason="too plain", score_1_5="2")
    rows[1].update(verdict="accept", score_1_5="4")
    with narrator.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    g = gold.import_sheets(tmp_path / "sheets")
    assert len(g["items"]) == 2 and g["skipped_rows"] > 0
    score = gold.score(g, [res])
    assert score["rejected_lines"] == 1 and score["rejected_lines_produced_again"] == 1      # same templates
    assert score["median_score"] == 4
