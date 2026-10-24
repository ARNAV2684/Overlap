# consumer.py — Event consumer
#
# Purpose: read both hubs as consumer group `stats`, hand each message to the pipeline, and move each partition's
#          checkpoint only past finished matches
# Inputs:  Event Hubs match-events (setup, event; our own `stats` panels are skipped) and match-tracking
# Outputs: (kind, body) for main.Pipeline.handle
# Spec:    stats/specs/publishing.md (input, restart); CONTRACTS.md §1.4
#
# Checkpoints are per partition, and one partition carries several matches. A partition's checkpoint moves only when
# every match seen on it has finished. A restarted engine then re-reads any unfinished match from its setup, and
# replaying gives the same numbers and moment IDs (publishing.md, "Restart").

from __future__ import annotations

import json
import logging
import os
import threading
from collections.abc import Callable
from dataclasses import dataclass, field

EVENTS_HUB = "match-events"
TRACKING_HUB = "match-tracking"
CONSUMER_GROUP = "stats"
CHECKPOINT_CONTAINER = "stats-checkpoints"
AZURITE = ("DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
           "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
           "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;")   # Azurite's published development account

log = logging.getLogger("stats.consumer")


def _prop(properties: dict | None, key: str) -> str | None:
    if not properties:
        return None
    value = properties.get(key, properties.get(key.encode()))
    return value.decode() if isinstance(value, bytes) else value


def parse(hub: str, body: str, properties: dict | None) -> tuple[str, dict]:
    """(kind, body) for one hub message. Tracking frames have kind `tracking`; a message without a kind on
    match-events is a setup if it has no seq, else an event."""
    data = json.loads(body)
    kind = _prop(properties, "kind")
    if hub == TRACKING_HUB:
        return "tracking", data
    if kind is None:
        kind = "event" if "seq" in data else "setup"
    return kind, data


@dataclass
class PartitionWatch:
    """Which matches a partition has carried, and which have finished."""
    open: set[str] = field(default_factory=set)
    last: object | None = None              # the newest event seen, to checkpoint at


class Reader:
    """Reads one hub. `handle(kind, body, received_at)` is the pipeline; `finished(match_id)` says whether a match is
    over. `received_at` is when the message entered the hub (seconds since the epoch), for latency figures."""

    def __init__(self, hub: str, handle: Callable[..., None], finished: Callable[[str], bool]):
        self.hub = hub
        self.handle = handle
        self.finished = finished
        self.partitions: dict[str, PartitionWatch] = {}
        self.lock = threading.Lock()
        self.counts = {"messages": 0, "skipped_stats": 0, "invalid": 0}

    def on_event(self, partition_context, event) -> None:
        if event is not None:
            self.on_event_batch(partition_context, [event])

    def on_event_batch(self, partition_context, events) -> None:
        """One batch from one partition, in order. The checkpoint moves to the batch's last message, and only when
        every match seen on this partition has finished."""
        if not events:
            return
        with self.lock:
            watch = self.partitions.setdefault(partition_context.partition_id, PartitionWatch())
            for event in events:
                match_id = self._one(event)
                if match_id:
                    watch.open.add(match_id)
            watch.last = events[-1]
            watch.open = {m for m in watch.open if not self.finished(m)}
            if not watch.open:
                partition_context.update_checkpoint(events[-1])

    def _one(self, event) -> str | None:
        self.counts["messages"] += 1
        try:
            kind, body = parse(self.hub, event.body_as_str(), event.properties)
        except (ValueError, TypeError) as err:
            self.counts["invalid"] += 1
            log.warning("%s: unreadable message: %s", self.hub, err)
            return None
        if kind == "stats":
            self.counts["skipped_stats"] += 1
            return body.get("match_id")
        enqueued = getattr(event, "enqueued_time", None)
        try:
            self.handle(kind, body, enqueued.timestamp() if enqueued else None)
        except Exception:                      # one bad message must not stop the partition
            self.counts["invalid"] += 1
            log.exception("%s: failed on %s %s seq %s", self.hub, kind, body.get("match_id"), body.get("seq"))
        return body.get("match_id")


class Runner:
    """Both hubs, one thread each, into one pipeline (whose methods are called under one lock)."""

    def __init__(self, handle: Callable[..., None], finished: Callable[[str], bool]):
        self.lock = threading.Lock()

        def locked(kind, body, received_at=None):
            with self.lock:
                handle(kind, body, received_at)

        self.readers = [Reader(EVENTS_HUB, locked, finished), Reader(TRACKING_HUB, locked, finished)]
        self.clients = []
        self.threads: list[threading.Thread] = []

    def run(self) -> None:
        store = checkpoint_store()
        for reader in self.readers:
            c = client(reader.hub, store)
            self.clients.append(c)
            t = threading.Thread(target=c.receive_batch, daemon=True, name=f"stats-{reader.hub}",
                                 kwargs={"on_event_batch": reader.on_event_batch, "max_batch_size": 300,
                                         "max_wait_time": 0.2, "starting_position": "-1",
                                         "on_error": self._on_error,
                                         "on_partition_initialize": self._partition(reader.hub, "claimed"),
                                         "on_partition_close": self._partition(reader.hub, "released")})
            t.start()
            self.threads.append(t)
        log.info("reading %s as consumer group %s", ", ".join(r.hub for r in self.readers),
                 os.environ.get("OVERLAP_STATS_CONSUMER_GROUP", CONSUMER_GROUP))
        for t in self.threads:
            while t.is_alive():
                t.join(1.0)

    @staticmethod
    def _partition(hub: str, what: str):
        def log_it(partition_context, *_):
            log.info("%s partition %s %s", hub, partition_context.partition_id, what)
        return log_it

    def _on_error(self, partition_context, error) -> None:
        log.error("reader error on partition %s: %s", getattr(partition_context, "partition_id", "?"), error)

    def stop(self) -> None:
        for c in self.clients:
            c.close()


def checkpoint_store():
    """Reading positions in Blob storage: OVERLAP_CHECKPOINT_BLOB_ENDPOINT (https://<account>.blob.core.windows.net)
    signs in with the managed identity, the container already made by Bicep (infra/modules/storage.bicep); otherwise
    the AzureWebJobsStorage connection string, Azurite by default."""
    from azure.core.exceptions import ResourceExistsError
    from azure.eventhub.extensions.checkpointstoreblob import BlobCheckpointStore
    from azure.storage.blob import BlobServiceClient
    endpoint = os.environ.get("OVERLAP_CHECKPOINT_BLOB_ENDPOINT")
    if endpoint:
        from azure.identity import DefaultAzureCredential
        return BlobCheckpointStore(endpoint, CHECKPOINT_CONTAINER, credential=DefaultAzureCredential())
    conn = os.environ.get("AzureWebJobsStorage", "UseDevelopmentStorage=true")
    if conn.strip().rstrip(";") == "UseDevelopmentStorage=true":
        conn = AZURITE
    try:
        BlobServiceClient.from_connection_string(conn).create_container(CHECKPOINT_CONTAINER)
    except ResourceExistsError:
        pass
    return BlobCheckpointStore.from_connection_string(conn, CHECKPOINT_CONTAINER)


def client(hub: str, store):
    """Settings by variable name (infra/local/env.example): OVERLAP_EVENTHUBS_CONNECTION locally, else
    OVERLAP_EVENTHUBS_NAMESPACE with the managed identity."""
    from azure.eventhub import EventHubConsumerClient
    group = os.environ.get("OVERLAP_STATS_CONSUMER_GROUP", CONSUMER_GROUP)
    conn = os.environ.get("OVERLAP_EVENTHUBS_CONNECTION")
    if conn:
        return EventHubConsumerClient.from_connection_string(conn, consumer_group=group, eventhub_name=hub,
                                                             checkpoint_store=store)
    from azure.identity import DefaultAzureCredential
    return EventHubConsumerClient(os.environ["OVERLAP_EVENTHUBS_NAMESPACE"], hub, group,
                                  credential=DefaultAzureCredential(), checkpoint_store=store)
