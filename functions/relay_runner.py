"""Runs the screen relay core outside the Functions host, with the Event Hubs SDK (functions/specs/screen-relay.md §5).

Used locally when the Functions host can't read the Event Hubs emulator, and by the end-to-end check. Same core,
store and sender as the Azure Function; only the way messages arrive differs.

    uv run python relay_runner.py            # settings from the environment (infra/local/env.example)
    uv run python relay_runner.py --from-latest   # skip what arrived while the relay was off (clears its positions)

Reads `match-events` and `match-tracking` as consumer group `relay`. Reading positions are saved in Blob Storage
(Azurite locally) only after a batch's envelopes and state are saved, so a restart resumes where it left off.
"""

from __future__ import annotations

import argparse
import logging
import os
import signal
import threading
import time

import screen_relay as R
from azure.core.exceptions import ResourceExistsError
from azure.eventhub import EventHubConsumerClient
from azure.eventhub.extensions.checkpointstoreblob import BlobCheckpointStore
from azure.storage.blob import BlobServiceClient
from relay_store import from_env

log = logging.getLogger("screen_relay.runner")
CHECKPOINT_CONTAINER = "relay-checkpoints"
# Azurite's public, documented development account (works only against Azurite on localhost).
AZURITE = ("DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
           "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
           "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;")


def checkpoint_store() -> BlobCheckpointStore:
    conn = os.environ.get("AzureWebJobsStorage", "UseDevelopmentStorage=true")
    if conn.strip().rstrip(";") == "UseDevelopmentStorage=true":
        conn = AZURITE
    service = BlobServiceClient.from_connection_string(conn)
    try:
        service.create_container(CHECKPOINT_CONTAINER)
    except ResourceExistsError:
        pass
    return BlobCheckpointStore.from_connection_string(conn, CHECKPOINT_CONTAINER)


def consumer(hub: str, store: BlobCheckpointStore) -> EventHubConsumerClient:
    group = os.environ.get("OVERLAP_RELAY_CONSUMER_GROUP", "relay")
    conn = os.environ.get("OVERLAP_EVENTHUBS_CONNECTION")
    if conn:
        return EventHubConsumerClient.from_connection_string(conn, consumer_group=group, eventhub_name=hub,
                                                             checkpoint_store=store)
    from azure.identity import DefaultAzureCredential
    return EventHubConsumerClient(os.environ["OVERLAP_EVENTHUBS_NAMESPACE"], hub, group,
                                  credential=DefaultAzureCredential(), checkpoint_store=store)


def clear_positions(group: str) -> int:
    """Delete this consumer group's saved reading positions, so reading starts at the newest messages. For a local
    relay that was off while matches streamed: otherwise it replays their events without their setups."""
    conn = os.environ.get("AzureWebJobsStorage", "UseDevelopmentStorage=true")
    if conn.strip().rstrip(";") == "UseDevelopmentStorage=true":
        conn = AZURITE
    container = BlobServiceClient.from_connection_string(conn).get_container_client(CHECKPOINT_CONTAINER)
    names = [b.name for b in container.list_blobs() if f"/{group}/checkpoint/" in b.name.lower()]
    for name in names:
        container.delete_blob(name)
    return len(names)


class Runner:
    def __init__(self, batch_size: int = 100, from_latest: bool = False):
        store, sender = from_env()
        self.relay = R.Relay(store, sender)
        self.batch_size = batch_size
        self.start = "@latest" if from_latest else "-1"
        self.stop = threading.Event()
        self.clients: list[EventHubConsumerClient] = []
        self.lock = threading.Lock()
        self.totals = {"messages": 0, "envelopes": 0, "invalid": 0}

    def _on_batch(self, hub: str):
        def handle(partition_context, events):
            if not events:
                return
            msgs = [R.parse(hub, e.body_as_str(), e.properties,
                            f"{hub}/p{partition_context.partition_id}/{e.offset}") for e in events]
            result = self.relay.handle(msgs)
            with self.lock:
                for k in self.totals:
                    self.totals[k] += result[k]
            partition_context.update_checkpoint(events[-1])
        return handle

    def _on_error(self, partition_context, error):
        pid = getattr(partition_context, "partition_id", "?")
        log.error("reader error on partition %s: %s", pid, error)

    def _read(self, hub: str, store: BlobCheckpointStore):
        client = consumer(hub, store)
        self.clients.append(client)
        with client:
            client.receive_batch(on_event_batch=self._on_batch(hub), on_error=self._on_error,
                                 max_batch_size=self.batch_size, max_wait_time=0.1, starting_position=self.start)

    def _ticks(self):
        last_report = time.monotonic()
        while not self.stop.wait(R.IDLE_FLUSH_S):
            try:
                self.relay.tick()
            except Exception as ex:  # noqa: BLE001  keep the timer alive; the next tick retries
                log.error("tick failed: %s", ex)
            if time.monotonic() - last_report >= 10:
                last_report = time.monotonic()
                with self.lock:
                    log.info("totals %s", self.totals)

    def run(self):
        store = checkpoint_store()
        threads = [threading.Thread(target=self._read, args=(hub, store), daemon=True)
                   for hub in (os.environ.get("OVERLAP_EVENTS_HUB", R.EVENTS_HUB),
                               os.environ.get("OVERLAP_TRACKING_HUB", R.TRACKING_HUB))]
        threads.append(threading.Thread(target=self._ticks, daemon=True))
        for t in threads:
            t.start()
        log.info("screen relay running: consumer group relay on both hubs")
        try:
            while not self.stop.is_set():
                time.sleep(0.5)
        finally:
            for c in self.clients:
                c.close()
            log.info("stopped; totals %s", self.totals)


def main(argv=None):
    ap = argparse.ArgumentParser(prog="relay_runner")
    ap.add_argument("--batch-size", type=int, default=100)
    ap.add_argument("--from-latest", action="store_true",
                    help="start at the newest messages, clearing this relay's saved positions (local catch-up)")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(levelname)s %(message)s")
    logging.getLogger("azure").setLevel(logging.WARNING)
    if args.from_latest:
        checkpoint_store()                                   # creates the container if it's missing
        cleared = clear_positions(os.environ.get("OVERLAP_RELAY_CONSUMER_GROUP", "relay"))
        log.info("cleared %d saved positions; reading from the newest messages", cleared)
    runner = Runner(args.batch_size, args.from_latest)
    signal.signal(signal.SIGINT, lambda *_: runner.stop.set())
    runner.run()


if __name__ == "__main__":
    main()
