# publish.py — Publish
#
# Purpose: build a stat panel for every whole match second and send it; keep each match's match_state document;
#          write each moment exactly once
# Inputs:  state.MatchState, before and after each ordered event; fired triggers
# Outputs: stat panels (CONTRACTS.md §7.4) to a sender; match_state documents (§4.2) to a store; moment documents
#          (§10.2) to a moment store
# Spec:    stats/specs/publishing.md §1–§3
#
# Panel N describes every event with match_ms < N × 1000. It is built when the first event at or after N × 1000
# arrives, from the state before that event, so a live run and a replay give the same panels (frames never trigger
# one).

from __future__ import annotations

import json
import logging
import math
import os
import queue
import threading
import time
from collections.abc import Callable
from typing import Protocol

import evidence
import rolling
import triggers
import whole_match
from state import SIDES, MatchState

log = logging.getLogger("stats.publish")

HEAVY_EVERY_S = 60
STATE_EVERY_S = 5
SEND_ATTEMPTS = 3
RETRY_WAIT_S = (1.0, 10.0)            # a throttled hub asks for 10 s
MATCH_STATE_CONTAINER = "match_state"
MOMENTS_CONTAINER = "moments"
SYSTEM_FIELDS = ("_rid", "_self", "_etag", "_attachments", "_ts")


class MomentConflict(RuntimeError):
    """A moment with this id exists with different content: the match stops, the old document stays."""


class Sender(Protocol):
    def send(self, match_id: str, panel: dict, received_at: float | None = None) -> None: ...


class StateStore(Protocol):
    def upsert(self, doc: dict) -> None: ...


class MomentStore(Protocol):
    def create(self, doc: dict) -> bool: ...          # True when written, False for an identical repeat


def same_moment(a: dict, b: dict) -> bool:
    """Equal apart from Cosmos system fields."""
    def clean(d):
        return {k: v for k, v in d.items() if k not in SYSTEM_FIELDS}
    return clean(a) == clean(b)


def clock_at(period: int, period_ms: int) -> str:
    """The display clock, as the generator writes it (`62:14`, `45+2:10`)."""
    base = 45 * (period - 1)
    minutes, seconds = divmod(max(period_ms, 0) // 1000, 60)
    if minutes < 45:
        return f"{base + minutes}:{seconds:02d}"
    return f"{base + 45}+{minutes - 45}:{seconds:02d}"


def light_panel(state: MatchState, second: int) -> dict:
    """CONTRACTS.md §7.4, for match second `second`, from the state as it is now."""
    match_ms = second * 1000
    start = state.period_start_ms.get(state.period, 0)
    period_ms = match_ms - start
    at = rolling.At(state.period, period_ms)
    teams, low = {}, []
    for side in SIDES:
        t = whole_match.team_summary(state, side)
        row = {
            "team_id": t["team_id"], "possession_pct": t["possession_pct"], "shots": t["shots"],
            "shots_on_target": t["shots_on_target"], "xg": t["xg"], "passes": t["passes"],
            "pass_completion_pct": t["pass_completion_pct"],
            "ppda_last_10min": rolling.ppda(state, side, at, rolling.LAST_10),
            "pressures_per_opp_pass_last_10min": rolling.pressing_rate(state, side, at, rolling.LAST_10),
            "momentum_share_last_10min_pct": rolling.momentum_share_pct(state, side, at, rolling.LAST_10),
            "press_height_last_10min_m": rolling.press_height_m(state, side, at, rolling.LAST_10),
        }
        low += [f"teams.{side}.{k}" for k, v in row.items() if v is None]
        teams[side] = row
    return {"match_id": state.match_id, "match_ms": match_ms, "clock": clock_at(state.period, period_ms),
            "period": state.period, "source_seq": state.source_seq, "score": dict(state.score), "teams": teams,
            "momentum": whole_match.current_bucket(state), "low_sample": low}


def match_state_doc(state: MatchState, panel: dict | None) -> dict:
    """CONTRACTS.md §4.2: the latest numbers for a match."""
    return {"id": "state", "match_id": state.match_id, "kind": "match_state", "schema_version": 1,
            "source": {"event_seq": state.source_seq, "match_ms": state.match_ms},
            "phase": state.phase, "period": state.period, "clock": state.clock, "score": dict(state.score),
            "panel": panel, "totals": {s: whole_match.team_summary(state, s) for s in SIDES},
            "players": whole_match.player_summary(state)}


class Publisher:
    """Decides when panels and match_state documents are due, builds them and hands them on."""

    def __init__(self, sender: Sender, store: StateStore | None = None):
        self.sender = sender
        self.store = store
        self.next_second: dict[str, int] = {}
        self.last_panel: dict[str, dict] = {}

    def _emit(self, state: MatchState, second: int, heavy: bool, received_at: float | None) -> None:
        panel = light_panel(state, second)
        if heavy:
            panel["heavy"] = whole_match.heavy(state)
        self.sender.send(state.match_id, panel, received_at)
        self.last_panel[state.match_id] = panel
        if self.store is not None and second % STATE_EVERY_S == 0:
            self.store.upsert(match_state_doc(state, panel))

    def before(self, state: MatchState, event: dict, received_at: float | None = None) -> None:
        """Panels for every whole second up to this event, from the state before it."""
        mid = state.match_id
        second = self.next_second.get(mid)
        if second is None:
            return
        while second * 1000 <= event["match_ms"]:
            self._emit(state, second, second % HEAVY_EVERY_S == 0, received_at)
            second += 1
        self.next_second[mid] = second

    def after(self, state: MatchState, event: dict, received_at: float | None = None) -> None:
        mid = state.match_id
        if event["type"] == "PeriodStart":
            first = math.ceil(event["match_ms"] / 1000)
            self.next_second[mid] = max(self.next_second.get(mid, first), first)
            if self.store is not None:
                self.store.upsert(match_state_doc(state, self.last_panel.get(mid)))
        elif event["type"] == "PeriodEnd":
            second = max(self.next_second.get(mid, 0), math.ceil(event["match_ms"] / 1000))
            self._emit(state, second, True, received_at)
            self.next_second[mid] = second + 1
            if self.store is not None:
                self.store.upsert(match_state_doc(state, self.last_panel.get(mid)))


class Moments:
    """Triggers, evidence and moment documents for every match (publishing.md §3). Moments are written directly,
    not queued, so they are stored before the checkpoint can move past their event; match_state follows each."""

    def __init__(self, store: MomentStore, state_store: StateStore | None = None,
                 last_panel: Callable[[str], dict | None] | None = None):
        self.store = store
        self.state_store = state_store
        self.last_panel = last_panel
        self.triggers: dict[str, triggers.Triggers] = {}
        self.builders: dict[str, evidence.Builder] = {}
        self.ordinal: dict[str, int] = {}
        self.written: dict[str, int] = {}
        self.repeats: dict[str, int] = {}

    def after(self, state: MatchState, event: dict, numbers: dict) -> list[dict]:
        mid = state.match_id
        if mid not in self.triggers:
            self.triggers[mid] = triggers.Triggers(state)
            self.builders[mid] = evidence.Builder(state)
        docs = []
        for fired in self.triggers[mid].evaluate(event, numbers):
            self.ordinal[mid] = self.ordinal.get(mid, 0) + 1
            doc = self.builders[mid].document(fired, self.ordinal[mid])
            if self.store.create(doc):
                self.written[mid] = self.written.get(mid, 0) + 1
            else:
                self.repeats[mid] = self.repeats.get(mid, 0) + 1
            docs.append(doc)
        if docs and self.state_store is not None:
            self.state_store.upsert(match_state_doc(state, self.last_panel(mid) if self.last_panel else None))
        return docs


# --- senders and stores ------------------------------------------------------------------------------------------


class ListSender:
    """Keeps panels in memory (replay, tests)."""

    def __init__(self):
        self.panels: dict[str, list[dict]] = {}

    def send(self, match_id: str, panel: dict, received_at: float | None = None) -> None:
        self.panels.setdefault(match_id, []).append(panel)


class DictStore:
    def __init__(self):
        self.docs: dict[tuple[str, str], dict] = {}
        self.writes = 0

    def upsert(self, doc: dict) -> None:
        self.docs[(doc["match_id"], doc["id"])] = doc
        self.writes += 1


class DictMomentStore:
    """Moments in memory (replay, tests), with the same create-once rule as Cosmos."""

    def __init__(self):
        self.docs: dict[tuple[str, str], dict] = {}

    def create(self, doc: dict) -> bool:
        key = (doc["match_id"], doc["id"])
        old = self.docs.get(key)
        if old is None:
            self.docs[key] = doc
            return True
        if same_moment(old, doc):
            return False
        raise MomentConflict(f"{doc['match_id']}: moment {doc['id']} already exists with different content")


class HubSender:
    """Sends panels on match-events as kind=stats (publishing.md §2), as many as fit in one batch. A batch is retried
    up to 3 times, then its panels are skipped: the next ones supersede them."""

    def __init__(self, producer):
        self.producer = producer
        self.skipped = 0

    @classmethod
    def from_env(cls) -> HubSender:
        from azure.eventhub import EventHubProducerClient
        hub = os.environ.get("OVERLAP_EVENTS_HUB", "match-events")
        conn = os.environ.get("OVERLAP_EVENTHUBS_CONNECTION")
        if conn:
            return cls(EventHubProducerClient.from_connection_string(conn, eventhub_name=hub))
        from azure.identity import DefaultAzureCredential
        return cls(EventHubProducerClient(os.environ["OVERLAP_EVENTHUBS_NAMESPACE"], hub,
                                          credential=DefaultAzureCredential()))

    def send(self, match_id: str, panel: dict, received_at: float | None = None) -> None:
        self.send_many(match_id, [panel])

    def send_many(self, match_id: str, panels: list[dict]) -> int:
        """Sends panels in order, packing each batch as full as it goes. Returns how many were sent."""
        from azure.eventhub import EventData
        sent, i = 0, 0
        while i < len(panels):
            batch = self.producer.create_batch(partition_key=match_id)
            start = i
            while i < len(panels):
                data = EventData(json.dumps(panels[i], separators=(",", ":")))
                data.properties = {"kind": "stats", "match_id": match_id}
                data.content_type = "application/json"
                try:
                    batch.add(data)
                except ValueError:                     # the batch is full
                    if i == start:
                        raise
                    break
                i += 1
            if self._send_batch(match_id, batch, panels[start]["match_ms"]):
                sent += i - start
            else:
                self.skipped += i - start
        return sent

    def _send_batch(self, match_id: str, batch, first_ms: int) -> bool:
        from azure.core.exceptions import AzureError
        from azure.eventhub.exceptions import EventHubError
        for attempt in range(SEND_ATTEMPTS):
            try:
                self.producer.send_batch(batch)
                return True
            except (AzureError, EventHubError) as err:    # EventHubError does not derive from AzureError
                log.warning("%s: panels from %s send failed (%s/%s): %s", match_id, first_ms, attempt + 1,
                            SEND_ATTEMPTS, str(err).splitlines()[0][:200])
                if attempt < SEND_ATTEMPTS - 1:
                    time.sleep(RETRY_WAIT_S[min(attempt, len(RETRY_WAIT_S) - 1)])
        return False

    def close(self) -> None:
        self.producer.close()


class Background:
    """Keeps network calls off the pipeline: panels are queued and sent in order, packed into as few batches as
    possible; match_state writes are coalesced to the latest document per match. One worker thread."""

    def __init__(self, hub: HubSender, store: StateStore | None, clock: Callable[[], float] = time.time):
        self.hub = hub
        self.store = store
        self.clock = clock
        self.panels: queue.SimpleQueue = queue.SimpleQueue()
        self.latest_state: dict[str, dict] = {}
        self.lock = threading.Lock()
        self.latency_s: dict[str, list[float]] = {}
        self.sent: dict[str, int] = {}
        self.stopping = threading.Event()
        self.worker = threading.Thread(target=self._run, daemon=True, name="stats-publisher")
        self.worker.start()

    # Sender
    def send(self, match_id: str, panel: dict, received_at: float | None = None) -> None:
        self.panels.put((match_id, panel, received_at))

    # StateStore
    def upsert(self, doc: dict) -> None:
        with self.lock:
            self.latest_state[doc["match_id"]] = doc

    def _drain(self) -> bool:
        items = []
        try:
            items.append(self.panels.get(timeout=0.2))
            while True:
                items.append(self.panels.get_nowait())
        except queue.Empty:
            pass
        by_match: dict[str, list[tuple[dict, float | None]]] = {}
        for match_id, panel, received_at in items:
            by_match.setdefault(match_id, []).append((panel, received_at))
        for match_id, rows in by_match.items():
            self.sent[match_id] = self.sent.get(match_id, 0) + self.hub.send_many(match_id, [p for p, _ in rows])
            now = self.clock()
            self.latency_s.setdefault(match_id, []).extend(now - r for _, r in rows if r is not None)
        with self.lock:
            docs, self.latest_state = self.latest_state, {}
        for doc in docs.values():
            if self.store is not None:
                try:
                    self.store.upsert(doc)
                except Exception as err:               # noqa: BLE001 - a failed write is retried with the next one
                    log.warning("%s: match_state write failed: %s", doc["match_id"], err)
        return bool(items or docs)

    def _run(self) -> None:
        while not self.stopping.is_set() or not self.panels.empty() or self.latest_state:
            try:
                self._drain()
            except Exception:                          # the worker must outlive any one failure
                log.exception("publisher worker: a drain failed; carrying on")
                time.sleep(1.0)

    def queued(self) -> int:
        return self.panels.qsize()

    def close(self) -> None:
        self.stopping.set()
        self.worker.join(timeout=30)
        self.hub.close()


class CosmosStateStore:
    """Cosmos `live` / `match_state`, partition /match_id (CONTRACTS.md §4.2). Settings as the archiver's."""

    def __init__(self, container):
        self.container = container

    @classmethod
    def from_env(cls) -> CosmosStateStore:
        from azure.cosmos import CosmosClient, PartitionKey
        endpoint = os.environ["OVERLAP_COSMOS_ENDPOINT"]
        key = os.environ.get("OVERLAP_COSMOS_KEY")
        database = os.environ.get("OVERLAP_COSMOS_DATABASE", "live")
        if key:                               # local emulator: create what's missing (Bicep creates these on Azure)
            db = CosmosClient(endpoint, credential=key).create_database_if_not_exists(database)
            return cls(db.create_container_if_not_exists(MATCH_STATE_CONTAINER,
                                                         partition_key=PartitionKey("/match_id")))
        from azure.identity import DefaultAzureCredential
        db = CosmosClient(endpoint, credential=DefaultAzureCredential()).get_database_client(database)
        return cls(db.get_container_client(MATCH_STATE_CONTAINER))

    def upsert(self, doc: dict) -> None:
        self.container.upsert_item(doc)


class CosmosMomentStore:
    """Cosmos `live` / `moments`, partition /match_id: create, never upsert (publishing.md §3)."""

    def __init__(self, container):
        self.container = container

    @classmethod
    def from_env(cls) -> CosmosMomentStore:
        from azure.cosmos import CosmosClient, PartitionKey
        endpoint = os.environ["OVERLAP_COSMOS_ENDPOINT"]
        key = os.environ.get("OVERLAP_COSMOS_KEY")
        database = os.environ.get("OVERLAP_COSMOS_DATABASE", "live")
        if key:                               # local emulator: create what's missing (Bicep creates these on Azure)
            db = CosmosClient(endpoint, credential=key).create_database_if_not_exists(database)
            return cls(db.create_container_if_not_exists(MOMENTS_CONTAINER, partition_key=PartitionKey("/match_id")))
        from azure.identity import DefaultAzureCredential
        db = CosmosClient(endpoint, credential=DefaultAzureCredential()).get_database_client(database)
        return cls(db.get_container_client(MOMENTS_CONTAINER))

    def create(self, doc: dict) -> bool:
        from azure.cosmos.exceptions import CosmosResourceExistsError
        try:
            self.container.create_item(doc)
            return True
        except CosmosResourceExistsError:
            old = self.container.read_item(doc["id"], partition_key=doc["match_id"])
            if same_moment(old, doc):
                return False
            raise MomentConflict(f"{doc['match_id']}: moment {doc['id']} already exists with different content")
