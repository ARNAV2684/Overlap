"""Runs the archiver locally with the Event Hubs SDK (storage spec §5). On Azure the same core runs in the Functions
app (functions/function_app.py: archive_events, archive_tracking).

    uv run python main.py        # settings from the environment (infra/local/env.example)

Reads both hubs as consumer group `archiver`; reading positions are saved in Blob Storage (Azurite locally) only after
a batch is stored, so a restart resumes where it left off.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import threading
import time

from azure.core.exceptions import ResourceExistsError
from azure.eventhub import EventHubConsumerClient
from azure.eventhub.extensions.checkpointstoreblob import BlobCheckpointStore
from consumer import EVENTS_HUB, TRACKING_HUB, Archiver, parse
from event_store import CosmosArchive
from tracking_chunks import AZURITE, BlobTracking

log = logging.getLogger("archiver.runner")
CHECKPOINT_CONTAINER = "archiver-checkpoints"


def checkpoint_store() -> BlobCheckpointStore:
    from azure.storage.blob import BlobServiceClient
    conn = os.environ.get("AzureWebJobsStorage", "UseDevelopmentStorage=true")
    if conn.strip().rstrip(";") == "UseDevelopmentStorage=true":
        conn = AZURITE
    try:
        BlobServiceClient.from_connection_string(conn).create_container(CHECKPOINT_CONTAINER)
    except ResourceExistsError:
        pass
    return BlobCheckpointStore.from_connection_string(conn, CHECKPOINT_CONTAINER)


def consumer(hub: str, store: BlobCheckpointStore) -> EventHubConsumerClient:
    group = os.environ.get("OVERLAP_ARCHIVER_CONSUMER_GROUP", "archiver")
    conn = os.environ.get("OVERLAP_EVENTHUBS_CONNECTION")
    if conn:
        return EventHubConsumerClient.from_connection_string(conn, consumer_group=group, eventhub_name=hub,
                                                             checkpoint_store=store)
    from azure.identity import DefaultAzureCredential
    return EventHubConsumerClient(os.environ["OVERLAP_EVENTHUBS_NAMESPACE"], hub, group,
                                  credential=DefaultAzureCredential(), checkpoint_store=store)


class Runner:
    def __init__(self, batch_size: int = 100):
        self.archiver = Archiver(CosmosArchive.from_env(), BlobTracking.from_env())
        self.batch_size = batch_size
        self.stop = threading.Event()
        self.clients: list[EventHubConsumerClient] = []
        self.lock = threading.Lock()
        self.totals = {"messages": 0, "setups": 0, "events": 0, "stats": 0, "frames": 0, "invalid": 0}

    def _on_batch(self, hub: str):
        def handle(partition_context, events):
            if not events:
                return
            msgs = [parse(hub, e.body_as_str(), e.properties,
                          f"{hub}/p{partition_context.partition_id}/{e.offset}") for e in events]
            result = self.archiver.handle(msgs)
            with self.lock:
                for k in self.totals:
                    self.totals[k] += result[k]
            partition_context.update_checkpoint(events[-1])
        return handle

    def _on_error(self, partition_context, error):
        log.error("reader error on partition %s: %s", getattr(partition_context, "partition_id", "?"), error)

    def _read(self, hub: str, store: BlobCheckpointStore):
        client = consumer(hub, store)
        self.clients.append(client)
        with client:
            client.receive_batch(on_event_batch=self._on_batch(hub), on_error=self._on_error,
                                 max_batch_size=self.batch_size, max_wait_time=0.5, starting_position="-1")

    def run(self):
        store = checkpoint_store()
        for hub in (os.environ.get("OVERLAP_EVENTS_HUB", EVENTS_HUB),
                    os.environ.get("OVERLAP_TRACKING_HUB", TRACKING_HUB)):
            threading.Thread(target=self._read, args=(hub, store), daemon=True).start()
        log.info("archiver running: consumer group archiver on both hubs")
        last = time.monotonic()
        try:
            while not self.stop.wait(0.5):
                if time.monotonic() - last >= 10:
                    last = time.monotonic()
                    with self.lock:
                        log.info("totals %s", self.totals)
        finally:
            for c in self.clients:
                c.close()
            log.info("stopped; totals %s", self.totals)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="archiver")
    ap.add_argument("--batch-size", type=int, default=100)
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)
    runner = Runner(args.batch_size)
    signal.signal(signal.SIGINT, lambda *_: runner.stop.set())
    runner.run()


if __name__ == "__main__":
    main()
