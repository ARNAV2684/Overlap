"""Checks the stand-in with Microsoft's own Web PubSub SDK, the way the relay and the browser will use it.

Run with the stand-in started:  uv run --group check python check_standin.py
"""

from __future__ import annotations

import asyncio
import json
import sys

import aiohttp
from azure.messaging.webpubsubservice import WebPubSubServiceClient

BASE = "http://127.0.0.1:8787"
# Local only: the stand-in accepts any key. On Azure the relay signs in with managed identity instead.
CONNECTION = f"Endpoint={BASE};AccessKey=local-development-only-not-a-real-key;Version=1.0;"
GROUP = "match-SYN-CHECK"


async def main() -> int:
    service = WebPubSubServiceClient.from_connection_string(CONNECTION, hub="live")
    failures = []
    async with aiohttp.ClientSession() as http:
        async with http.get(f"{BASE}/negotiate?groups={GROUP}") as r:
            neg = await r.json()
        if set(neg) != {"baseUrl", "url", "token"}:
            failures.append(f"negotiate shape {sorted(neg)}")
        sdk_url = service.get_client_access_token()["url"]
        for label, url in (("negotiate url", neg["url"]), ("SDK token url", sdk_url)):
            async with http.ws_connect(url, protocols=("json.webpubsub.azure.v1",)) as ws:
                hello = json.loads((await ws.receive(timeout=5)).data)
                if hello.get("event") != "connected":
                    failures.append(f"{label}: no connected message")
                await ws.send_str(json.dumps({"type": "joinGroup", "group": GROUP, "ackId": 1}))
                ack = json.loads((await ws.receive(timeout=5)).data)
                if ack != {"type": "ack", "ackId": 1, "success": True}:
                    failures.append(f"{label}: bad ack {ack}")
                envelope = {"seq": 1, "kind": "status", "match_id": "SYN-CHECK", "match_ms": 0, "clock": "0:00",
                            "data": {"phase": "pre_match", "period": 0, "score": {"home": 0, "away": 0}}}
                await asyncio.to_thread(service.send_to_group, GROUP, envelope, content_type="application/json")
                msg = json.loads((await ws.receive(timeout=5)).data)
                expected = {"type": "message", "from": "group", "group": GROUP, "dataType": "json", "data": envelope}
                if msg != expected:
                    failures.append(f"{label}: got {msg}")
                print(f"{label}: connected, joined, received the SDK's send_to_group message")
        try:  # a plain socket without the Web PubSub subprotocol must be refused
            async with http.ws_connect(neg["url"]):
                failures.append("plain socket was accepted")
        except aiohttp.WSServerHandshakeError:
            print("plain socket without the subprotocol: refused, as intended")
    print("FAILED: " + "; ".join(failures) if failures else "OK: stand-in behaves like Web PubSub for these calls")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
