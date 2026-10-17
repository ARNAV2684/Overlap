"""Checks the local Cosmos DB emulator can do what the screen relay's store needs (functions/specs/screen-relay.md §4).

Run with the emulator up and OVERLAP_COSMOS_ENDPOINT / OVERLAP_COSMOS_KEY set (see env.example):
    uv run --project webpubsub_standin python check_cosmos.py

Creates database `live` and container `screen` (partition key /match_id) if missing, then checks upsert, read,
query by partition key, conditional replace with an ETag (what the relay uses to serialise state updates), and delete.
"""

from __future__ import annotations

import os
import sys

from azure.core import MatchConditions
from azure.cosmos import CosmosClient, PartitionKey, exceptions

MATCH = "SYN-CHECK"


def main() -> int:
    endpoint, key = os.environ.get("OVERLAP_COSMOS_ENDPOINT"), os.environ.get("OVERLAP_COSMOS_KEY")
    if not (endpoint and key):
        sys.exit("Set OVERLAP_COSMOS_ENDPOINT and OVERLAP_COSMOS_KEY (see env.example).")
    client = CosmosClient(endpoint, credential=key)
    db = client.create_database_if_not_exists(os.environ.get("OVERLAP_COSMOS_DATABASE", "live"))
    container = db.create_container_if_not_exists(os.environ.get("OVERLAP_COSMOS_CONTAINER", "screen"),
                                                  partition_key=PartitionKey(path="/match_id"))
    results = []

    def check(name: str, ok: bool):
        results.append(ok)
        print(f"{'ok  ' if ok else 'FAIL'} {name}")

    state = container.upsert_item({"id": "state", "match_id": MATCH, "type": "state", "seq": 0})
    for seq in (2, 1, 3):
        container.upsert_item({"id": f"env-{seq:08d}", "match_id": MATCH, "type": "envelope",
                               "envelope": {"seq": seq}})
    check("upsert + read", container.read_item("env-00000002", partition_key=MATCH)["envelope"]["seq"] == 2)

    rows = list(container.query_items("SELECT * FROM c WHERE c.match_id = @m AND c.type = 'envelope'",
                                      parameters=[{"name": "@m", "value": MATCH}], partition_key=MATCH))
    check("query by partition key", sorted(r["envelope"]["seq"] for r in rows) == [1, 2, 3])

    ordered = list(container.query_items("SELECT c.envelope.seq AS seq FROM c WHERE c.type = 'envelope' "
                                         "ORDER BY c.id", partition_key=MATCH))
    check("ORDER BY within a partition", [r["seq"] for r in ordered] == [1, 2, 3])

    etag = state["_etag"]
    container.replace_item("state", {**state, "seq": 1}, etag=etag, match_condition=MatchConditions.IfNotModified)
    try:
        container.replace_item("state", {**state, "seq": 2}, etag=etag, match_condition=MatchConditions.IfNotModified)
        check("stale ETag is rejected", False)
    except exceptions.CosmosAccessConditionFailedError:
        check("stale ETag is rejected", True)
    check("conditional replace kept the first write",
          container.read_item("state", partition_key=MATCH)["seq"] == 1)

    for item in container.query_items("SELECT c.id FROM c", partition_key=MATCH):
        container.delete_item(item["id"], partition_key=MATCH)
    check("delete", not list(container.query_items("SELECT c.id FROM c", partition_key=MATCH)))

    print("OK: the emulator supports the relay store" if all(results) else "FAILED")
    return 0 if all(results) else 1


if __name__ == "__main__":
    sys.exit(main())
