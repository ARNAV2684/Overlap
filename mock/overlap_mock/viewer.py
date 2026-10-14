"""Live viewer: reads both hubs and shows every match on a local page (TEMPORARY, like the rest of mock/).

It is a read-only consumer on consumer group `$Default`, so it never moves the `stats`, `relay` or `archiver`
reading positions, and it stores no checkpoints. It shows what actually arrived through Event Hubs, so it works the
same for the mock today and the generator later.

- `match-events` is read from the beginning: setups and scores of matches already in progress are rebuilt quietly,
  and only messages enqueued after the viewer started count towards the live rates.
- `match-tracking` is read from the latest message (or the beginning with `--from start`).
- A `setup` message starts a fresh run for its match, so a replayed match doesn't look like an ordering error.
"""

from __future__ import annotations

import asyncio
import json
import sys
import time
from collections import deque
from datetime import datetime, timezone
from pathlib import Path

from aiohttp import WSMsgType, web

from .sinks.eventhubs import EVENTS_HUB, TRACKING_HUB, make_client

PAGE = Path(__file__).with_name("viewer.html")
FRAME_PUSH_S = 0.2  # at most 5 position updates per match per second
STATE_PUSH_S = 1.0


def _props(event) -> dict:
    return {(k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
            for k, v in (event.properties or {}).items()}


class MatchView:
    def __init__(self, match_id: str):
        self.match_id = match_id
        self.reset()

    def reset(self):
        self.setup = None
        self.side_of_team: dict[str, str] = {}
        self.names: dict[str, str] = {}
        self.shirts: dict[str, int] = {}
        self.score = {"home": 0, "away": 0}
        self.clock = "0:00"
        self.period = 0
        self.phase = "unknown"
        self.last_seq = 0
        self.events = 0
        self.frames = 0
        self.warnings: deque[str] = deque(maxlen=6)
        self.feed: deque[dict] = deque(maxlen=40)
        self.frame = None
        self.frame_dirty = False
        self.last_frame_wall = 0.0
        self.runs = getattr(self, "runs", 0)

    def name(self, pid: str | None) -> str:
        if not pid:
            return ""
        return self.names.get(pid, pid)

    def apply_setup(self, setup: dict):
        runs = self.runs + 1
        self.reset()
        self.runs = runs
        self.setup = setup
        self.phase = "pre_match"
        for side in ("home", "away"):
            team = setup["teams"][side]
            self.side_of_team[team["team_id"]] = side
            for p in team["lineup"] + team["bench"]:
                self.names[p["player_id"]] = p["name"]
                self.shirts[p["player_id"]] = p["shirt"]

    def apply_event(self, e: dict):
        seq = e["seq"]
        if self.last_seq and seq <= self.last_seq:
            self.warnings.append(f"{e['clock']}: seq went back from {self.last_seq} to {seq} (duplicate or replay)")
        elif self.last_seq and seq > self.last_seq + 1:
            self.warnings.append(f"{e['clock']}: gap, seq {self.last_seq} → {seq} ({seq - self.last_seq - 1} missing)")
        elif not self.last_seq and seq != 1 and self.setup is None:
            self.warnings.append(f"joined mid-match at seq {seq} (no setup seen)")
        self.last_seq = max(self.last_seq, seq)
        self.events += 1
        self.clock = e["clock"]
        self.period = e["period"]
        t = e["type"]
        if t == "PeriodStart":
            self.phase = "live"
        elif t == "PeriodEnd":
            self.phase = "full_time" if e["period"] >= 2 else "half_time"
        elif self.phase in ("unknown", "pre_match"):
            self.phase = "live"
        if t == "Shot" and e.get("shot_outcome") == "goal":
            side = self.side_of_team.get(e["team_id"])
            if side:
                self.score[side] += 1
        self.feed.appendleft({"seq": seq, "clock": e["clock"], "type": t, "team_id": e.get("team_id"),
                              "text": self.describe(e)})

    def describe(self, e: dict) -> str:
        t, who = e["type"], self.name(e.get("player_id"))
        if t == "PeriodStart":
            return f"Kick-off, period {e['period']}"
        if t == "PeriodEnd":
            return "Full time" if e["period"] >= 2 else "Half time"
        if t == "Pass":
            if e.get("outcome") == "success":
                return f"{who} → {self.name(e.get('receiver_id'))}"
            return f"{who}, pass lost"
        if t == "Shot":
            return f"{who}, {e.get('shot_outcome')} ({e.get('situation', '').replace('_', ' ')})"
        if t == "Card":
            return f"{e.get('card', '').replace('_', ' ')} card: {who}"
        if t == "Substitution":
            return f"{self.name(e.get('player_on_id'))} on for {who}"
        if t == "Foul":
            return f"{who} fouls {self.name(e.get('fouled_player_id'))}"
        if t == "Pressure":
            return f"{who} presses {self.name(e.get('target_player_id'))}"
        outcome = e.get("outcome")
        return f"{who}" + (f" ({outcome})" if outcome else "")

    def apply_frame(self, f: dict):
        self.frames += 1
        self.frame = f
        self.frame_dirty = True
        if self.phase in ("unknown", "pre_match"):
            self.phase = "live"
        self.period = f["period"]

    def frame_message(self) -> dict:
        f = self.frame
        return {
            "type": "frame", "match_id": self.match_id, "period": f["period"], "match_ms": f["match_ms"],
            "ball": [f["ball"]["x"], f["ball"]["y"], f["ball"]["z"]],
            "players": [[p["player_id"], p["x"], p["y"], p["speed_kmh"]] for p in f["players"]],
        }

    def state(self) -> dict:
        teams = None
        if self.setup:
            teams = {side: {"team_id": t["team_id"], "name": t["name"], "colours": t["colours"],
                            "formation": t["formation"]}
                     for side, t in self.setup["teams"].items()}
        return {
            "match_id": self.match_id, "teams": teams, "score": self.score, "clock": self.clock,
            "period": self.period, "phase": self.phase, "last_seq": self.last_seq, "events": self.events,
            "frames": self.frames, "warnings": list(self.warnings), "feed": list(self.feed)[:14],
            "shirts": self.shirts, "names": self.names, "run": self.runs,
        }


class HubRate:
    def __init__(self):
        self.total = 0
        self.window = 0
        self.rate = 0.0
        self.last = time.monotonic()

    def add(self, n: int):
        self.total += n
        self.window += n

    def tick(self):
        now = time.monotonic()
        dt = max(now - self.last, 1e-3)
        self.rate = self.window / dt
        self.window = 0
        self.last = now


class Viewer:
    def __init__(self, target: str, namespace: str | None, consumer_group: str, start: str, host: str, port: int):
        self.target = target
        self.namespace = namespace
        self.consumer_group = consumer_group
        self.start = start
        self.host = host
        self.port = port
        self.started = datetime.now(timezone.utc)
        self.matches: dict[str, MatchView] = {}
        self.rates = {EVENTS_HUB: HubRate(), TRACKING_HUB: HubRate()}
        self.history = 0
        self.errors: deque[str] = deque(maxlen=5)
        self.clients: set[web.WebSocketResponse] = set()
        self.consumers = []

    def match(self, match_id: str) -> MatchView:
        if match_id not in self.matches:
            self.matches[match_id] = MatchView(match_id)
        return self.matches[match_id]

    # ------------------------------------------------------------------ reading the hubs

    async def _on_batch(self, hub: str, partition_context, events):
        live = 0
        for ev in events:
            try:
                body = json.loads(ev.body_as_str())
            except ValueError:
                self.errors.append(f"{hub} p{partition_context.partition_id}: body is not JSON")
                continue
            props = _props(ev)
            kind = props.get("kind", "tracking" if hub == TRACKING_HUB else "event")
            mid = props.get("match_id") or body.get("match_id")
            if not mid:
                continue
            is_live = ev.enqueued_time is None or ev.enqueued_time >= self.started
            live += is_live
            self.history += not is_live
            m = self.match(mid)
            if kind == "setup":
                m.apply_setup(body)
            elif kind == "event":
                m.apply_event(body)
            elif kind == "tracking":
                m.apply_frame(body)
        self.rates[hub].add(live)

    async def _on_error(self, partition_context, error):
        pid = getattr(partition_context, "partition_id", "?")
        self.errors.append(f"partition {pid}: {error}")
        print(f"[watch] {pid}: {error}", file=sys.stderr)

    async def _consume(self, hub: str, starting_position: str):
        client = make_client(self.target, hub, self.namespace, consumer=True, consumer_group=self.consumer_group)
        self.consumers.append(client)

        async def on_batch(ctx, events):
            await self._on_batch(hub, ctx, events)

        async with client:
            await client.receive_batch(on_event_batch=on_batch, on_error=self._on_error, max_batch_size=300,
                                       max_wait_time=0.5, starting_position=starting_position)

    # ------------------------------------------------------------------ pushing to the page

    def state_message(self) -> dict:
        return {
            "type": "state",
            "target": self.target, "consumer_group": self.consumer_group,
            "since": self.started.strftime("%H:%M:%S UTC"),
            "hubs": {hub: {"rate": round(r.rate, 1), "total": r.total} for hub, r in self.rates.items()},
            "history": self.history,
            "errors": list(self.errors),
            "matches": [m.state() for m in sorted(self.matches.values(), key=lambda m: m.match_id)],
        }

    async def _broadcast(self, msg: dict):
        if not self.clients:
            return
        data = json.dumps(msg, ensure_ascii=False, separators=(",", ":"))
        for ws in list(self.clients):
            try:
                await ws.send_str(data)
            except (ConnectionError, RuntimeError):
                self.clients.discard(ws)

    async def _pusher(self):
        last_state = 0.0
        while True:
            await asyncio.sleep(FRAME_PUSH_S)
            for m in list(self.matches.values()):
                if m.frame_dirty and m.frame is not None:
                    m.frame_dirty = False
                    await self._broadcast(m.frame_message())
            now = time.monotonic()
            if now - last_state >= STATE_PUSH_S:
                last_state = now
                for r in self.rates.values():
                    r.tick()
                await self._broadcast(self.state_message())

    # ------------------------------------------------------------------ web

    async def _index(self, request):
        return web.FileResponse(PAGE)

    async def _ws(self, request):
        ws = web.WebSocketResponse(heartbeat=25)
        await ws.prepare(request)
        self.clients.add(ws)
        await ws.send_str(json.dumps(self.state_message(), ensure_ascii=False))
        for m in self.matches.values():
            if m.frame is not None:
                await ws.send_str(json.dumps(m.frame_message()))
        try:
            async for msg in ws:
                if msg.type == WSMsgType.ERROR:
                    break
        finally:
            self.clients.discard(ws)
        return ws

    async def run(self):
        app = web.Application()
        app.router.add_get("/", self._index)
        app.router.add_get("/ws", self._ws)
        runner = web.AppRunner(app)
        await runner.setup()
        await web.TCPSite(runner, self.host, self.port).start()
        print(f"[watch] reading {EVENTS_HUB} + {TRACKING_HUB} on the {self.target} as consumer group "
              f"{self.consumer_group}; open http://{self.host}:{self.port}/", file=sys.stderr)
        tracking_start = "-1" if self.start == "start" else "@latest"
        tasks = [asyncio.create_task(self._consume(EVENTS_HUB, "-1")),
                 asyncio.create_task(self._consume(TRACKING_HUB, tracking_start)),
                 asyncio.create_task(self._pusher())]
        try:
            await asyncio.gather(*tasks)
        finally:
            for t in tasks:
                t.cancel()
            for c in self.consumers:
                await c.close()
            await runner.cleanup()
