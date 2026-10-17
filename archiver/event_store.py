"""Cosmos side of the archive: containers `matches`, `events`, `stats` (CONTRACTS.md §4.1, storage spec §1).

Settings: OVERLAP_COSMOS_ENDPOINT, OVERLAP_COSMOS_KEY (local emulator only; unset on Azure → managed identity),
OVERLAP_COSMOS_DATABASE (default live). Database `live` uses shared throughput (free tier) on Azure.
"""

from __future__ import annotations

import logging
import os

from azure.cosmos import CosmosClient, PartitionKey, exceptions

log = logging.getLogger("archiver.events")
SYSTEM_FIELDS = ("_rid", "_self", "_etag", "_attachments", "_ts")
BATCH = 100  # Cosmos transactional batch limit


def _clean(doc: dict, drop_id: bool = True) -> dict:
    return {k: v for k, v in doc.items() if k not in SYSTEM_FIELDS and not (drop_id and k == "id")}


class CosmosArchive:
    def __init__(self, endpoint: str, key: str | None, database: str = "live"):
        if key:
            client = CosmosClient(endpoint, credential=key)
            db = client.create_database_if_not_exists(database)  # local emulator; Bicep creates these on Azure
            make = lambda name: db.create_container_if_not_exists(name, partition_key=PartitionKey("/match_id"))
        else:
            from azure.identity import DefaultAzureCredential
            db = CosmosClient(endpoint, credential=DefaultAzureCredential()).get_database_client(database)
            make = db.get_container_client
        self.matches = make("matches")
        self.events_c = make("events")
        self.stats_c = make("stats")

    @classmethod
    def from_env(cls) -> CosmosArchive:
        return cls(os.environ["OVERLAP_COSMOS_ENDPOINT"], os.environ.get("OVERLAP_COSMOS_KEY") or None,
                   os.environ.get("OVERLAP_COSMOS_DATABASE", "live"))

    # ------------------------------------------------------------------ writing

    def _match_doc(self, match_id: str) -> dict | None:
        try:
            return self.matches.read_item(match_id, partition_key=match_id)
        except exceptions.CosmosResourceNotFoundError:
            return None

    def save_setup(self, match_id: str, setup: dict) -> None:
        doc = self._match_doc(match_id)
        if doc is None:
            self.matches.upsert_item({"id": match_id, "match_id": match_id, "status": "live", "setup": setup})
        elif doc.get("setup") != setup:
            if doc.get("setup"):
                log.error("different setup for %s ignored; the first one is kept", match_id)
                return
            doc["setup"] = setup
            self.matches.replace_item(match_id, _clean(doc, drop_id=False), etag=doc["_etag"],
                                      match_condition=_if_not_modified())

    def _upsert_all(self, container, match_id: str, docs: list[dict]) -> None:
        for i in range(0, len(docs), BATCH):
            ops = [("upsert", (d,)) for d in docs[i:i + BATCH]]
            container.execute_item_batch(batch_operations=ops, partition_key=match_id)

    def save_events(self, match_id: str, events: list[dict]) -> None:
        self._upsert_all(self.events_c, match_id, [{**e, "id": e["event_id"]} for e in events])

    def save_stats(self, match_id: str, panels: list[dict]) -> None:
        self._upsert_all(self.stats_c, match_id, [{**p, "id": f"stats-{p['match_ms']:09d}"} for p in panels])

    def finish(self, match_id: str) -> None:
        doc = self._match_doc(match_id)
        if doc is None or not doc.get("setup"):
            log.error("full time for %s but no setup stored; result not written", match_id)
            return
        side = {doc["setup"]["teams"][s]["team_id"]: s for s in ("home", "away")}
        rows = list(self.events_c.query_items("SELECT c.type, c.team_id, c.shot_outcome FROM c",
                                              partition_key=match_id))
        score = {"home": 0, "away": 0}
        for r in rows:
            if r.get("type") == "Shot" and r.get("shot_outcome") == "goal" and r.get("team_id") in side:
                score[side[r["team_id"]]] += 1
        doc.update(status="finished", result={"score": score, "events": len(rows)})
        self.matches.upsert_item(_clean(doc, drop_id=False))

    # ------------------------------------------------------------------ reading

    def match(self, match_id: str) -> dict | None:
        doc = self._match_doc(match_id)
        return _clean(doc) if doc else None

    def events(self, match_id: str) -> list[dict]:
        rows = self.events_c.query_items("SELECT * FROM c ORDER BY c.seq", partition_key=match_id)
        return [_clean(r) for r in rows]

    def stats(self, match_id: str) -> list[dict]:
        rows = self.stats_c.query_items("SELECT * FROM c ORDER BY c.match_ms", partition_key=match_id)
        return [_clean(r) for r in rows]


def _if_not_modified():
    from azure.core import MatchConditions
    return MatchConditions.IfNotModified
