# test_publish.py — Publishing tests
#
# Purpose: check stat panels (one per whole match second, CONTRACTS.md §7.4 shape, heavy blocks), match_state
#          (CONTRACTS.md §4.2, cadence) and the hub sender's retries
# Inputs:  tests/fixtures/SYN-1017 (a generated KES v ORR match); fake senders, stores and producers
# Outputs: pass / fail
# Spec:    stats/specs/publishing.md §1–§2

from __future__ import annotations

import gzip
import itertools
import json
from pathlib import Path

import pytest

import main
import publish

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"
TEAM_FIELDS = {"team_id", "possession_pct", "shots", "shots_on_target", "xg", "passes", "pass_completion_pct",
               "ppda_last_10min", "pressures_per_opp_pass_last_10min", "momentum_share_last_10min_pct",
               "press_height_last_10min_m"}
PANEL_FIELDS = {"match_id", "match_ms", "clock", "period", "source_seq", "score", "teams", "momentum", "low_sample"}


@pytest.fixture(scope="module")
def panels() -> list[dict]:
    return main.replay_panels(FIXTURE)["SYN-1017"]


def last_event() -> dict:
    with gzip.open(FIXTURE / "events.ndjson.gz", "rt", encoding="utf-8") as f:
        return json.loads([line for line in f if line.strip()][-1])


def test_one_panel_per_whole_match_second(panels):
    ms = [p["match_ms"] for p in panels]
    assert ms[0] == 0 and all(b - a == 1000 for a, b in itertools.pairwise(ms))
    assert ms[-1] >= last_event()["match_ms"]
    assert panels[-1]["score"] == {"home": 3, "away": 0}


def test_heavy_blocks_every_minute_and_at_both_period_ends(panels):
    heavy = [p for p in panels if "heavy" in p]
    minutes = [p for p in heavy if p["match_ms"] % 60_000 == 0]
    assert len(minutes) == panels[-1]["match_ms"] // 60_000 + 1
    assert len(heavy) == len(minutes) + 2                      # plus the two PeriodEnd panels
    h = panels[-1]["heavy"]
    assert set(h) == {"momentum_buckets", "pass_network", "pressing_grid", "zones"}   # no tracking in the fixture
    assert len(h["pressing_grid"]["home"]) == 9 and len(h["pressing_grid"]["home"][0]) == 6
    assert len(h["zones"]["away"]) == 3 and len(h["zones"]["away"][0]) == 6
    assert all(link["count"] >= 3 for link in h["pass_network"]["home"]["links"])
    buckets = [(b["period"], b["bucket"]) for b in h["momentum_buckets"]]
    assert buckets == sorted(set(buckets)) and (1, 0) in buckets and (2, 9) in buckets


def test_every_panel_has_the_contract_shape(panels):
    for p in panels:
        assert set(p) - {"heavy"} == PANEL_FIELDS
        assert p["match_ms"] % 1000 == 0
        for side in ("home", "away"):
            assert set(p["teams"][side]) == TEAM_FIELDS
        nulls = {f"teams.{s}.{k}" for s in ("home", "away") for k, v in p["teams"][s].items() if v is None}
        assert set(p["low_sample"]) == nulls


def test_early_panels_are_null_not_zero(panels):
    first = panels[0]
    assert first["teams"]["home"]["ppda_last_10min"] is None
    assert "teams.home.ppda_last_10min" in first["low_sample"]
    later = panels[1200]                                        # 20:00
    assert later["teams"]["home"]["possession_pct"] is not None and later["teams"]["home"]["xg"] >= 0


def test_replaying_twice_gives_identical_panels():
    a = main.numbers_json(main.replay_panels(FIXTURE))
    b = main.numbers_json(main.replay_panels(FIXTURE))
    assert a == b


def test_match_state_every_5_seconds_and_at_period_edges():
    store = publish.DictStore()
    sender = publish.ListSender()
    main.replay_match(FIXTURE, publish.Publisher(sender, store))
    panels = sender.panels["SYN-1017"]
    five = sum(1 for p in panels if p["match_ms"] % 5000 == 0)
    assert store.writes == five + 2 + 2                         # every 5 s, plus 2 PeriodStarts and 2 PeriodEnds
    doc = store.docs[("SYN-1017", "state")]
    assert doc["kind"] == "match_state" and doc["phase"] == "full_time"
    assert doc["source"]["event_seq"] == last_event()["seq"]
    assert doc["score"] == {"home": 3, "away": 0} and doc["panel"] == panels[-1]
    assert doc["totals"]["home"]["team_id"] == "KES" and doc["players"]


@pytest.mark.parametrize("period, period_ms, clock", [
    (1, 0, "0:00"), (1, 754_000, "12:34"), (1, 2_830_000, "45+2:10"), (2, 1_034_000, "62:14"),
    (2, 2_776_000, "90+1:16"),
])
def test_clock_matches_the_generator(period, period_ms, clock):
    assert publish.clock_at(period, period_ms) == clock


class FlakyProducer:
    def __init__(self, failures: int):
        self.failures = failures
        self.sent = []

    def create_batch(self, partition_key):
        return FakeBatch(partition_key)

    def send_batch(self, batch):
        from azure.core.exceptions import AzureError
        if self.failures:
            self.failures -= 1
            raise AzureError("not now")
        self.sent.append(batch)


class FakeBatch:
    def __init__(self, partition_key):
        self.partition_key = partition_key
        self.items = []

    def add(self, data):
        self.items.append(data)


def test_hub_sender_sends_kind_stats_and_retries_then_skips(monkeypatch):
    monkeypatch.setattr(publish, "RETRY_WAIT_S", (0.0, 0.0))
    ok = publish.HubSender(FlakyProducer(failures=2))
    ok.send("SYN-0001", {"match_id": "SYN-0001", "match_ms": 1000})
    batch = ok.producer.sent[0]
    assert batch.partition_key == "SYN-0001" and ok.skipped == 0
    assert batch.items[0].properties == {"kind": "stats", "match_id": "SYN-0001"}
    gives_up = publish.HubSender(FlakyProducer(failures=3))
    gives_up.send("SYN-0001", {"match_id": "SYN-0001", "match_ms": 2000})
    assert gives_up.skipped == 1 and gives_up.producer.sent == []
