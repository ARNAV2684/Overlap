"""Event Hubs producer: the same messages the generator's live mode will send.

- `match-events`: the setup (once, first) and every event, in order
- `match-tracking`: every 5 Hz tracking frame
- partition key = match_id, so one match's messages stay in order on one partition
- each message has application properties `kind` (`setup` / `event` / `tracking`) and `match_id`

PROVISIONAL: putting the setup on `match-events` with `kind=setup` is not in CONTRACTS.md yet; agree it with the
generator before relying on it.
"""

from __future__ import annotations

import json
import os
import sys

from azure.eventhub import EventData
from azure.eventhub.aio import EventHubProducerClient

# Microsoft's documented local-emulator connection string. It only works against the emulator on localhost and is
# not a secret. Real Azure uses your signed-in identity instead (no keys).
EMULATOR_CONNECTION = (
    "Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;"
    "SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;"
)
EVENTS_HUB = os.environ.get("OVERLAP_EVENTS_HUB", "match-events")
TRACKING_HUB = os.environ.get("OVERLAP_TRACKING_HUB", "match-tracking")


def make_client(target: str, hub: str, namespace: str | None, consumer: bool = False, consumer_group: str = "$Default"):
    """target: "emulator" or "azure". Azure needs `namespace` (e.g. myns.servicebus.windows.net) and `az login`."""
    if consumer:
        from azure.eventhub.aio import EventHubConsumerClient as Client
        extra = {"consumer_group": consumer_group}
    else:
        Client = EventHubProducerClient
        extra = {}
    if target == "emulator":
        return Client.from_connection_string(EMULATOR_CONNECTION, eventhub_name=hub, **extra)
    if target == "azure":
        namespace = namespace or os.environ.get("OVERLAP_EVENTHUBS_NAMESPACE")
        if not namespace:
            raise SystemExit("Azure target needs --namespace or OVERLAP_EVENTHUBS_NAMESPACE "
                             "(e.g. overlap-dev.servicebus.windows.net)")
        from azure.identity.aio import DefaultAzureCredential
        return Client(fully_qualified_namespace=namespace, eventhub_name=hub, credential=DefaultAzureCredential(),
                      **extra)
    raise ValueError(f"unknown Event Hubs target {target!r}")


class EventHubsSink:
    def __init__(self, target: str, namespace: str | None = None):
        self.target = target
        self.namespace = namespace
        self.events = None
        self.tracking = None
        self.sent = {"setup": 0, "event": 0, "tracking": 0}
        self.failures = 0

    async def start(self):
        self.events = make_client(self.target, EVENTS_HUB, self.namespace)
        self.tracking = make_client(self.target, TRACKING_HUB, self.namespace)

    async def close(self):
        for c in (self.events, self.tracking):
            if c is not None:
                await c.close()

    async def _send(self, client, match_id: str, items) -> None:
        if not items:
            return
        batch = await client.create_batch(partition_key=match_id)
        for it in items:
            ed = EventData(json.dumps(it.data, ensure_ascii=False, separators=(",", ":")))
            ed.content_type = "application/json"
            ed.properties = {"kind": it.kind, "match_id": match_id}
            try:
                batch.add(ed)
            except ValueError:  # batch full: send it and start another
                await client.send_batch(batch)
                batch = await client.create_batch(partition_key=match_id)
                batch.add(ed)
        await client.send_batch(batch)

    async def send(self, match_id: str, items) -> None:
        ev = [i for i in items if i.kind in ("setup", "event")]
        tr = [i for i in items if i.kind == "tracking"]
        try:
            await self._send(self.events, match_id, ev)
            await self._send(self.tracking, match_id, tr)
            for i in items:
                self.sent[i.kind] += 1
        except Exception as ex:  # noqa: BLE001  the SDK already retried; log and keep the stream going
            self.failures += 1
            print(f"[hubs] send failed for {match_id} ({len(items)} messages): {ex}", file=sys.stderr)
