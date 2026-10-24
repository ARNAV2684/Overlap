"""Screen relay core: raw Event Hubs messages in, CONTRACTS.md §7 envelopes out.

Spec: functions/specs/screen-relay.md. Pure logic: no network or storage here, so the same code runs in the Azure
Function (function_app.py), in the local runner (relay_runner.py) and in the tests. I/O goes through two small
interfaces (`Store`, `Sender`) implemented in relay_store.py.

One call = one batch of messages from one hub. Messages are grouped by match; each match's state is loaded, the
messages are applied, and the new envelopes plus the state are saved together (the store rejects the save if another
call changed the state in between, and the batch is re-applied). Only then are the envelopes sent.
"""

from __future__ import annotations

import hashlib
import json
import logging
import re
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from typing import Protocol

log = logging.getLogger("screen_relay")

EVENTS_HUB = "match-events"
TRACKING_HUB = "match-tracking"
BUNDLE_SIZE = 5
IDLE_FLUSH_S = 0.25
HOLD_MAX_MESSAGES = 2000
HOLD_MAX_S = 10.0
HOLD_MAX_BYTES = 1_200_000  # held messages live in the state document (Cosmos limit 2 MB)
CHUNK = 40  # messages per save: keeps one save under Cosmos's 100 operations per transactional batch
RECENT_EVENT_HASHES = 300
SEND_ATTEMPTS = 3
SEND_BACKOFF_S = (0.5, 1.0, 2.0)
SAVE_ATTEMPTS = 8
# Kinds the browser keeps newest-by-match_ms (web/specs/realtime.md §2), so they may leave in any order; event and
# status envelopes are shown in arrival order and always leave one by one in seq order.
UNORDERED_KINDS = ("positions", "stats")

# ----------------------------------------------------------------------------------------------- contract checks

ID_MATCH = re.compile(r"^SYN-\d{4}$")
ID_PLAYER = re.compile(r"^[A-Z]{3}-\d{2}$")
CLOCK = re.compile(r"^\d{1,3}(\+\d{1,2})?:\d{2}$")
SETUP_REQUIRED = {"match_id", "seed", "competition", "season_id", "venue", "kickoff_utc", "storylines", "teams"}
SETUP_OPTIONAL = {"conditions"}
TEAM_FIELDS = {"team_id", "name", "colours", "formation", "style", "lineup", "bench"}
EVENT_TYPES = {"Pass", "Carry", "TakeOn", "Shot", "Save", "Tackle", "Interception", "Clearance", "Aerial",
               "Pressure", "BallRecovery", "Foul", "Card", "Substitution", "Offside", "Corner", "PeriodStart",
               "PeriodEnd"}
EVENT_REQUIRED = {"event_id", "match_id", "seq", "possession_id", "period", "period_ms", "match_ms", "clock", "type"}
EVENT_FIELDS = EVENT_REQUIRED | {
    "team_id", "player_id", "x", "y", "end_x", "end_y", "outcome", "body_part", "under_pressure", "qualifiers",
    "receiver_id", "shot_outcome", "situation", "shot_speed_kmh", "goal_mouth_y", "goal_mouth_z", "assisted_by",
    "key_pass_event_id", "fouled_player_id", "card", "player_on_id", "ball_speed_kmh", "target_player_id"}
FRAME_FIELDS = {"match_id", "period", "period_ms", "match_ms", "ball", "players"}
SUPPORTED_PERIODS = (1, 2)


class Invalid(ValueError):
    pass


def _need(cond: bool, msg: str):
    if not cond:
        raise Invalid(msg)


def _num(v) -> bool:
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def check_setup(s: dict) -> None:
    _need(isinstance(s, dict), "setup is not an object")
    keys = set(s)
    _need(SETUP_REQUIRED <= keys <= SETUP_REQUIRED | SETUP_OPTIONAL,
          f"setup fields {sorted(keys ^ SETUP_REQUIRED - SETUP_OPTIONAL)}")
    _need(bool(ID_MATCH.match(str(s["match_id"]))), "setup match_id")
    for side in ("home", "away"):
        t = s["teams"].get(side) if isinstance(s["teams"], dict) else None
        _need(isinstance(t, dict) and set(t) == TEAM_FIELDS, f"setup team {side}")
        _need(len(t["lineup"]) == 11 and t["lineup"][0].get("pos") == "GK", f"setup {side} lineup")
        for p in t["lineup"] + t["bench"]:
            _need(bool(ID_PLAYER.match(str(p.get("player_id", "")))), f"setup {side} player_id")
    _need(s["teams"]["home"]["team_id"] != s["teams"]["away"]["team_id"], "setup same team twice")


def check_event(e: dict) -> None:
    _need(isinstance(e, dict), "event is not an object")
    extra = set(e) - EVENT_FIELDS
    _need(not extra, f"event unknown fields {sorted(extra)}")
    missing = EVENT_REQUIRED - set(e)
    _need(not missing, f"event missing {sorted(missing)}")
    _need(isinstance(e["seq"], int) and e["seq"] >= 1, "event seq")
    _need(e["event_id"] == f"{e['match_id']}-{e['seq']:05d}", "event_id does not match seq")
    _need(e["type"] in EVENT_TYPES, f"event type {e['type']!r}")
    _need(bool(CLOCK.match(str(e["clock"]))), "event clock")
    _need(isinstance(e["match_ms"], int) and e["match_ms"] >= 0, "event match_ms")
    if e["type"] not in ("PeriodStart", "PeriodEnd"):
        _need("team_id" in e and "player_id" in e, "event needs team_id and player_id")
    for k in ("x", "y", "end_x", "end_y"):
        if k in e:
            _need(_num(e[k]) and 0 <= e[k] <= 100, f"event {k} out of range")
    if e["type"] == "Shot":
        _need(e.get("shot_outcome") in {"goal", "saved", "missed", "blocked", "woodwork"}, "shot_outcome")
    else:
        _need("shot_outcome" not in e, "shot_outcome on a non-shot")


def check_frame(f: dict) -> None:
    _need(isinstance(f, dict) and set(f) == FRAME_FIELDS, "frame fields")
    _need(isinstance(f["match_ms"], int) and f["match_ms"] >= 0, "frame match_ms")
    _need(set(f["ball"]) == {"x", "y", "z", "speed_kmh"}, "frame ball fields")
    _need(isinstance(f["players"], list) and f["players"], "frame players")
    for p in f["players"]:
        _need(set(p) == {"player_id", "x", "y", "speed_kmh", "dist_m"}, "frame player fields")
        _need(_num(p["x"]) and _num(p["y"]) and 0 <= p["x"] <= 100 and 0 <= p["y"] <= 100, "frame player position")


def clock(period: int, period_ms: int) -> str:
    """CONTRACTS.md §1.2 display clock for periods 1 and 2."""
    base, end = {1: (0, 45), 2: (45, 90)}[period]
    total_s = base * 60 + period_ms // 1000
    minute, second = divmod(total_s, 60)
    return f"{end}+{minute - end}:{second:02d}" if minute >= end else f"{minute}:{second:02d}"


def canonical(obj) -> str:
    return json.dumps(obj, sort_keys=True, separators=(",", ":"))


def digest(obj) -> str:
    return hashlib.sha1(canonical(obj).encode()).hexdigest()


# ----------------------------------------------------------------------------------------------- I/O interfaces


class Store(Protocol):
    def load(self, match_id: str) -> tuple[dict | None, object]:
        """Returns (state or None, version token for the conditional save)."""

    def save(self, match_id: str, state: dict, version: object, envelopes: list[dict]) -> bool:
        """Atomically writes the new envelopes and the state if the state is still at `version`. False on conflict."""

    def matches_with_open_work(self) -> list[str]:
        """Match ids whose state has an open frame bundle or held messages."""


class Sender(Protocol):
    def send(self, group: str, envelope: dict) -> None: ...


# ----------------------------------------------------------------------------------------------- state


def new_state(match_id: str) -> dict:
    return {
        "match_id": match_id, "seq": 0, "setup": None, "phase": "pre_match", "period": 0,
        "score": {"home": 0, "away": 0}, "side_of_team": {},
        "last_event_seq": 0, "event_hashes": {}, "last_frame_ms": -1, "last_stats_ms": -1,
        "bundle": [], "bundle_at": 0.0, "held": [], "held_since": 0.0, "held_bytes": 0, "open_work": False,
        "counts": {"received": 0, "duplicates": 0, "conflicts": 0, "invalid": 0, "held": 0, "gaps": 0,
                   "envelopes": 0, "send_failures": 0},
    }


@dataclass
class Message:
    hub: str
    kind: str
    match_id: str | None
    body: object
    where: str = ""  # hub/partition/offset for logs


@dataclass
class Outcome:
    envelopes: list[dict] = field(default_factory=list)
    invalid: list[str] = field(default_factory=list)


class Match:
    """Applies messages for one match to its state and collects the envelopes to send. No I/O."""

    def __init__(self, state: dict, now: float):
        self.s = state
        self.now = now
        self.out = Outcome()

    # -- envelopes
    def _emit(self, kind: str, match_ms: int, clk: str, data: dict):
        self.s["seq"] += 1
        self.s["counts"]["envelopes"] += 1
        self.out.envelopes.append({"seq": self.s["seq"], "kind": kind, "match_id": self.s["match_id"],
                                   "match_ms": match_ms, "clock": clk, "data": data})

    def _status(self, match_ms: int, clk: str, with_setup: bool = False):
        data = {"phase": self.s["phase"], "period": self.s["period"], "score": dict(self.s["score"])}
        if with_setup:
            data["setup"] = self.s["setup"]
        self._emit("status", match_ms, clk, data)

    def _invalid(self, msg: Message, reason: str):
        self.s["counts"]["invalid"] += 1
        self.out.invalid.append(f"{msg.where or msg.hub}: {reason}")
        log.warning("invalid message %s: %s", msg.where or msg.hub, reason)

    # -- entry point
    def apply(self, msg: Message):
        self.s["counts"]["received"] += 1
        if msg.kind == "setup":
            self._setup(msg)
            return
        if self.s["setup"] is None:
            self._hold(msg)
            return
        self._dispatch(msg)

    def _dispatch(self, msg: Message):
        if msg.kind == "event":
            self._event(msg)
        elif msg.kind == "tracking":
            self._frame(msg)
        elif msg.kind == "stats":
            self._stats(msg)
        else:
            self._invalid(msg, f"unknown kind {msg.kind!r}")

    # -- setup
    def _setup(self, msg: Message):
        try:
            check_setup(msg.body)
        except Invalid as ex:
            self._invalid(msg, str(ex))
            return
        if self.s["setup"] is not None:
            if digest(self.s["setup"]) == digest(msg.body):
                self.s["counts"]["duplicates"] += 1
            else:
                self.s["counts"]["conflicts"] += 1
                log.error("conflicting setup for %s ignored", self.s["match_id"])
            return
        self.s["setup"] = msg.body
        self.s["side_of_team"] = {msg.body["teams"][side]["team_id"]: side for side in ("home", "away")}
        self._status(0, "0:00", with_setup=True)
        held, self.s["held"], self.s["held_bytes"] = self.s["held"], [], 0
        for raw in held:
            self._dispatch(Message(raw["hub"], raw["kind"], self.s["match_id"], raw["body"], raw["where"]))

    def _hold(self, msg: Message):
        if not self.s["held"]:
            self.s["held_since"] = self.now
            self.s["held_bytes"] = 0
        self.s["held"].append({"hub": msg.hub, "kind": msg.kind, "body": msg.body, "where": msg.where})
        self.s["held_bytes"] += len(canonical(msg.body))
        self.s["counts"]["held"] += 1
        if len(self.s["held"]) > HOLD_MAX_MESSAGES or self.s["held_bytes"] > HOLD_MAX_BYTES:
            self.drop_held(f"too many messages before the setup ({len(self.s['held'])} messages, "
                           f"{self.s['held_bytes']} bytes)")

    def drop_held(self, reason: str):
        for raw in self.s["held"]:
            self._invalid(Message(raw["hub"], raw["kind"], self.s["match_id"], raw["body"], raw["where"]),
                          f"dropped: {reason}")
        self.s["held"] = []
        self.s["held_bytes"] = 0

    # -- events
    def _event(self, msg: Message):
        e = msg.body
        try:
            check_event(e)
        except Invalid as ex:
            self._invalid(msg, str(ex))
            return
        seq = e["seq"]
        h = digest(e)
        hashes = self.s["event_hashes"]
        if seq <= self.s["last_event_seq"]:
            known = hashes.get(str(seq))
            if known is not None and known != h:
                self.s["counts"]["conflicts"] += 1
                log.error("conflicting event %s ignored", e["event_id"])
            else:
                self.s["counts"]["duplicates"] += 1
            return
        if e["period"] not in SUPPORTED_PERIODS:
            self._invalid(msg, f"period {e['period']} not supported yet")
            return
        if seq != self.s["last_event_seq"] + 1:
            self.s["counts"]["gaps"] += 1
            log.warning("event gap in %s: %d -> %d", self.s["match_id"], self.s["last_event_seq"], seq)
        self.s["last_event_seq"] = seq
        hashes[str(seq)] = h
        if len(hashes) > RECENT_EVENT_HASHES:
            for k in sorted(hashes, key=int)[:-RECENT_EVENT_HASHES]:
                del hashes[k]
        self._emit("event", e["match_ms"], e["clock"], e)
        t = e["type"]
        if t == "PeriodStart":
            self.flush_bundle()
            self.s["phase"], self.s["period"] = "live", e["period"]
            self._status(e["match_ms"], e["clock"])
        elif t == "Shot" and e.get("shot_outcome") == "goal":
            side = self.s["side_of_team"].get(e.get("team_id"))
            if side:
                self.s["score"][side] += 1
                self._status(e["match_ms"], e["clock"])
            else:
                self._invalid(msg, f"goal by unknown team {e.get('team_id')!r}")
        elif t == "PeriodEnd":
            self.s["phase"] = "half_time" if e["period"] == 1 else "full_time"
            self.s["period"] = e["period"]
            self._status(e["match_ms"], e["clock"])

    # -- frames
    def _frame(self, msg: Message):
        f = msg.body
        try:
            check_frame(f)
        except Invalid as ex:
            self._invalid(msg, str(ex))
            return
        if f["match_ms"] <= self.s["last_frame_ms"]:
            self.s["counts"]["duplicates"] += 1
            return
        if f["period"] not in SUPPORTED_PERIODS:
            self._invalid(msg, f"period {f['period']} not supported yet")
            return
        self.s["last_frame_ms"] = f["match_ms"]
        bundle = self.s["bundle"]
        if bundle and bundle[-1]["period"] != f["period"]:
            self.flush_bundle()
            bundle = self.s["bundle"]
        bundle.append(f)
        self.s["bundle_at"] = self.now
        if len(bundle) >= BUNDLE_SIZE:
            self.flush_bundle()

    def flush_bundle(self):
        frames = self.s["bundle"]
        if not frames:
            return
        last = frames[-1]
        self.s["bundle"] = []
        self._emit("positions", last["match_ms"], clock(last["period"], last["period_ms"]), {"frames": frames})

    # -- stats panels (payload defined by the stats flow; forwarded unchanged)
    def _stats(self, msg: Message):
        p = msg.body
        if not isinstance(p, dict) or not isinstance(p.get("match_ms"), int) or "clock" not in p:
            self._invalid(msg, "stats panel needs match_ms and clock")
            return
        if p["match_ms"] <= self.s["last_stats_ms"]:
            self.s["counts"]["duplicates"] += 1
            return
        self.s["last_stats_ms"] = p["match_ms"]
        self._emit("stats", p["match_ms"], str(p["clock"]), p)

    # -- timer work
    def tick(self):
        if self.s["bundle"] and self.now - self.s["bundle_at"] >= IDLE_FLUSH_S:
            self.flush_bundle()
        if self.s["held"] and self.now - self.s["held_since"] >= HOLD_MAX_S:
            self.drop_held(f"setup did not arrive within {HOLD_MAX_S:.0f} s")


# ----------------------------------------------------------------------------------------------- relay


def parse(hub: str, body: str | bytes | dict, properties: dict | None, where: str = "") -> Message:
    props = {(k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
             for k, v in (properties or {}).items()}
    try:
        obj = body if isinstance(body, dict) else json.loads(body)
    except (ValueError, TypeError):
        obj = None
    kind = props.get("kind") or ("tracking" if hub == TRACKING_HUB else None)
    match_id = props.get("match_id") or (obj.get("match_id") if isinstance(obj, dict) else None)
    return Message(hub, kind or "", match_id, obj, where)


class Relay:
    def __init__(self, store: Store, sender: Sender, clock_fn=time.monotonic, sleep_fn=time.sleep,
                 send_workers: int = 1):
        self.store = store
        self.sender = sender
        self.clock = clock_fn
        self.sleep = sleep_fn
        # send_workers > 1: positions and stats envelopes are sent side by side (each send is one HTTP call to Web
        # PubSub, and one at a time held the relay below 20x on Azure); events and status still go one by one, in order
        self._pool = ThreadPoolExecutor(send_workers, thread_name_prefix="relay-send") if send_workers > 1 else None
        # One lock per match around load → save → send, so a match's envelopes leave in seq order even when the
        # events reader, the tracking reader and the timer run at the same time. (Across processes the ETag check
        # keeps numbering correct; on Azure the app runs on one instance so order holds there too.)
        self._locks: dict[str, threading.Lock] = {}
        self._locks_guard = threading.Lock()

    def _lock(self, match_id: str) -> threading.Lock:
        with self._locks_guard:
            return self._locks.setdefault(match_id, threading.Lock())

    def handle(self, messages: list[Message]) -> dict:
        """Applies one batch. Returns totals for logging."""
        by_match: dict[str, list[Message]] = {}
        totals = {"messages": len(messages), "envelopes": 0, "invalid": 0}
        for m in messages:
            if m.body is None or not m.match_id or not isinstance(m.body, dict):
                totals["invalid"] += 1
                log.warning("invalid message %s: not JSON or no match_id", m.where or m.hub)
                continue
            if m.body.get("match_id") != m.match_id:
                totals["invalid"] += 1
                log.warning("invalid message %s: match_id property and body disagree", m.where or m.hub)
                continue
            by_match.setdefault(m.match_id, []).append(m)
        ms = {"wait": 0.0, "load": 0.0, "apply": 0.0, "save": 0.0, "send": 0.0}   # per stage, for the batch's log line
        for match_id, msgs in by_match.items():
            for i in range(0, len(msgs), CHUNK):
                chunk = msgs[i:i + CHUNK]
                out = self._commit(match_id, lambda match, chunk=chunk: [match.apply(x) for x in chunk], ms)
                totals["envelopes"] += len(out.envelopes)
                totals["invalid"] += len(out.invalid)
        totals["ms"] = {k: round(v) for k, v in ms.items()}
        return totals

    def tick(self) -> int:
        """Timer work for every match with an open bundle or held messages. Returns envelopes sent."""
        sent = 0
        for match_id in self.store.matches_with_open_work():
            sent += len(self._commit(match_id, lambda match: match.tick()).envelopes)
        return sent

    def _commit(self, match_id: str, work, ms: dict | None = None) -> Outcome:
        ms = ms if ms is not None else {}
        t = time.perf_counter()
        with self._lock(match_id):
            ms["wait"] = ms.get("wait", 0.0) + (time.perf_counter() - t) * 1000   # behind another reader of this match
            return self._commit_locked(match_id, work, ms)

    def _commit_locked(self, match_id: str, work, ms: dict) -> Outcome:
        def lap(stage: str, since: float) -> float:
            now = time.perf_counter()
            ms[stage] = ms.get(stage, 0.0) + (now - since) * 1000
            return now

        for attempt in range(SAVE_ATTEMPTS):
            t = time.perf_counter()
            state, version = self.store.load(match_id)
            t = lap("load", t)
            match = Match(state if state is not None else new_state(match_id), self.clock())
            before = digest(match.s)
            work(match)
            match.s["open_work"] = bool(match.s["bundle"] or match.s["held"])
            unchanged = state is not None and digest(match.s) == before
            t = lap("apply", t)
            if unchanged:
                return match.out
            saved = self.store.save(match_id, match.s, version, match.out.envelopes)
            t = lap("save", t)
            if saved:
                self._send(match_id, match.out.envelopes, match.s)
                lap("send", t)
                return match.out
            log.info("state of %s changed meanwhile; re-applying (attempt %d)", match_id, attempt + 1)
        raise RuntimeError(f"could not save state for {match_id} after {SAVE_ATTEMPTS} attempts")

    def _send(self, match_id: str, envelopes: list[dict], state: dict):
        group = f"match-{match_id}"
        if self._pool is None:
            for env in envelopes:
                self._send_one(group, env)
            return
        ordered = [e for e in envelopes if e["kind"] not in UNORDERED_KINDS]
        futures = [self._pool.submit(self._send_one, group, e) for e in envelopes if e["kind"] in UNORDERED_KINDS]
        for env in ordered:
            self._send_one(group, env)
        for f in futures:  # every send is done before the match's lock is released, so commits never overtake
            f.result()

    def _send_one(self, group: str, env: dict):
        for attempt in range(SEND_ATTEMPTS):
            try:
                self.sender.send(group, env)
                return
            except Exception as ex:  # noqa: BLE001  saved already; the browser recovers from the snapshot
                if attempt == SEND_ATTEMPTS - 1:
                    log.error("send failed for %s seq %d: %s", group, env["seq"], ex)
                else:
                    self.sleep(SEND_BACKOFF_S[attempt])
