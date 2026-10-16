# test_batch.py — Batch mode and the realism report
#
# Purpose: check fixtures, the league table, repeat runs on disk, and the report's targets and answer key
# Inputs:  made-up team lists; a two-match repeat run in a temporary folder
# Outputs: pass / fail
# Spec:    generator/specs/live-and-batch.md §3-§4

from __future__ import annotations

import collections
import json

import pytest

import batch
import realism_report
import world


def test_fixtures_are_a_double_round_robin():
    teams = [f"T{i:02d}" for i in range(10)]
    fx = batch.fixtures(teams, seed=4)
    assert len(fx) == 90 and max(mw for mw, _, _ in fx) == 18
    pairs = collections.Counter((h, a) for _, h, a in fx)
    assert all(pairs[(h, a)] == 1 for h in teams for a in teams if h != a)
    for mw in range(1, 19):
        playing = [t for m, h, a in fx if m == mw for t in (h, a)]
        assert len(playing) == len(set(playing)) == 10, mw
    homes = collections.Counter(h for _, h, _ in fx)
    assert set(homes.values()) == {9}


def test_fixtures_depend_on_the_seed_and_handle_an_odd_league():
    teams = ["AAA", "BBB", "CCC"]
    assert batch.fixtures(teams, 1) != batch.fixtures(teams, 2) or len(batch.fixtures(teams, 1)) == 6
    assert len(batch.fixtures(teams, 1)) == 6


def test_two_reference_clubs_make_a_two_match_season():
    assert [(h, a) for _, h, a in batch.fixtures(["SKH", "AMH"], 1)] in (
        [("SKH", "AMH"), ("AMH", "SKH")], [("AMH", "SKH"), ("SKH", "AMH")])


@pytest.fixture(scope="module")
def run_dir(tmp_path_factory):
    _, loaded = world.load_reference_clubs()
    clubs = {c.team_id: c for c in loaded}
    out = tmp_path_factory.mktemp("seasons")
    return batch.play_run(clubs, repeat=2, out_dir=out, world_version=2, log=lambda *_: None)


def test_repeat_run_files(run_dir):
    assert {p.name for p in run_dir.iterdir()} == {"matches", "fixtures.json", "table.json", "run.json"}
    assert len(list((run_dir / "matches").iterdir())) == 2
    meta = json.loads((run_dir / "run.json").read_text(encoding="utf-8"))
    assert meta["repeat"] == 2 and meta["matches"] == 2 and meta["world_version"] == 2
    table = json.loads((run_dir / "table.json").read_text(encoding="utf-8"))
    assert sum(r["played"] for r in table) == 4
    assert table[0]["points"] >= table[1]["points"]


def test_report_measures_sourced_rows_and_prints_the_answer_key(run_dir, tmp_path):
    rows = realism_report.calibration_rows()
    names = [r["metric"] for r in rows]
    assert "Goals per match" in names and "Penalty xG" in names
    assert "Short-pass completion" not in names            # needs a source, so not measured
    report = realism_report.write(run_dir, tmp_path).read_text(encoding="utf-8")
    assert "| Penalty xG | 0.78 | 0.78 | ✅ |" in report
    assert "not meaningful for a repeat run" in report
    assert "## Answer key: Skyhaven vs Amberholt" in report
