"""Azure Functions app (Python v2 model): the screen relay. Spec: functions/specs/screen-relay.md §5.

Two Event Hubs triggers (one per hub, consumer group `relay`) feed the same core as the local runner; a timer flushes
open frame bundles and drops messages held too long for a setup. Settings (app settings on Azure):

  EVENTHUBS__fullyQualifiedNamespace   <name>.servicebus.windows.net (managed identity); locally EVENTHUBS = emulator
  OVERLAP_EVENTS_HUB / OVERLAP_TRACKING_HUB / OVERLAP_RELAY_CONSUMER_GROUP
  OVERLAP_COSMOS_*, OVERLAP_WEBPUBSUB_*   see relay_store.py

The moment trigger (functions/moment_trigger.py) is added here by the insight flow.
"""

from __future__ import annotations

import json
import logging

import azure.functions as func
import screen_relay as R
from relay_store import from_env

app = func.FunctionApp()
log = logging.getLogger("screen_relay.function")
_relay: R.Relay | None = None


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


def _messages(hub: str, events: list[func.EventHubEvent]) -> list[R.Message]:
    out = []
    for e in events:
        meta = e.metadata or {}
        where = f"{hub}/{meta.get('PartitionContext', {}).get('PartitionId', '?')}/{meta.get('Offset', '?')}"
        out.append(R.parse(hub, e.get_body().decode("utf-8"), _properties(e), where))
    return out


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
