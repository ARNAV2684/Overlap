"""Azure Functions app (Python v2 model): the screen relay and the archiver.
Specs: functions/specs/screen-relay.md §5, archiver/specs/storage.md §5.

Two Event Hubs triggers (one per hub, consumer group `relay`) feed the same core as the local runner; a timer flushes
open frame bundles and drops messages held too long for a setup. Settings (app settings on Azure):

  EVENTHUBS__fullyQualifiedNamespace   <name>.servicebus.windows.net (managed identity); locally EVENTHUBS = emulator
  OVERLAP_EVENTS_HUB / OVERLAP_TRACKING_HUB / OVERLAP_RELAY_CONSUMER_GROUP
  OVERLAP_COSMOS_*, OVERLAP_WEBPUBSUB_*   see relay_store.py
  OVERLAP_ARCHIVER_CONSUMER_GROUP (archiver), OVERLAP_ARCHIVE_BLOB_ENDPOINT   see archiver/tracking_chunks.py

The archiver's code lives in archiver/; the deployment package copies it next to this file. Locally it is imported
from the repository.

The moment trigger (functions/moment_trigger.py) is added here by the insight flow.
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path

import azure.functions as func
import screen_relay as R
from relay_store import from_env

_ARCHIVER = Path(__file__).resolve().parent.parent / "archiver"
if _ARCHIVER.is_dir() and str(_ARCHIVER) not in sys.path:
    sys.path.append(str(_ARCHIVER))

import consumer as archive

app = func.FunctionApp()
log = logging.getLogger("screen_relay.function")
_relay: R.Relay | None = None
_archiver: archive.Archiver | None = None


def relay() -> R.Relay:
    global _relay
    if _relay is None:
        store, sender = from_env()
        _relay = R.Relay(store, sender)
    return _relay


def _properties(event: func.EventHubEvent) -> dict:
    meta = event.metadata or {}
    props = meta.get("Properties") or meta.get("properties") or {}
    if isinstance(props, str):
        try:
            props = json.loads(props)
        except ValueError:
            props = {}
    return props if isinstance(props, dict) else {}


def _where(hub: str, e: func.EventHubEvent) -> str:
    meta = e.metadata or {}
    return f"{hub}/{meta.get('PartitionContext', {}).get('PartitionId', '?')}/{meta.get('Offset', '?')}"


def _messages(hub: str, events: list[func.EventHubEvent]) -> list[R.Message]:
    return [R.parse(hub, e.get_body().decode("utf-8"), _properties(e), _where(hub, e)) for e in events]


def _handle(hub: str, events: list[func.EventHubEvent]):
    totals = relay().handle(_messages(hub, events))
    log.info("relay %s: %s", hub, totals)


@app.function_name("relay_events")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_EVENTS_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_RELAY_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def relay_events(events: list[func.EventHubEvent]) -> None:
    _handle(R.EVENTS_HUB, events)


@app.function_name("relay_tracking")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_TRACKING_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_RELAY_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def relay_tracking(events: list[func.EventHubEvent]) -> None:
    _handle(R.TRACKING_HUB, events)


@app.function_name("relay_tick")
@app.timer_trigger(arg_name="timer", schedule="*/1 * * * * *", run_on_startup=False)
def relay_tick(timer: func.TimerRequest) -> None:
    sent = relay().tick()
    if sent:
        log.info("relay tick: %d envelopes", sent)


def archiver() -> archive.Archiver:
    global _archiver
    if _archiver is None:
        from event_store import CosmosArchive
        from tracking_chunks import BlobTracking
        _archiver = archive.Archiver(CosmosArchive.from_env(), BlobTracking.from_env())
    return _archiver


def _archive(hub: str, events: list[func.EventHubEvent]):
    msgs = [archive.parse(hub, e.get_body().decode("utf-8"), _properties(e), _where(hub, e)) for e in events]
    log.info("archive %s: %s", hub, archiver().handle(msgs))


@app.function_name("archive_events")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_EVENTS_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_ARCHIVER_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def archive_events(events: list[func.EventHubEvent]) -> None:
    _archive(R.EVENTS_HUB, events)


@app.function_name("archive_tracking")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_TRACKING_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_ARCHIVER_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def archive_tracking(events: list[func.EventHubEvent]) -> None:
    _archive(R.TRACKING_HUB, events)


# --- Insight agents (layer 5): a new moment starts the workflow. The agents' code is imported only inside this
# function, so a missing agents dependency can only affect this trigger, never the relay or the archiver above.

@app.function_name("moment_trigger")
@app.cosmos_db_trigger(arg_name="docs", connection="COSMOS", database_name="%OVERLAP_COSMOS_DATABASE%",
                       container_name="moments", lease_container_name="leases",
                       create_lease_container_if_not_exists=True)
def moment_trigger(docs: func.DocumentList) -> None:
    import asyncio

    import moment_trigger as insights
    results = asyncio.run(insights.handle_batch([d.to_dict() for d in docs]))
    log.info("moment trigger: %d moments, %s", len(results), [r.get("status") for r in results])
