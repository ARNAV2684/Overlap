# live.py — Live mode
#
# Purpose: stream a played match into Event Hubs (or stdout) at 1x, 5x or 20x, in order
# Inputs:  a MatchResult; the speed; where to send (emulator, Azure or off)
# Outputs: the setup, events and 5 Hz tracking frames on `match-events` and `match-tracking`
# Spec:    generator/specs/live-and-batch.md §1
#
# The match is played in memory first, then released on a timer: a message is due at match_ms / speed after
# kickoff, plus the lead-in and half-time. Messages due in the same 200 ms go out as one batch per hub.

from __future__ import annotations

import asyncio
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Protocol

import config
from state import MatchResult

EVENTS_HUB = "match-events"
TRACKING_HUB = "match-tracking"
NAMESPACE_VAR = "OVERLAP_EVENTHUBS_NAMESPACE"     # e.g. <name>.servicebus.windows.net, for Azure runs
# Microsoft's documented local-emulator connection string. It only works against the emulator on localhost and is
# not a secret. Azure runs sign in with the runner's identity instead (DefaultAzureCredential), so no keys.
EMULATOR_CONNECTION = (
    "Endpoint=sb://localhost;SharedAccessKeyName=RootManageSharedAccessKey;"
    "SharedAccessKey=SAS_KEY_VALUE;UseDevelopmentEmulator=true;"
)
HALF_TIME_S = 15 * 60
HALF_TIME_CAP_S = 60
RETRY_FOR_S = 60.0


@dataclass(frozen=True)
class Message:
    due_s: float           # seconds after the stream starts
    hub: str
    kind: str              # setup, event, tracking
    body: dict
    seq: int = 0           # events only


class StreamError(RuntimeError):
    def __init__(self, match_id: str, last_seq: int, cause: Exception):
        super().__init__(f"{match_id}: stopped after seq {last_seq}: {cause}")
        self.match_id, self.last_seq = match_id, last_seq


def lead_in_s(speed: float) -> float:
    return 30.0 / speed


def schedule(result: MatchResult, speed: float, lead_in: float | None = None) -> list[Message]:
    """Every message with its due time: the setup first, then events and frames at match_ms / speed."""
    lead = lead_in_s(speed) if lead_in is None else lead_in
    half = min(HALF_TIME_S / speed, HALF_TIME_CAP_S)

    def due(match_ms: int, period: int) -> float:
        return lead + match_ms / 1000 / speed + (half if period >= 2 else 0.0)

    msgs = [Message(0.0, EVENTS_HUB, "setup", result.setup)]
    for e in result.events:
        msgs.append(Message(due(e["match_ms"], e["period"]), EVENTS_HUB, "event", e, e["seq"]))
    for f in result.frames:
        msgs.append(Message(due(f["match_ms"], f["period"]), TRACKING_HUB, "tracking", f))
    order = {"setup": 0, "event": 1, "tracking": 2}
    msgs.sort(key=lambda m: (m.due_s, order[m.kind], m.seq))
    return msgs


def batches(msgs: list[Message]) -> list[tuple[float, list[Message]]]:
    """Group messages due within the same 200 ms window. A batch leaves when its last message is due, so nothing
    is ever sent early and nothing is more than one window late."""
    step = config.STEP_MS / 1000
    groups: list[list[Message]] = []
    for m in msgs:
        if groups and m.due_s - groups[-1][0].due_s < step and m.kind != "setup" and groups[-1][0].kind != "setup":
            groups[-1].append(m)
        else:
            groups.append([m])
    return [(g[-1].due_s, g) for g in groups]


class Sink(Protocol):
    async def start(self) -> None: ...
    async def send(self, match_id: str, hub: str, msgs: list[Message]) -> None: ...
    async def close(self) -> None: ...


class StdoutSink:
    """Prints raw messages as NDJSON (events only, or everything)."""

    def __init__(self, events_only: bool = True):
        self.events_only = events_only

    async def start(self) -> None:
        return None

    async def send(self, match_id: str, hub: str, msgs: list[Message]) -> None:
        out = getattr(sys.stdout, "buffer", None)
        for m in msgs:
            if self.events_only and m.kind == "tracking":
                continue
            line = json.dumps({"kind": m.kind, "data": m.body}, ensure_ascii=False) + "\n"
            if out is not None:
                out.write(line.encode("utf-8"))    # UTF-8 whatever the console's code page (names like Šimunić)
            else:
                sys.stdout.write(line)
        sys.stdout.flush()
        if out is not None:
            out.flush()

    async def close(self) -> None:
        return None


class EventHubsSink:
    """Azure Event Hubs or the local emulator; partition key match_id; properties kind and match_id."""

    def __init__(self, target: str, namespace: str | None = None):
        self.target, self.namespace = target, namespace
        self.clients: dict = {}

    def _client(self, hub: str):
        from azure.eventhub.aio import EventHubProducerClient

        if self.target == "emulator":
            return EventHubProducerClient.from_connection_string(EMULATOR_CONNECTION, eventhub_name=hub)
        from azure.identity.aio import DefaultAzureCredential

        namespace = self.namespace or os.environ.get(NAMESPACE_VAR)
        if not namespace:
            raise RuntimeError(f"set {NAMESPACE_VAR} (or --namespace) to stream to Azure Event Hubs")
        return EventHubProducerClient(fully_qualified_namespace=namespace, eventhub_name=hub,
                                      credential=DefaultAzureCredential())

    async def start(self) -> None:
        for hub in (EVENTS_HUB, TRACKING_HUB):
            self.clients[hub] = self._client(hub)

    async def send(self, match_id: str, hub: str, msgs: list[Message]) -> None:
        from azure.eventhub import EventData

        client = self.clients[hub]
        batch = await client.create_batch(partition_key=match_id)
        for m in msgs:
            ed = EventData(json.dumps(m.body, ensure_ascii=False, separators=(",", ":")))
            ed.content_type = "application/json"
            ed.properties = {"kind": m.kind, "match_id": match_id}
            try:
                batch.add(ed)
            except ValueError:                 # batch full: send it, start another
                await client.send_batch(batch)
                batch = await client.create_batch(partition_key=match_id)
                batch.add(ed)
        await client.send_batch(batch)

    async def close(self) -> None:
        for c in self.clients.values():
            await c.close()


async def _send_with_retry(sink: Sink, match_id: str, hub: str, msgs: list[Message], last_seq: int,
                           sleep=asyncio.sleep, retry_for: float = RETRY_FOR_S) -> None:
    waited, wait = 0.0, 0.5
    while True:
        try:
            await sink.send(match_id, hub, msgs)
            return
        except Exception as err:  # the SDK has already retried; keep trying, then stop the match
            if waited >= retry_for:
                raise StreamError(match_id, last_seq, err) from err
            await sleep(wait)
            waited += wait
            wait = min(wait * 2, 8.0)


async def stream(result: MatchResult, sinks: list[Sink], speed: float, *, lead_in: float | None = None,
                 clock=time.monotonic, sleep=asyncio.sleep, log=print) -> int:
    """Release one match's messages on time. Returns the number of messages sent."""
    match_id = result.setup["match_id"]
    msgs = schedule(result, speed, lead_in)
    start = clock()
    last_seq, sent, next_note = 0, 0, 5 * 60_000
    for due, group in batches(msgs):
        delay = start + due - clock()
        if delay > 0:
            await sleep(delay)
        for hub in (EVENTS_HUB, TRACKING_HUB):
            part = [m for m in group if m.hub == hub]
            if not part:
                continue
            for sink in sinks:
                await _send_with_retry(sink, match_id, hub, part, last_seq, sleep=sleep)
            sent += len(part)
        last_seq = max([last_seq] + [m.seq for m in group])
        last_ms = max((m.body.get("match_ms", 0) for m in group if m.kind != "setup"), default=0)
        if last_ms >= next_note:
            log(f"{match_id}: {last_ms // 60000}' streamed, seq {last_seq}")
            next_note += 5 * 60_000
    log(f"{match_id}: finished, {sent} messages, last seq {last_seq}")
    return sent


async def stream_many(results: list[MatchResult], sinks: list[Sink], speed: float, **kw) -> list[int]:
    for s in sinks:
        await s.start()
    try:
        return list(await asyncio.gather(*(stream(r, sinks, speed, **kw) for r in results)))
    finally:
        for s in sinks:
            await s.close()
