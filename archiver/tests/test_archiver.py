"""Archiver tests. Core logic with in-memory fakes; storage code against Azurite and the Cosmos emulator when they
are running locally (skipped otherwise, e.g. in CI)."""

from __future__ import annotations

import gzip
import json
import socket
import uuid

import pytest
from consumer import EVENTS_HUB, TRACKING_HUB, Archiver, parse

MATCH = "SYN-0009"


class FakeEvents:
    def __init__(self):
        self.setup, self.events, self.stats, self.finished = None, {}, {}, 0

    def save_setup(self, match_id, setup):
        self.setup = self.setup or setup

    def save_events(self, match_id, events):
        for e in events:
            self.events[e["event_id"]] = e

    def save_stats(self, match_id, panels):
        for p in panels:
            self.stats[p["match_ms"]] = p

    def finish(self, match_id):
        self.finished += 1


class FakeTracking:
    def __init__(self):
        self.calls = []

    def append(self, match_id, period, minute, frames):
        self.calls.append((period, minute, [f["match_ms"] for f in frames]))


SETUP = {"match_id": MATCH, "teams": {"home": {"team_id": "AAA"}, "away": {"team_id": "BBB"}}}


def event(seq, etype="Pass", period=1, ms=None):
    ms = seq * 1000 if ms is None else ms
    return {"event_id": f"{MATCH}-{seq:05d}", "match_id": MATCH, "seq": seq, "type": etype, "period": period,
            "match_ms": ms, "period_ms": ms, "team_id": "AAA"}


def frame(ms, period=1):
    period_ms = ms if period == 1 else ms - 2_700_000
    return {"match_id": MATCH, "period": period, "period_ms": period_ms, "match_ms": ms, "ball": {}, "players": []}


def m(kind, body):
    hub = TRACKING_HUB if kind == "tracking" else EVENTS_HUB
    return parse(hub, json.dumps(body), {"kind": kind, "match_id": MATCH})


def test_routes_each_kind():
    ev, tr = FakeEvents(), FakeTracking()
    a = Archiver(ev, tr)
    totals = a.handle([m("setup", SETUP), m("event", event(1)), m("event", event(2)),
                       m("stats", {"match_id": MATCH, "match_ms": 60000, "clock": "1:00"})])
    assert ev.setup == SETUP and set(ev.events) == {f"{MATCH}-00001", f"{MATCH}-00002"} and 60000 in ev.stats
    assert totals["events"] == 2 and totals["invalid"] == 0


def test_frames_grouped_by_period_and_minute():
    tr = FakeTracking()
    Archiver(FakeEvents(), tr).handle([m("tracking", frame(ms)) for ms in (59_600, 59_800, 60_000, 60_200)] +
                                      [m("tracking", frame(2_700_000, period=2))])
    assert tr.calls == [(1, 0, [59_600, 59_800]), (1, 1, [60_000, 60_200]), (2, 0, [2_700_000])]


def test_full_time_records_result_once_per_batch():
    ev = FakeEvents()
    Archiver(ev, FakeTracking()).handle([m("event", event(9, "PeriodEnd", period=1)),
                                         m("event", event(10, "PeriodEnd", period=2))])
    assert ev.finished == 1


def test_redelivery_is_harmless():
    ev = FakeEvents()
    a = Archiver(ev, FakeTracking())
    batch = [m("setup", SETUP), m("event", event(1)), m("event", event(2))]
    a.handle(batch)
    a.handle(batch)
    assert len(ev.events) == 2


def test_invalid_messages_skipped():
    ev = FakeEvents()
    bad = event(3)
    bad["event_id"] = "SYN-0009-99999"
    other_match = parse(EVENTS_HUB, json.dumps(event(4)), {"kind": "event", "match_id": "SYN-0001"})
    totals = Archiver(ev, FakeTracking()).handle([m("event", bad), other_match,
                                                  parse(EVENTS_HUB, "not json", {"kind": "event"})])
    assert totals["invalid"] == 3 and ev.events == {}


# --------------------------------------------------------------------------------------------- real storage


def _up(port: int) -> bool:
    with socket.socket() as s:
        s.settimeout(0.3)
        return s.connect_ex(("127.0.0.1", port)) == 0


azurite = pytest.mark.skipif(not _up(10000), reason="Azurite not running")
cosmos = pytest.mark.skipif(not _up(8081), reason="Cosmos emulator not running")


@azurite
def test_blob_minutes_survive_restaging_and_overlap():
    from azure.storage.blob import BlobServiceClient
    from tracking_chunks import AZURITE, BlobTracking, blob_name
    t = BlobTracking(BlobServiceClient.from_connection_string(AZURITE), container=f"test-{uuid.uuid4().hex[:8]}")
    try:
        t.append(MATCH, 1, 0, [frame(ms) for ms in range(0, 2000, 200)])
        t.append(MATCH, 1, 0, [frame(ms) for ms in range(2000, 4000, 200)])
        t.append(MATCH, 1, 0, [frame(ms) for ms in range(0, 2000, 200)])        # same batch again
        t.append(MATCH, 1, 0, [frame(ms) for ms in range(1000, 3000, 200)])     # overlapping redelivery
        t.append(MATCH, 2, 0, [frame(2_700_000, period=2)])
        raw = t.container.download_blob(blob_name(MATCH, 1, 0)).readall()
        lines = gzip.decompress(raw).decode().splitlines()                      # several gzip members, one file
        assert len(lines) == 30                                                 # 10 + 10 + 10 overlapping
        frames = t.frames(MATCH)
        assert [f["match_ms"] for f in frames] == list(range(0, 4000, 200)) + [2_700_000]
        assert [(p, mi) for p, mi, _ in t.minutes(MATCH)] == [(1, 0), (2, 0)]
    finally:
        t.container.delete_container()


@cosmos
def test_cosmos_round_trip_and_result():
    import os

    from event_store import CosmosArchive
    key = os.environ.get("OVERLAP_COSMOS_KEY")
    if not key:
        pytest.skip("OVERLAP_COSMOS_KEY not set")
    db = f"test-{uuid.uuid4().hex[:8]}"
    c = CosmosArchive("http://localhost:8081", key, database=db)
    try:
        setup = {"match_id": MATCH, "teams": {"home": {"team_id": "AAA"}, "away": {"team_id": "BBB"}}}
        c.save_setup(MATCH, setup)
        goal = {**event(2, "Shot"), "shot_outcome": "goal"}
        c.save_events(MATCH, [event(1), goal, event(3, "PeriodEnd", period=2)])
        c.save_events(MATCH, [event(1)])                                        # redelivery
        c.save_stats(MATCH, [{"match_id": MATCH, "match_ms": 5000, "clock": "0:05"}])
        c.finish(MATCH)
        stored = c.match(MATCH)
        assert stored["status"] == "finished" and stored["result"] == {"score": {"home": 1, "away": 0}, "events": 3}
        assert [e["seq"] for e in c.events(MATCH)] == [1, 2, 3] and c.events(MATCH)[1] == goal
        assert c.stats(MATCH)[0]["match_ms"] == 5000
    finally:
        from azure.cosmos import CosmosClient
        CosmosClient("http://localhost:8081", credential=key).delete_database(db)
