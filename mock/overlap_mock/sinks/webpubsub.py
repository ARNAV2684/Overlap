"""Local stand-in for Azure Web PubSub (hub `live`) plus the two web-app APIs the browser needs.

It speaks Web PubSub's client WebSocket protocol, so browser code written against the real service works here
unchanged and later only needs a different URL:

- `json.webpubsub.azure.v1` and `json.reliable.webpubsub.azure.v1` subprotocols: `connected` system message,
  `joinGroup` / `leaveGroup` with acks, group messages as
  `{"type":"message","from":"group","group":...,"dataType":"json","data":<envelope>}`
  (the reliable protocol adds `sequenceId`; `sequenceAck` is accepted)
- no subprotocol: raw envelopes, and groups come from the `groups` query parameter (like groups granted at
  negotiate time)

HTTP:
- `GET /negotiate?groups=match-SYN-9001` → `{"baseUrl", "url", "token"}` (the shape the service SDK returns)
- `GET /api/match/{match_id}/snapshot` → setup, status and every envelope so far except old positions (PROVISIONAL)
- `GET /mock/matches` → which mock matches are playing, their phase and score

Groups follow CONTRACTS.md §7: `match-<id>` carries events, positions and status. The mock has no agents, so the
audience and player groups exist but stay silent.
"""

from __future__ import annotations

import json
import uuid

from aiohttp import WSMsgType, web

SUBPROTOCOLS = ("json.reliable.webpubsub.azure.v1", "json.webpubsub.azure.v1")


class Conn:
    def __init__(self, ws: web.WebSocketResponse, protocol: str | None):
        self.ws = ws
        self.protocol = protocol
        self.groups: set[str] = set()
        self.sequence_id = 0
        self.id = uuid.uuid4().hex

    @property
    def reliable(self) -> bool:
        return self.protocol == SUBPROTOCOLS[0]

    async def deliver(self, group: str, envelope: dict):
        if self.ws.closed:
            return
        if self.protocol is None:
            await self.ws.send_str(json.dumps(envelope, ensure_ascii=False))
            return
        msg = {"type": "message", "from": "group", "group": group, "dataType": "json", "data": envelope}
        if self.reliable:
            self.sequence_id += 1
            msg["sequenceId"] = self.sequence_id
        await self.ws.send_str(json.dumps(msg, ensure_ascii=False))


class WebPubSubStandIn:
    def __init__(self, host: str = "localhost", port: int = 8787):
        self.host = host
        self.port = port
        self.conns: set[Conn] = set()
        self.matches: dict[str, dict] = {}  # match_id -> {"setup", "status", "history", "positions"}
        self.runner: web.AppRunner | None = None
        self.delivered = 0

    # ---------------------------------------------------------------- server

    async def start(self):
        app = web.Application(middlewares=[self._cors])
        app.router.add_get("/", self._index)
        app.router.add_get("/negotiate", self._negotiate)
        app.router.add_get("/api/negotiate", self._negotiate)
        app.router.add_get("/client/hubs/{hub}", self._ws)
        app.router.add_get("/api/match/{match_id}/snapshot", self._snapshot)
        app.router.add_get("/mock/matches", self._matches)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        await web.TCPSite(self.runner, self.host, self.port).start()

    async def close(self):
        for c in list(self.conns):
            await c.ws.close()
        if self.runner:
            await self.runner.cleanup()

    @web.middleware
    async def _cors(self, request, handler):
        resp = await handler(request)
        if not isinstance(resp, web.WebSocketResponse):
            resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    async def _index(self, request):
        lines = [
            "Overlap mock: local Web PubSub stand-in (TEMPORARY)",
            f"negotiate:  http://{self.host}:{self.port}/negotiate?groups=match-SYN-9001",
            f"websocket:  ws://{self.host}:{self.port}/client/hubs/live  (subprotocol json.webpubsub.azure.v1)",
            f"snapshot:   http://{self.host}:{self.port}/api/match/SYN-9001/snapshot",
            f"matches:    http://{self.host}:{self.port}/mock/matches",
        ]
        return web.Response(text="\n".join(lines))

    async def _negotiate(self, request):
        hub = request.query.get("hub", "live")
        groups = request.query.get("groups", "")
        token = "mock-" + uuid.uuid4().hex[:12]
        base = f"ws://{self.host}:{self.port}/client/hubs/{hub}"
        url = f"{base}?access_token={token}" + (f"&groups={groups}" if groups else "")
        return web.json_response({"baseUrl": base, "url": url, "token": token})

    async def _matches(self, request):
        return web.json_response([
            {"match_id": mid, "group": f"match-{mid}", "phase": m["status"]["data"]["phase"] if m["status"] else None,
             "score": m["status"]["data"]["score"] if m["status"] else None,
             "clock": m["history"][-1]["clock"] if m["history"] else None}
            for mid, m in self.matches.items()
        ])

    async def _snapshot(self, request):
        mid = request.match_info["match_id"]
        m = self.matches.get(mid)
        if m is None:
            return web.json_response({"error": f"unknown match {mid}"}, status=404)
        return web.json_response({
            "match_id": mid,
            "setup": m["setup"],
            "status": m["status"],
            "envelopes": m["history"] + ([m["positions"]] if m["positions"] else []),
        })

    async def _ws(self, request):
        offered = [p.strip() for p in request.headers.get("Sec-WebSocket-Protocol", "").split(",") if p.strip()]
        protocol = next((p for p in SUBPROTOCOLS if p in offered), None)
        ws = web.WebSocketResponse(protocols=(protocol,) if protocol else (), heartbeat=25)
        await ws.prepare(request)
        conn = Conn(ws, protocol)
        for g in filter(None, request.query.get("groups", "").split(",")):
            conn.groups.add(g)
        self.conns.add(conn)
        if protocol:
            hello = {"type": "system", "event": "connected", "userId": None, "connectionId": conn.id}
            if conn.reliable:
                hello["reconnectionToken"] = uuid.uuid4().hex
            await ws.send_str(json.dumps(hello))
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT or protocol is None:
                    continue
                try:
                    req = json.loads(msg.data)
                except ValueError:
                    continue
                kind = req.get("type")
                ok = True
                if kind == "joinGroup":
                    conn.groups.add(req.get("group", ""))
                elif kind == "leaveGroup":
                    conn.groups.discard(req.get("group", ""))
                elif kind in ("sequenceAck", "ping"):
                    continue
                if "ackId" in req:
                    await ws.send_str(json.dumps({"type": "ack", "ackId": req["ackId"], "success": ok}))
        finally:
            self.conns.discard(conn)
        return ws

    # ---------------------------------------------------------------- feed

    def register(self, setup: dict):
        self.matches[setup["match_id"]] = {"setup": setup, "status": None, "history": [], "positions": None}

    async def publish(self, match_id: str, pairs: list[tuple[str, dict]]):
        m = self.matches[match_id]
        for group, env in pairs:
            if env["kind"] == "positions":
                m["positions"] = env
            else:
                m["history"].append(env)
                if env["kind"] == "status":
                    m["status"] = env
            for c in list(self.conns):
                if group in c.groups:
                    try:
                        await c.deliver(group, env)
                        self.delivered += 1
                    except ConnectionError:
                        self.conns.discard(c)
