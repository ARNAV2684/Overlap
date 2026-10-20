# publish.py — Publish
#
# Purpose: build a stat panel for every whole match second and send it; keep each match's match_state document
# Inputs:  state.MatchState, before and after each ordered event
# Outputs: stat panels (CONTRACTS.md §7.4) to a sender; match_state documents (§4.2) to a store
# Spec:    stats/specs/publishing.md §1–§2
#
# Panel N describes every event with match_ms < N × 1000. It is built when the first event at or after N × 1000
# arrives, from the state before that event, so a live run and a replay give the same panels (frames never trigger
# one). Moments come in stats S3.

from __future__ import annotations

import logging
import math
import os
import time
from collections.abc import Callable
from typing import Protocol

import rolling
import whole_match
from state import SIDES, MatchState

log = logging.getLogger("stats.publish")

HEAVY_EVERY_S = 60
STATE_EVERY_S = 5
SEND_ATTEMPTS = 3
MATCH_STATE_CONTAINER = "match_state"


class Sender(Protocol):
    def send(self, match_id: str, panel: dict) -> None: ...


class StateStore(Protocol):
    def upsert(self, doc: dict) -> None: ...


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

    def __init__(self, sender: Sender, store: StateStore | None = None, clock: Callable[[], float] = time.monotonic):
        self.sender = sender
        self.store = store
        self.clock = clock
        self.next_second: dict[str, int] = {}
        self.last_panel: dict[str, dict] = {}
        self.latency_s: dict[str, list[float]] = {}

    def _emit(self, state: MatchState, second: int, heavy: bool, received_at: float | None) -> None:
        panel = light_panel(state, second)
        if heavy:
            panel["heavy"] = whole_match.heavy(state)
        self.sender.send(state.match_id, panel)
        self.last_panel[state.match_id] = panel
        if received_at is not None:
            self.latency_s.setdefault(state.match_id, []).append(self.clock() - received_at)
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


# --- senders and stores ------------------------------------------------------------------------------------------


class ListSender:
    """Keeps panels in memory (replay, tests)."""

    def __init__(self):
        self.panels: dict[str, list[dict]] = {}

    def send(self, match_id: str, panel: dict) -> None:
        self.panels.setdefault(match_id, []).append(panel)


class DictStore:
    def __init__(self):
        self.docs: dict[tuple[str, str], dict] = {}
        self.writes = 0

    def upsert(self, doc: dict) -> None:
        self.docs[(doc["match_id"], doc["id"])] = doc
        self.writes += 1


class HubSender:
    """Sends panels on match-events as kind=stats (publishing.md §2). Retries a send up to 3 times, then skips that
    second's panel: the next one supersedes it."""

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

    def send(self, match_id: str, panel: dict) -> None:
        import json

        from azure.core.exceptions import AzureError
        from azure.eventhub import EventData
        for attempt in range(SEND_ATTEMPTS):
            try:
                batch = self.producer.create_batch(partition_key=match_id)
                data = EventData(json.dumps(panel, separators=(",", ":")))
                data.properties = {"kind": "stats", "match_id": match_id}
                data.content_type = "application/json"
                batch.add(data)
                self.producer.send_batch(batch)
                return
            except (AzureError, ValueError) as err:     # Event Hubs errors derive from AzureError
                log.warning("%s: panel %s send failed (%s/%s): %s", match_id, panel["match_ms"], attempt + 1,
                            SEND_ATTEMPTS, err)
        self.skipped += 1

    def close(self) -> None:
        self.producer.close()


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
