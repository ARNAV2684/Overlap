# publisher.py — Insights publisher
#
# Purpose: the single sender on every audience group: take each outbox, check the card is still live against the
#          playhead, persist one numbered delivery per group in Cosmos `overlays`, then send it through Web PubSub;
#          the same for full-time recaps and for player tags when a player first crosses a speed or distance threshold
# Inputs:  outboxes and jobs (Cosmos `moments`), match_state (playhead), the overlays store, a Web PubSub sender
# Outputs: overlay, delivery and counter documents in `overlays`; envelopes on match-<id>-<mode>-<lang>,
#          match-<id>-club-<teamId>-<lang>, match-<id>-player-<playerId>-<lang>; the job's final state
# Spec:    CONTRACTS.md §7, §10.3, §10.4, §10.6; agents/specs/workflow.md §2, §4
#
# Save before send: a group's `seq` is reserved in one transaction with its delivery document, so a crash never reuses
# or skips a number, and a resend after a crash repeats the same envelope (browsers dedupe on seq per group). Expiry
# wins: a card is sent only while the playhead is in its period and at most 300,000 match ms past `show_at_ms`.

from __future__ import annotations

import logging
from typing import Any, Protocol

from director import player_tag_crossings
from state import PreconditionFailed, Store

log = logging.getLogger("publisher")
LIVE_WINDOW_MS = 300_000
RESERVE_RETRIES = 5


class Sender(Protocol):
    async def send(self, group: str, envelope: dict) -> None: ...


def eligibility(kind: str, period: int, show_at_ms: int, state: dict | None) -> str:
    """`early` (wait), `live` (send now), `late` (expire) or `unknown` (no playhead yet: wait, never send)."""
    if state is None or not isinstance((state.get("source") or {}).get("match_ms"), int):
        return "unknown"
    phase = state.get("phase")
    if kind == "recap":
        return "live" if phase == "full_time" else "early"
    if kind == "player_tag":
        return "live"
    if phase == "full_time":
        return "late"
    if state.get("period") != period:
        return "late" if (state.get("period") or 0) > period else "early"              # a new half: expired
    playhead = state["source"]["match_ms"]
    if playhead < show_at_ms:
        return "early"
    return "late" if playhead > show_at_ms + LIVE_WINDOW_MS else "live"


def envelope(kind: str, match_id: str, match_ms: int, clock: str, data: dict, seq: int) -> dict:
    """The §7 envelope; `seq` belongs to the group."""
    return {"seq": seq, "kind": kind, "match_id": match_id, "match_ms": match_ms, "clock": clock, "data": data}


class Publisher:
    def __init__(self, moments: Store, overlays: Store, sender: Sender, settings: Any):
        self.moments, self.overlays, self.sender, self.settings = moments, overlays, sender, settings

    # --- one numbered delivery per group ------------------------------------------------------------------------

    async def reserve(self, match_id: str, group: str, key: str, kind: str, match_ms: int, clock: str,
                      data: dict, extra: dict) -> dict:
        """The delivery for (group, key), creating it with the group's next seq in one transaction if it's new."""
        delivery_id = f"delivery:{group}:{key}"
        for _ in range(RESERVE_RETRIES):
            found = await self.overlays.read(match_id, delivery_id)
            if found is not None:
                return found[0]
            counter = await self.overlays.read(match_id, f"counter:{group}")
            last = counter[0]["last_seq"] if counter else 0
            doc = {"id": delivery_id, "match_id": match_id, "kind": "audience_delivery", "group": group,
                   "key": key, "seq": last + 1, "state": "pending",
                   "envelope": envelope(kind, match_id, match_ms, clock, data, last + 1), **extra}
            bump = {"id": f"counter:{group}", "match_id": match_id, "kind": "audience_counter", "group": group,
                    "last_seq": last + 1}
            ops = [("replace", {**counter[0], **bump}, counter[1]) if counter else ("create", bump), ("create", doc)]
            try:
                await self.overlays.batch(match_id, ops)
                return doc
            except PreconditionFailed:
                continue                                     # someone moved the counter or wrote this delivery
        raise PreconditionFailed(delivery_id)

    async def _set_state(self, match_id: str, delivery_id: str, state: str) -> None:
        found = await self.overlays.read(match_id, delivery_id)
        if found is not None and found[0]["state"] != state:
            await self.overlays.replace({**found[0], "state": state}, found[1])

    async def _deliver(self, delivery: dict, live: str) -> str:
        """Send a pending delivery when its card is live; expire it when late; keep it pending otherwise."""
        if delivery["state"] in ("sent", "expired"):
            return delivery["state"]
        if live == "late":
            await self._set_state(delivery["match_id"], delivery["id"], "expired")
            return "expired"
        if live != "live":
            return "pending"
        try:
            await self.sender.send(delivery["group"], delivery["envelope"])
        except Exception as e:  # noqa: BLE001 — any send failure: the delivery stays pending and is retried
            log.warning("send to %s failed (%s); will retry", delivery["group"], type(e).__name__)
            return "pending"
        await self._set_state(delivery["match_id"], delivery["id"], "sent")
        return "sent"

    # --- moments and recaps -------------------------------------------------------------------------------------

    async def publish_outbox(self, outbox: dict, state: dict | None) -> dict:
        intent, match_id = outbox["intent"], outbox["match_id"]
        kind = "recap" if intent.get("kind") == "recap" else "overlay"
        await self.overlays.create({"id": intent["overlay_id"], "match_id": match_id, "kind": kind,
                                    "moment_id": outbox["moment_id"], "intent": intent})
        live = eligibility(kind, intent["period"], intent["show_at_ms"], state)
        outcomes: dict[str, int] = {}                       # every audience's state, for the job's outcome
        done_now: dict[str, int] = {}                       # what this pass did, for the caller
        for a in intent["audiences"]:
            delivery_id = f"delivery:{a['group']}:{intent['overlay_id']}"
            existing = await self.overlays.read(match_id, delivery_id)
            if existing is not None and existing[0]["state"] in ("sent", "expired"):
                outcomes[existing[0]["state"]] = outcomes.get(existing[0]["state"], 0) + 1
                continue
            if existing is None and live == "late":
                await self.overlays.create({"id": delivery_id, "match_id": match_id, "kind": "audience_delivery",
                                            "group": a["group"], "key": intent["overlay_id"], "seq": None,
                                            "state": "expired"})                      # never numbered, never sent
                for d in (outcomes, done_now):
                    d["expired"] = d.get("expired", 0) + 1
                continue
            if existing is None and live != "live":
                for d in (outcomes, done_now):
                    d["pending"] = d.get("pending", 0) + 1
                continue
            delivery = existing[0] if existing else await self.reserve(
                match_id, a["group"], intent["overlay_id"], kind, intent["show_at_ms"], intent["clock"],
                a["recap"] if kind == "recap" else a["overlay"],
                {"overlay_id": intent["overlay_id"], "period": intent["period"], "show_at_ms": intent["show_at_ms"],
                 "envelope_kind": kind})
            result = await self._deliver(delivery, live)
            for d in (outcomes, done_now):
                d[result] = d.get(result, 0) + 1
        await self._finish(outbox, outcomes)
        return {"overlay_id": intent["overlay_id"], **done_now}

    async def _finish(self, outbox: dict, outcomes: dict[str, int]) -> None:
        """Once no audience is pending, record the job's outcome: published, partially_expired or expired."""
        if outcomes.get("pending"):
            return
        sent, expired = outcomes.get("sent", 0), outcomes.get("expired", 0)
        final = "published" if sent and not expired else "expired" if expired and not sent else "partially_expired"
        found = await self.moments.read(outbox["match_id"], outbox["id"])
        if found is not None and found[0].get("state") != "done":
            await self.moments.replace({**found[0], "state": "done", "outcome": final}, found[1])
        job = await self.moments.read(outbox["match_id"], f"job:{outbox['moment_id']}")
        if job is not None and job[0].get("state") == "delivery_pending":
            await self.moments.replace({**job[0], "state": final, "lease_owner": None, "lease_until": 0.0}, job[1])

    # --- player tags --------------------------------------------------------------------------------------------

    async def player_tags(self, match_id: str, state: dict | None) -> int:
        """Tags for players whose speed or distance first crossed a threshold; values from match_state only."""
        if state is None:
            return 0
        done = {(d["player_id"], d["metric"]) for d in await self.overlays.of_kind(match_id, "player_tag")}
        sent = 0
        for tag in player_tag_crossings(state, done, self.settings):
            key = f"tag-{tag['player_id']}-{tag['metric']}"
            await self.overlays.create({"id": f"tag:{tag['player_id']}:{tag['metric']}", "match_id": match_id,
                                        "kind": "player_tag", **tag})
            for lang in self.settings.languages:
                group = f"match-{match_id}-player-{tag['player_id']}-{lang}"
                delivery = await self.reserve(match_id, group, key, "player_tag", state["source"]["match_ms"],
                                              state.get("clock", ""), tag, {"envelope_kind": "player_tag"})
                sent += await self._deliver(delivery, "live") == "sent"
        return sent

    # --- one pass -----------------------------------------------------------------------------------------------

    async def run_once(self, match_id: str) -> dict[str, int]:
        """Every outbox of the match that isn't done, then player tags. Safe to repeat at any time."""
        state = await self.moments.match_state(match_id)
        totals: dict[str, int] = {}
        outboxes = sorted(await self.moments.of_kind(match_id, "insight_outbox"), key=lambda d: d["id"])
        for outbox in outboxes:
            if outbox.get("state") == "done":
                continue
            for k, v in (await self.publish_outbox(outbox, state)).items():
                if k != "overlay_id":
                    totals[k] = totals.get(k, 0) + v
        tags = await self.player_tags(match_id, state)
        if tags:
            totals["player_tags"] = tags
        return totals


class WebPubSubSender:
    """Azure Web PubSub (hub `live`): managed identity on Azure; the local stand-in accepts a placeholder key, the
    same way the relay connects (functions/relay_store.py)."""

    def __init__(self, endpoint: str, hub: str = "live"):
        from azure.messaging.webpubsubservice.aio import WebPubSubServiceClient
        if endpoint.startswith(("http://localhost", "http://127.0.0.1")):
            self.client = WebPubSubServiceClient.from_connection_string(
                f"Endpoint={endpoint};AccessKey=local-development-only-not-a-real-key;Version=1.0;", hub=hub)
            self.credential = None
        else:
            from azure.identity.aio import DefaultAzureCredential
            self.credential = DefaultAzureCredential()
            self.client = WebPubSubServiceClient(endpoint=endpoint, hub=hub, credential=self.credential)

    async def send(self, group: str, envelope: dict) -> None:
        await self.client.send_to_group(group, envelope, content_type="application/json")

    async def close(self) -> None:
        await self.client.close()
        if self.credential is not None:
            await self.credential.close()
