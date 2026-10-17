"""Archiver core: routes hub messages to permanent storage. Spec: archiver/specs/storage.md.

No storage code here: the Cosmos side (event_store.py) and the Blob side (tracking_chunks.py) are passed in, so the
same core runs in the Azure Function (functions/function_app.py), the local runner (main.py) and the tests.

One call = one batch from one hub. Per match: setup → `matches`, events → `events`, stat panels → `stats`, frames →
per-minute tracking files; the `PeriodEnd` of period 2 records the result. Every write is idempotent (upserts, staged
blocks with stable ids), so a redelivered batch never duplicates anything. The caller moves the Event Hubs checkpoint
only after `handle` returns.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass, field
from typing import Protocol

log = logging.getLogger("archiver")

EVENTS_HUB = "match-events"
TRACKING_HUB = "match-tracking"
ID_MATCH = re.compile(r"^SYN-\d{4}$")


@dataclass
class Message:
    hub: str
    kind: str
    match_id: str | None
    body: object
    where: str = ""


def parse(hub: str, body: str | bytes | dict, properties: dict | None, where: str = "") -> Message:
    props = {(k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
             for k, v in (properties or {}).items()}
    try:
        obj = body if isinstance(body, dict) else json.loads(body)
    except (ValueError, TypeError):
        obj = None
    kind = props.get("kind") or ("tracking" if hub == TRACKING_HUB else "")
    match_id = props.get("match_id") or (obj.get("match_id") if isinstance(obj, dict) else None)
    return Message(hub, kind, match_id, obj, where)


class EventStore(Protocol):
    def save_setup(self, match_id: str, setup: dict) -> None: ...
    def save_events(self, match_id: str, events: list[dict]) -> None: ...
    def save_stats(self, match_id: str, panels: list[dict]) -> None: ...
    def finish(self, match_id: str) -> None: ...


class TrackingStore(Protocol):
    def append(self, match_id: str, period: int, minute: int, frames: list[dict]) -> None: ...


def _int(v) -> bool:
    return isinstance(v, int) and not isinstance(v, bool)


def problem(msg: Message) -> str | None:
    """Checks the identifying fields only; the screen relay does the full contract check."""
    b = msg.body
    if not isinstance(b, dict):
        return "not a JSON object"
    if not msg.match_id or not ID_MATCH.match(str(msg.match_id)) or b.get("match_id") != msg.match_id:
        return "missing or mismatched match_id"
    if msg.kind == "setup":
        teams = b.get("teams")
        return None if isinstance(teams, dict) and {"home", "away"} <= set(teams) else "setup without teams"
    if msg.kind == "event":
        if not _int(b.get("seq")) or b["seq"] < 1:
            return "event without seq"
        if b.get("event_id") != f"{msg.match_id}-{b['seq']:05d}":
            return "event_id does not match seq"
        if not isinstance(b.get("type"), str) or not _int(b.get("period")) or not _int(b.get("match_ms")):
            return "event without type, period or match_ms"
        return None
    if msg.kind == "stats":
        return None if _int(b.get("match_ms")) else "stat panel without match_ms"
    if msg.kind == "tracking":
        if not (_int(b.get("period")) and _int(b.get("period_ms")) and _int(b.get("match_ms"))):
            return "frame without period, period_ms or match_ms"
        return None if isinstance(b.get("players"), list) else "frame without players"
    return f"unknown kind {msg.kind!r}"


@dataclass
class Batch:
    setups: list[dict] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)
    stats: list[dict] = field(default_factory=list)
    minutes: dict[tuple[int, int], list[dict]] = field(default_factory=dict)
    finished: bool = False


class Archiver:
    def __init__(self, events: EventStore, tracking: TrackingStore):
        self.events = events
        self.tracking = tracking

    def handle(self, messages: list[Message]) -> dict:
        totals = {"messages": len(messages), "setups": 0, "events": 0, "stats": 0, "frames": 0, "invalid": 0}
        batches: dict[str, Batch] = {}
        for m in messages:
            why = problem(m)
            if why:
                totals["invalid"] += 1
                log.warning("invalid message %s: %s", m.where or m.hub, why)
                continue
            b = batches.setdefault(m.match_id, Batch())
            if m.kind == "setup":
                b.setups.append(m.body)
            elif m.kind == "event":
                b.events.append(m.body)
                if m.body["type"] == "PeriodEnd" and m.body["period"] == 2:
                    b.finished = True
            elif m.kind == "stats":
                b.stats.append(m.body)
            else:
                key = (m.body["period"], m.body["period_ms"] // 60000)
                b.minutes.setdefault(key, []).append(m.body)
        for match_id, b in batches.items():
            for setup in b.setups:
                self.events.save_setup(match_id, setup)
            if b.events:
                self.events.save_events(match_id, b.events)
            if b.stats:
                self.events.save_stats(match_id, b.stats)
            for (period, minute), frames in sorted(b.minutes.items()):
                self.tracking.append(match_id, period, minute, frames)
            if b.finished:
                self.events.finish(match_id)
            totals["setups"] += len(b.setups)
            totals["events"] += len(b.events)
            totals["stats"] += len(b.stats)
            totals["frames"] += sum(len(f) for f in b.minutes.values())
        return totals
