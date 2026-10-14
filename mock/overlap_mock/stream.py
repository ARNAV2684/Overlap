"""Turns a played match into a timeline, paces it in real time, and builds browser envelopes (CONTRACTS.md §7).

Raw messages (setup, events, tracking frames) are what the generator puts on Event Hubs. Envelopes are what the
screen relay sends to browsers; the local Web PubSub stand-in and the recorded files use them.
"""

from __future__ import annotations

import asyncio
import time
from dataclasses import dataclass

from . import pitch

POSITIONS_BUNDLE = 5  # tracking frames per `positions` envelope: about one message per second


@dataclass
class Item:
    match_ms: int  # -1 for the setup message
    kind: str  # "setup" / "event" / "tracking"
    data: dict


def timeline(result) -> list[Item]:
    """Setup first, then events and tracking frames merged in match-time order (events before a frame at the same ms)."""
    items = [Item(-1, "setup", result.setup)]
    ev, fr = result.events, result.frames
    i = j = 0
    while i < len(ev) or j < len(fr):
        if j >= len(fr) or (i < len(ev) and ev[i]["match_ms"] <= fr[j]["match_ms"]):
            items.append(Item(ev[i]["match_ms"], "event", ev[i]))
            i += 1
        else:
            items.append(Item(fr[j]["match_ms"], "tracking", fr[j]))
            j += 1
    return items


class EnvelopeBuilder:
    """One per match. Feed it raw items in order; it returns (group, envelope) pairs.

    PROVISIONAL choices (CONTRACTS.md leaves these open):
    - the setup travels as a `status` envelope with `data.phase = "pre_match"` and `data.setup`
    - `positions` carries `data.frames`: the last 5 tracking frames (1 s)
    - a `status` envelope is also sent at each period start/end and after every goal, with the score
    """

    def __init__(self, setup: dict):
        self.setup = setup
        self.match_id = setup["match_id"]
        self.group = f"match-{self.match_id}"
        self.side_of = {setup["teams"][s]["team_id"]: s for s in ("home", "away")}
        self.seq = 0
        self.score = {"home": 0, "away": 0}
        self.phase = "pre_match"
        self.period = 0
        self.frames: list[dict] = []
        self.last_clock = "0:00"

    def _env(self, kind: str, match_ms: int, clock: str, data: dict) -> tuple[str, dict]:
        self.seq += 1
        return self.group, {"seq": self.seq, "kind": kind, "match_id": self.match_id, "match_ms": max(0, match_ms),
                            "clock": clock, "data": data}

    def status(self, match_ms: int, clock: str) -> tuple[str, dict]:
        data = {"phase": self.phase, "period": self.period, "score": dict(self.score)}
        if self.phase == "pre_match":
            data["setup"] = self.setup
        return self._env("status", match_ms, clock, data)

    def feed(self, item: Item) -> list[tuple[str, dict]]:
        out: list[tuple[str, dict]] = []
        if item.kind == "setup":
            out.append(self.status(0, "0:00"))
        elif item.kind == "event":
            e = item.data
            self.last_clock = e["clock"]
            if e["type"] == "PeriodStart":
                self.phase, self.period = "live", e["period"]
                out.append(self.status(e["match_ms"], e["clock"]))
            out.append(self._env("event", e["match_ms"], e["clock"], e))
            if e["type"] == "Shot" and e["shot_outcome"] == "goal":
                self.score[self.side_of[e["team_id"]]] += 1
                out.append(self.status(e["match_ms"], e["clock"]))
            if e["type"] == "PeriodEnd":
                out.extend(self.flush())
                self.phase = "full_time" if e["period"] >= 2 else "half_time"
                out.append(self.status(e["match_ms"], e["clock"]))
        elif item.kind == "tracking":
            self.frames.append(item.data)
            if len(self.frames) >= POSITIONS_BUNDLE:
                out.extend(self.flush())
        return out

    def flush(self) -> list[tuple[str, dict]]:
        if not self.frames:
            return []
        last = self.frames[-1]
        env = self._env("positions", last["match_ms"], pitch.clock(last["period"], last["period_ms"]),
                        {"frames": self.frames})
        self.frames = []
        return [env]


class Pacer:
    """Releases timeline items at real-time pace: wall time = match time / speed, plus pre-kickoff and half-time waits."""

    def __init__(self, items: list[Item], speed: float, pre_kickoff_s: float, halftime_s: float):
        self.items = items
        self.speed = speed
        self.pre_kickoff_s = pre_kickoff_s
        self.halftime_s = halftime_s
        self.idx = 0
        self.t0 = 0.0

    def due_s(self, item: Item) -> float:
        if item.match_ms < 0:
            return 0.0
        extra = self.halftime_s if (item.kind == "event" and item.data["period"] >= 2) or \
            (item.kind == "tracking" and item.data["period"] >= 2) else 0.0
        return self.pre_kickoff_s + item.match_ms / 1000 / self.speed + extra

    async def batches(self):
        """Yields lists of items as they fall due."""
        self.t0 = time.monotonic()
        n = len(self.items)
        while self.idx < n:
            now = time.monotonic() - self.t0
            batch = []
            while self.idx < n and self.due_s(self.items[self.idx]) <= now:
                batch.append(self.items[self.idx])
                self.idx += 1
            if batch:
                yield batch
            if self.idx < n:
                wait = self.due_s(self.items[self.idx]) - (time.monotonic() - self.t0)
                await asyncio.sleep(max(0.005, min(wait, 0.5)))
