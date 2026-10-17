"""Builds the CONTRACTS.md §7.3 snapshot from the relay's Cosmos container (local emulator here, Azure later).

Store layout (functions/specs/screen-relay.md §4), partition key `match_id`:
  env-<seq, 8 digits>   {"type": "envelope", "envelope": {...}}   one event / status / stats envelope
  positions-latest      {"type": "positions", "envelope": {...}}  newest positions envelope
  state                 {"type": "state", "setup": {...}, ...}    relay state for the match
"""

from __future__ import annotations

from azure.cosmos import CosmosClient, exceptions

ENVELOPE_FIELDS = {"seq", "kind", "match_id", "match_ms", "clock", "data"}
KINDS = {"event", "positions", "stats", "overlay", "player_tag", "recap", "status"}


def envelope_problem(env: object, match_id: str) -> str | None:
    if not isinstance(env, dict):
        return "not an object"
    if set(env) != ENVELOPE_FIELDS:
        return f"fields {sorted(set(env) ^ ENVELOPE_FIELDS)}"
    if env["kind"] not in KINDS:
        return f"unknown kind {env['kind']!r}"
    if env["match_id"] != match_id:
        return "different match_id"
    if not isinstance(env["seq"], int) or env["seq"] < 1:
        return "bad seq"
    return None


def build_snapshot(match_id: str, docs: list[dict]) -> tuple[int, dict]:
    """Pure function: documents of one match -> (HTTP status, body)."""
    if not docs:
        return 404, {"error": "unknown_match"}
    state = next((d for d in docs if d.get("id") == "state"), None)
    setup = (state or {}).get("setup")
    if not setup:
        return 503, {"error": "setup_pending"}
    envelopes, samples, rejected = [], [], 0
    for d in docs:
        if d.get("type") not in ("envelope", "positions"):
            continue
        env = d.get("envelope")
        problem = envelope_problem(env, match_id)
        if problem:
            rejected += 1
            if len(samples) < 5:
                samples.append(f"{d.get('id')}: {problem}")
            continue
        envelopes.append(env)
    envelopes.sort(key=lambda e: e["seq"])
    statuses = [e for e in envelopes if e["kind"] == "status"]
    if not statuses:
        return 503, {"error": "setup_pending"}
    return 200, {"match_id": match_id, "setup": setup, "status": statuses[-1], "envelopes": envelopes,
                 "rejected": {"count": rejected, "samples": samples}}


class SnapshotReader:
    def __init__(self, endpoint: str, key: str, database: str, container: str):
        self.client = CosmosClient(endpoint, credential=key)
        self.container = self.client.get_database_client(database).get_container_client(container)

    def read(self, match_id: str) -> tuple[int, dict]:
        try:
            docs = list(self.container.query_items(
                query="SELECT * FROM c WHERE c.match_id = @m",
                parameters=[{"name": "@m", "value": match_id}],
                partition_key=match_id,
            ))
        except exceptions.CosmosResourceNotFoundError:
            return 404, {"error": "unknown_match"}
        except exceptions.CosmosHttpResponseError as ex:
            return 503, {"error": "store_unavailable", "detail": str(ex.status_code)}
        return build_snapshot(match_id, docs)
