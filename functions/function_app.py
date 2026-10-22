"""Azure Functions app (Python v2 model): the screen relay, the archiver and the insight agents.
Specs: functions/specs/screen-relay.md §5, archiver/specs/storage.md §5, functions/specs/moment-trigger.md.

Two Event Hubs triggers (one per hub, consumer group `relay`) feed the same core as the local runner; a timer flushes
open frame bundles and drops messages held too long for a setup. Settings (app settings on Azure):

  EVENTHUBS__fullyQualifiedNamespace   <name>.servicebus.windows.net (managed identity); locally EVENTHUBS = emulator
  OVERLAP_EVENTS_HUB / OVERLAP_TRACKING_HUB / OVERLAP_RELAY_CONSUMER_GROUP
  OVERLAP_COSMOS_*, OVERLAP_WEBPUBSUB_*   see relay_store.py
  OVERLAP_ARCHIVER_CONSUMER_GROUP (archiver), OVERLAP_ARCHIVE_BLOB_ENDPOINT   see archiver/tracking_chunks.py

The archiver's, agents' and MCP server's code lives in archiver/, agents/ and mcp_server/; the deployment package
(package.py) puts those folders beside this file. In the repository they are siblings of functions/.

Insights: a new moment starts the agents (Cosmos change feed on `moments`), a match_state at full time starts the
recap (change feed on `match_state`), and a timer publishes cards and player tags. COSMOS is the Cosmos connection
(locally the emulator's connection string; on Azure COSMOS__accountEndpoint with managed identity).
"""

from __future__ import annotations

import json
import logging
import sys
import typing
from pathlib import Path

import azure.functions as func

import screen_relay as R
from relay_store import from_env

HERE = Path(__file__).resolve().parent
_ARCHIVER = next((p for p in (HERE / "archiver", HERE.parent / "archiver") if p.is_dir()), HERE.parent / "archiver")
if _ARCHIVER.is_dir() and str(_ARCHIVER) not in sys.path:
    sys.path.append(str(_ARCHIVER))

import consumer as archive

app = func.FunctionApp()
# Binding annotations: the Python worker accepts typing.List but rejects the built-in list[...] ("invalid non-type
# annotation"), and then loads no function at all.
Events = typing.List[func.EventHubEvent]  # noqa: UP006
log = logging.getLogger("screen_relay.function")
_relay: R.Relay | None = None
_archiver: archive.Archiver | None = None


def relay() -> R.Relay:
    global _relay
    if _relay is None:
        store, sender = from_env()
        _relay = R.Relay(store, sender)
    return _relay


def _as_dict(value) -> dict:
    if isinstance(value, str):
        try:
            value = json.loads(value)
        except ValueError:
            value = {}
    return value if isinstance(value, dict) else {}


def _properties(events: Events) -> list[dict]:
    """Each message's application properties (`kind`, `match_id`), in order. In a batch (cardinality many) every
    event's metadata is the whole batch's, with one entry per event in PropertiesArray; there is no Properties key,
    so reading it would leave every message without a kind (events-hub messages are then invalid)."""
    meta = (events[0].metadata or {}) if events else {}
    batch = meta.get("PropertiesArray")
    if isinstance(batch, str):
        try:
            batch = json.loads(batch)
        except ValueError:
            batch = None
    if isinstance(batch, list) and len(batch) == len(events):
        return [_as_dict(p) for p in batch]
    return [_as_dict((e.metadata or {}).get("Properties") or (e.metadata or {}).get("properties")) for e in events]


def _where(hub: str, e: func.EventHubEvent) -> str:
    meta = e.metadata or {}
    offset = e.offset if e.offset is not None else meta.get("Offset", "?")
    return f"{hub}/{_as_dict(meta.get('PartitionContext')).get('PartitionId', '?')}/{offset}"


def _messages(hub: str, events: Events) -> list[R.Message]:
    return [R.parse(hub, e.get_body().decode("utf-8"), p, _where(hub, e)) for e, p in zip(events, _properties(events))]


def _handle(hub: str, events: Events):
    totals = relay().handle(_messages(hub, events))
    log.info("relay %s: %s", hub, totals)


@app.function_name("relay_events")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_EVENTS_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_RELAY_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def relay_events(events: Events) -> None:
    _handle(R.EVENTS_HUB, events)


@app.function_name("relay_tracking")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_TRACKING_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_RELAY_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def relay_tracking(events: Events) -> None:
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


def _archive(hub: str, events: Events):
    msgs = [archive.parse(hub, e.get_body().decode("utf-8"), p, _where(hub, e))
            for e, p in zip(events, _properties(events))]
    log.info("archive %s: %s", hub, archiver().handle(msgs))


@app.function_name("archive_events")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_EVENTS_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_ARCHIVER_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def archive_events(events: Events) -> None:
    _archive(R.EVENTS_HUB, events)


@app.function_name("archive_tracking")
@app.retry(strategy="exponential_backoff", max_retry_count=5, minimum_interval="00:00:01",
           maximum_interval="00:00:15")
@app.event_hub_message_trigger(arg_name="events", event_hub_name="%OVERLAP_TRACKING_HUB%", connection="EVENTHUBS",
                               consumer_group="%OVERLAP_ARCHIVER_CONSUMER_GROUP%", cardinality=func.Cardinality.MANY)
def archive_tracking(events: Events) -> None:
    _archive(R.TRACKING_HUB, events)


# --- Insight agents (layer 5). The agents' code is imported only inside these functions, so a missing agents
# dependency can only affect them, never the relay or the archiver above. They are async: the host runs them on one
# event loop, so they share one set of dependencies (moment_trigger.shared_deps) and the model breaker's state.

PUBLISH_WINDOW_S = 600       # matches whose match_state changed this recently get player tags and expiry checks
FEED_POLL_MS = 1000          # the change feed's default 5 s poll made moment → card p50 4 s (local poller: 1 s)


@app.function_name("moment_trigger")
@app.cosmos_db_trigger(arg_name="docs", connection="COSMOS", database_name="%OVERLAP_COSMOS_DATABASE%",
                       container_name="moments", lease_container_name="leases",
                       create_lease_container_if_not_exists=True, feed_poll_delay=FEED_POLL_MS)
async def moment_trigger(docs: func.DocumentList) -> None:
    import moment_trigger as insights
    results = await insights.handle_batch([d.to_dict() for d in docs], insights.shared_deps())
    log.info("moment trigger: %d moments, %s", len(results), [r.get("status") for r in results])


@app.function_name("recap_trigger")
@app.cosmos_db_trigger(arg_name="docs", connection="COSMOS", database_name="%OVERLAP_COSMOS_DATABASE%",
                       container_name="match_state", lease_container_name="leases", lease_container_prefix="recap-",
                       create_lease_container_if_not_exists=True)
async def recap_trigger(docs: func.DocumentList) -> None:
    import moment_trigger as insights
    await insights.handle_states([d.to_dict() for d in docs], insights.shared_deps())


@app.function_name("insights_publisher")
@app.timer_trigger(arg_name="timer", schedule="*/1 * * * * *", run_on_startup=False)
async def insights_publisher(timer: func.TimerRequest) -> None:
    import time

    import moment_trigger as insights
    totals = await insights.publish_pass(await insights.shared_publisher(), int(time.time()) - PUBLISH_WINDOW_S)
    if totals:
        log.info("insights publisher: %s", totals)
