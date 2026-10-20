"""Local stand-in for Azure Web PubSub (hub `live`) plus the snapshot route. Development only.

Spec: infra/specs/local-development.md §3. Message shapes: CONTRACTS.md §7.

What it serves, matching the real service so the same code works locally and on Azure:

- Service API (what the relay calls through the Web PubSub SDK):
    POST /api/hubs/{hub}/groups/{group}/:send   send one message to everyone in the group
    POST /api/hubs/{hub}/:send                   send to everyone on the hub
    POST /api/hubs/{hub}/:generateToken          client token (when a caller asks the service for one)
- Browser connection: ws://localhost:8787/client/hubs/{hub}?access_token=...
    subprotocols json.webpubsub.azure.v1 and json.reliable.webpubsub.azure.v1: `connected`, joinGroup/leaveGroup with
    acks, group messages as {"type":"message","from":"group","group":...,"dataType":"json","data":...}
- GET /negotiate?groups=match-<id>   {baseUrl, url, token}, what the web app's negotiate route returns on Azure
- GET /api/match/{match_id}/snapshot  CONTRACTS.md §7.3, read from the Cosmos container the relay writes
- GET /api/match/{match_id}/insights/snapshot?mode=&lang=(&club=|&player=)  CONTRACTS.md §10.4/§10.6, read from
    the `overlays` container the insights publisher writes and the `match_state` playhead

Tokens are accepted without checking (local only). Binds to 127.0.0.1. No plain-socket mode.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import sys
import uuid

from aiohttp import WSMsgType, web

from .insights import InsightsReader, group_for
from .snapshot import SnapshotReader

log = logging.getLogger("standin")
SUBPROTOCOLS = ("json.reliable.webpubsub.azure.v1", "json.webpubsub.azure.v1")
LOCAL_ORIGINS = ("http://localhost:", "http://127.0.0.1:")


class Connection:
    def __init__(self, ws: web.WebSocketResponse, hub: str, protocol: str):
        self.ws = ws
        self.hub = hub
        self.protocol = protocol
        self.groups: set[str] = set()
        self.sequence_id = 0
        self.id = uuid.uuid4().hex

    @property
    def reliable(self) -> bool:
        return self.protocol == SUBPROTOCOLS[0]

    async def send_json(self, obj: dict):
        if not self.ws.closed:
            await self.ws.send_str(json.dumps(obj, ensure_ascii=False, separators=(",", ":")))

    async def deliver(self, group: str | None, data, data_type: str):
        msg = {"type": "message", "from": "group" if group else "server", "dataType": data_type, "data": data}
        if group:
            msg["group"] = group
        if self.reliable:
            self.sequence_id += 1
            msg["sequenceId"] = self.sequence_id
        await self.send_json(msg)


class StandIn:
    def __init__(self, host: str, port: int, snapshots: SnapshotReader | None,
                 insights: InsightsReader | None = None):
        self.host = host
        self.port = port
        self.snapshots = snapshots
        self.insights = insights
        self.connections: set[Connection] = set()
        self.counts = {"sent_to_group": 0, "delivered": 0}

    # ------------------------------------------------------------------ app

    def app(self) -> web.Application:
        app = web.Application(middlewares=[self._cors])
        r = app.router
        r.add_get("/", self._index)
        r.add_get("/health", self._health)
        r.add_get("/negotiate", self._negotiate)
        r.add_post("/api/hubs/{hub}/groups/{group}/:send", self._send_to_group)
        r.add_post("/api/hubs/{hub}/:send", self._send_to_all)
        r.add_post("/api/hubs/{hub}/:generateToken", self._generate_token)
        r.add_get("/client/hubs/{hub}", self._client)
        r.add_get("/api/match/{match_id}/snapshot", self._snapshot)
        r.add_get("/api/match/{match_id}/insights/snapshot", self._insights)
        r.add_route("OPTIONS", "/{tail:.*}", self._preflight)
        return app

    @web.middleware
    async def _cors(self, request, handler):
        resp = await handler(request)
        origin = request.headers.get("Origin", "")
        if origin.startswith(LOCAL_ORIGINS) and not isinstance(resp, web.WebSocketResponse):
            resp.headers["Access-Control-Allow-Origin"] = origin
            resp.headers["Vary"] = "Origin"
        return resp

    async def _preflight(self, request):
        origin = request.headers.get("Origin", "")
        headers = {}
        if origin.startswith(LOCAL_ORIGINS):
            headers = {"Access-Control-Allow-Origin": origin, "Access-Control-Allow-Methods": "GET, POST",
                       "Access-Control-Allow-Headers": request.headers.get("Access-Control-Request-Headers", "*"),
                       "Vary": "Origin"}
        return web.Response(status=204, headers=headers)

    async def _index(self, request):
        base = f"http://{self.host}:{self.port}"
        return web.Response(text="\n".join([
            "Overlap Web PubSub stand-in (local development only)",
            f"negotiate: {base}/negotiate?groups=match-SYN-0001",
            f"browser:   ws://{self.host}:{self.port}/client/hubs/live  (json.webpubsub.azure.v1)",
            f"send:      POST {base}/api/hubs/live/groups/<group>/:send",
            f"snapshot:  {base}/api/match/<match_id>/snapshot",
            f"insights:  {base}/api/match/<match_id>/insights/snapshot?mode=casual&lang=en",
        ]))

    async def _health(self, request):
        return web.json_response({"status": "ok", "connections": len(self.connections),
                                  "snapshot_store": self.snapshots is not None, **self.counts})

    # ------------------------------------------------------------------ service API

    async def _read_message(self, request) -> tuple[object, str]:
        ctype = (request.content_type or "").lower()
        if ctype == "application/json":
            return await request.json(), "json"
        if ctype.startswith("text/"):
            return await request.text(), "text"
        return (await request.read()).decode("utf-8", "replace"), "binary"

    async def _send_to_group(self, request):
        hub, group = request.match_info["hub"], request.match_info["group"]
        try:
            data, data_type = await self._read_message(request)
        except ValueError:
            return web.json_response({"error": "invalid_json"}, status=400)
        self.counts["sent_to_group"] += 1
        await self._fan_out(hub, group, data, data_type)
        return web.Response(status=202)

    async def _send_to_all(self, request):
        hub = request.match_info["hub"]
        try:
            data, data_type = await self._read_message(request)
        except ValueError:
            return web.json_response({"error": "invalid_json"}, status=400)
        await self._fan_out(hub, None, data, data_type)
        return web.Response(status=202)

    async def _fan_out(self, hub: str, group: str | None, data, data_type: str):
        for c in list(self.connections):
            if c.hub != hub or (group is not None and group not in c.groups):
                continue
            try:
                await c.deliver(group, data, data_type)
                self.counts["delivered"] += 1
            except ConnectionError:
                self.connections.discard(c)

    async def _generate_token(self, request):
        return web.json_response({"token": "local-" + uuid.uuid4().hex})

    async def _negotiate(self, request):
        hub = request.query.get("hub", "live")
        token = "local-" + uuid.uuid4().hex
        base = f"ws://{self.host}:{self.port}/client/hubs/{hub}"
        return web.json_response({"baseUrl": base, "url": f"{base}?access_token={token}", "token": token})

    # ------------------------------------------------------------------ browser connections

    async def _client(self, request):
        offered = [p.strip() for p in request.headers.get("Sec-WebSocket-Protocol", "").split(",") if p.strip()]
        protocol = next((p for p in SUBPROTOCOLS if p in offered), None)
        if protocol is None:
            return web.json_response({"error": "subprotocol_required",
                                      "expected": list(SUBPROTOCOLS)}, status=400)
        ws = web.WebSocketResponse(protocols=(protocol,), heartbeat=25)
        await ws.prepare(request)
        conn = Connection(ws, request.match_info["hub"], protocol)
        self.connections.add(conn)
        hello = {"type": "system", "event": "connected", "userId": None, "connectionId": conn.id}
        if conn.reliable:
            hello["reconnectionToken"] = uuid.uuid4().hex
        await conn.send_json(hello)
        try:
            async for msg in ws:
                if msg.type != WSMsgType.TEXT:
                    continue
                try:
                    req = json.loads(msg.data)
                except ValueError:
                    continue
                kind = req.get("type")
                if kind == "joinGroup":
                    conn.groups.add(req.get("group", ""))
                elif kind == "leaveGroup":
                    conn.groups.discard(req.get("group", ""))
                elif kind in ("sequenceAck", "ping"):
                    continue
                if "ackId" in req:
                    await conn.send_json({"type": "ack", "ackId": req["ackId"], "success": True})
        finally:
            self.connections.discard(conn)
        return ws

    # ------------------------------------------------------------------ snapshot

    async def _snapshot(self, request):
        if self.snapshots is None:
            return web.json_response({"error": "snapshot_store_not_configured"}, status=503)
        match_id = request.match_info["match_id"]
        status, body = await asyncio.to_thread(self.snapshots.read, match_id)
        return web.json_response(body, status=status, headers={"Cache-Control": "no-store"})


    async def _insights(self, request):
        if self.insights is None:
            return web.json_response({"error": "snapshot_store_not_configured"}, status=503)
        match_id = request.match_info["match_id"]
        group, error = group_for(match_id, dict(request.query))
        if error:
            return web.json_response({"error": error}, status=400)
        status, body = await asyncio.to_thread(self.insights.read, match_id, group)
        return web.json_response(body, status=status, headers={"Cache-Control": "no-store"})


def main(argv=None):
    ap = argparse.ArgumentParser(prog="standin", description="Local Web PubSub stand-in (development only)")
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8787)
    ap.add_argument("--no-snapshot", action="store_true", help="run without the Cosmos snapshot store")
    args = ap.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")
    snapshots = insights = None
    if not args.no_snapshot:
        endpoint, key = os.environ.get("OVERLAP_COSMOS_ENDPOINT"), os.environ.get("OVERLAP_COSMOS_KEY")
        if not (endpoint and key):
            sys.exit("Set OVERLAP_COSMOS_ENDPOINT and OVERLAP_COSMOS_KEY (see infra/local/env.example), "
                     "or run with --no-snapshot.")
        snapshots = SnapshotReader(endpoint, key, os.environ.get("OVERLAP_COSMOS_DATABASE", "live"),
                                   os.environ.get("OVERLAP_COSMOS_CONTAINER", "screen"))
        insights = InsightsReader(endpoint, key, os.environ.get("OVERLAP_COSMOS_DATABASE", "live"))
    standin = StandIn(args.host, args.port, snapshots, insights)
    log.info("Web PubSub stand-in on http://%s:%d/", args.host, args.port)
    web.run_app(standin.app(), host=args.host, port=args.port, print=None)


if __name__ == "__main__":
    main()
