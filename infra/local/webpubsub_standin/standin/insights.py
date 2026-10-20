"""The insights snapshot (CONTRACTS.md §10.4, §10.6): catch-up for one audience group.

GET /api/match/<id>/insights/snapshot?mode=<casual|analyst|club|player>&lang=<en|es|hi|fr>
    (&club=<teamId> for club, &player=<playerId> for player)

Reads what the insights publisher (agents/publisher.py) persisted in Cosmos `overlays` and the playhead from
`match_state` (§4.2). Returns at most the two newest still-live persisted cards (pending or sent) in seq order, and the
group's highest persisted seq as `cursor`. Recaps count from full time; player tags don't expire.
404 unknown match, 503 before a trustworthy playhead, 400 for an unsupported mode, language or id.
"""

from __future__ import annotations

import re

from azure.cosmos import CosmosClient, exceptions

MODES = ("casual", "analyst", "club", "player")
LANGS = ("en", "es", "hi", "fr")
MATCH_ID = re.compile(r"^SYN-[0-9]{4}$")
TEAM_ID = re.compile(r"^[A-Z]{3}$")
PLAYER_ID = re.compile(r"^[A-Z]{3}-[0-9]{2}$")
LIVE_WINDOW_MS = 300_000
MAX_CARDS = 2


def group_for(match_id: str, query: dict) -> tuple[str | None, str | None]:
    """(group, None) for a valid request, (None, error) otherwise."""
    mode, lang = query.get("mode"), query.get("lang")
    if not MATCH_ID.match(match_id):
        return None, "bad_match_id"
    if mode not in MODES:
        return None, "unsupported_mode"
    if lang not in LANGS:
        return None, "unsupported_lang"
    if mode in ("casual", "analyst"):
        return f"match-{match_id}-{mode}-{lang}", None
    target = query.get(mode)
    if not target or not (TEAM_ID if mode == "club" else PLAYER_ID).match(target):
        return None, f"missing_or_bad_{mode}"
    return f"match-{match_id}-{mode}-{target}-{lang}", None


def live(delivery: dict, state: dict) -> bool:
    """Same rule as the publisher: a card in the playhead's period, at most 300,000 match ms old."""
    kind = delivery.get("envelope_kind")
    if kind == "player_tag":
        return True
    if kind == "recap":
        return state.get("phase") == "full_time"
    if state.get("phase") == "full_time" or state.get("period") != delivery.get("period"):
        return False
    playhead = state["source"]["match_ms"]
    return delivery["show_at_ms"] <= playhead <= delivery["show_at_ms"] + LIVE_WINDOW_MS


def build_insights(match_id: str, group: str, state: dict | None, docs: list[dict]) -> tuple[int, dict]:
    """Pure function: the group's documents and the match state -> (HTTP status, body)."""
    if state is None and not docs:
        return 404, {"error": "unknown_match"}
    if state is None or not isinstance((state.get("source") or {}).get("match_ms"), int):
        return 503, {"error": "playhead_unknown"}
    deliveries, rejected, samples = [], 0, []
    cursor = 0
    for d in docs:
        if d.get("group") != group:
            continue
        if d.get("kind") == "audience_counter":
            cursor = max(cursor, d.get("last_seq", 0))
            continue
        if d.get("kind") != "audience_delivery" or d.get("state") not in ("pending", "sent"):
            continue
        env = d.get("envelope")
        if not isinstance(env, dict) or env.get("match_id") != match_id or env.get("seq") != d.get("seq"):
            rejected += 1
            if len(samples) < 5:
                samples.append(str(d.get("id")))
            continue
        cursor = max(cursor, d["seq"])
        if live(d, state):
            deliveries.append(d)
    deliveries.sort(key=lambda d: d["seq"])
    return 200, {"match_id": match_id, "group": group, "cursor": cursor,
                 "envelopes": [d["envelope"] for d in deliveries[-MAX_CARDS:]],
                 "rejected": {"count": rejected, "samples": samples}}


class InsightsReader:
    def __init__(self, endpoint: str, key: str, database: str):
        db = CosmosClient(endpoint, credential=key).get_database_client(database)
        self.overlays = db.get_container_client("overlays")
        self.states = db.get_container_client("match_state")

    def read(self, match_id: str, group: str) -> tuple[int, dict]:
        try:
            try:
                state = self.states.read_item("state", partition_key=match_id)
            except exceptions.CosmosResourceNotFoundError:
                state = None
            try:
                docs = list(self.overlays.query_items(
                    query='SELECT * FROM c WHERE c["group"] = @g',               # group is a keyword
                    parameters=[{"name": "@g", "value": group}], partition_key=match_id))
            except exceptions.CosmosResourceNotFoundError:
                docs = []                                    # no overlays container yet
        except exceptions.CosmosHttpResponseError as ex:
            return 503, {"error": "store_unavailable", "detail": str(ex.status_code)}
        return build_insights(match_id, group, state, docs)
