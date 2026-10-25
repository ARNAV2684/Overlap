# test_consumer.py — Consumer tests
#
# Purpose: check message parsing, that our own panels are skipped, and that a partition's checkpoint only moves past
#          finished matches
# Inputs:  fake hub messages and a fake partition context (no Event Hubs needed)
# Outputs: pass / fail
# Spec:    stats/specs/publishing.md (input, restart); CONTRACTS.md §1.4

from __future__ import annotations

import gzip
import json
from pathlib import Path

import consumer
import main

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"


class FakeEvent:
    def __init__(self, body: dict, kind: str | None, match_id: str):
        self._body = json.dumps(body)
        self.properties = {b"kind": kind.encode(), b"match_id": match_id.encode()} if kind else {}

    def body_as_str(self) -> str:
        return self._body


class FakePartition:
    partition_id = "0"

    def __init__(self):
        self.checkpoints: list[FakeEvent] = []

    def update_checkpoint(self, event) -> None:
        self.checkpoints.append(event)


def test_parse_tells_setups_events_frames_and_panels_apart():
    assert consumer.parse("match-events", '{"match_id": "SYN-0001"}', {b"kind": b"setup"})[0] == "setup"
    assert consumer.parse("match-events", '{"match_id": "SYN-0001", "seq": 1}', None)[0] == "event"
    assert consumer.parse("match-events", '{"match_id": "SYN-0001"}', {"kind": "stats"})[0] == "stats"
    assert consumer.parse("match-tracking", '{"match_id": "SYN-0001"}', {"kind": "tracking"})[0] == "tracking"


def test_a_whole_match_through_the_reader_with_checkpoints_only_after_full_time():
    pipeline = main.Pipeline()
    reader = consumer.Reader("match-events", pipeline.handle, pipeline.finished)
    part = FakePartition()
    setup = json.loads((FIXTURE / "setup.json").read_text(encoding="utf-8"))
    with gzip.open(FIXTURE / "events.ndjson.gz", "rt", encoding="utf-8") as f:
        events = [json.loads(line) for line in f if line.strip()]
    reader.on_event(part, FakeEvent(setup, "setup", "SYN-1017"))
    for i, e in enumerate(events):
        reader.on_event(part, FakeEvent(e, "event", "SYN-1017"))
        if i % 100 == 0:
            reader.on_event(part, FakeEvent({"match_id": "SYN-1017", "match_ms": e["match_ms"]}, "stats", "SYN-1017"))
        if i == len(events) - 2:
            assert part.checkpoints == []          # the match is still open: no checkpoint yet
    assert len(part.checkpoints) == 1          # moved once, at full time
    assert reader.counts["skipped_stats"] == (len(events) - 1) // 100 + 1
    assert main.Pipeline.summary(pipeline, "SYN-1017")["score"] == {"home": 3, "away": 0}


def test_an_unreadable_message_is_counted_not_fatal():
    pipeline = main.Pipeline()
    reader = consumer.Reader("match-events", pipeline.handle, pipeline.finished)

    class Broken(FakeEvent):
        def body_as_str(self):
            return "{not json"

    reader.on_event(FakePartition(), Broken({}, "event", "SYN-0001"))
    assert reader.counts["invalid"] == 1


def test_checkpoint_store_signs_in_with_identity_on_azure(monkeypatch):
    # On Azure the container exists (Bicep) and there is no connection string: the store uses the managed identity
    from azure.eventhub.extensions.checkpointstoreblob import BlobCheckpointStore

    import consumer
    monkeypatch.setenv("OVERLAP_CHECKPOINT_BLOB_ENDPOINT", "https://example.blob.core.windows.net")
    monkeypatch.setenv("AzureWebJobsStorage", "not-used")
    store = consumer.checkpoint_store()
    assert isinstance(store, BlobCheckpointStore)
