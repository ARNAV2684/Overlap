"""The screen relay's I/O: the Cosmos store and the Web PubSub sender (functions/specs/screen-relay.md §4).

Same code locally and on Azure; settings decide where it points (infra/specs/local-development.md §4):

  OVERLAP_COSMOS_ENDPOINT     emulator http://localhost:8081, or https://<name>.documents.azure.com
  OVERLAP_COSMOS_KEY          only for the local emulator; on Azure leave it unset (managed identity)
  OVERLAP_COSMOS_DATABASE     default live
  OVERLAP_COSMOS_CONTAINER    default screen (partition key /match_id)
  OVERLAP_WEBPUBSUB_ENDPOINT  stand-in http://localhost:8787, or https://<name>.webpubsub.azure.com
  OVERLAP_WEBPUBSUB_HUB       default live

Container layout, partition key `match_id`:
  state                 the relay state for the match (+ "type": "state")
  env-<seq, 8 digits>   one event / status / stats envelope   {"type": "envelope", "envelope": {...}}
  positions-latest      the newest positions envelope         {"type": "positions", "envelope": {...}}
"""

from __future__ import annotations

import logging
import os
from urllib.parse import urlparse

from azure.cosmos import CosmosClient, PartitionKey, exceptions

log = logging.getLogger("screen_relay.store")
SYSTEM_FIELDS = ("_rid", "_self", "_etag", "_attachments", "_ts", "id", "type")
LOCAL_HOSTS = ("localhost", "127.0.0.1")


def _is_local(endpoint: str) -> bool:
    return urlparse(endpoint).hostname in LOCAL_HOSTS


def _credential():
    from azure.identity import DefaultAzureCredential
    return DefaultAzureCredential()


class CosmosStore:
    def __init__(self, endpoint: str, key: str | None, database: str, container: str):
        client = CosmosClient(endpoint, credential=key or _credential())
        if key:  # local emulator: create what Bicep creates on Azure
            db = client.create_database_if_not_exists(database)
            self.container = db.create_container_if_not_exists(container, partition_key=PartitionKey("/match_id"))
        else:
            self.container = client.get_database_client(database).get_container_client(container)

    def load(self, match_id: str) -> tuple[dict | None, str | None]:
        try:
            doc = self.container.read_item("state", partition_key=match_id)
        except exceptions.CosmosResourceNotFoundError:
            return None, None
        etag = doc["_etag"]
        return {k: v for k, v in doc.items() if k not in SYSTEM_FIELDS}, etag

    def save(self, match_id: str, state: dict, version: str | None, envelopes: list[dict]) -> bool:
        state_doc = {**state, "id": "state", "type": "state", "match_id": match_id}
        ops: list[tuple] = []
        if version is None:
            ops.append(("create", (state_doc,)))
        else:
            ops.append(("replace", ("state", state_doc), {"if_match_etag": version}))
        latest_positions = None
        for env in envelopes:
            if env["kind"] == "positions":
                latest_positions = env
            else:
                ops.append(("create", ({"id": f"env-{env['seq']:08d}", "match_id": match_id, "type": "envelope",
                                        "envelope": env},)))
        if latest_positions is not None:
            ops.append(("upsert", ({"id": "positions-latest", "match_id": match_id, "type": "positions",
                                    "envelope": latest_positions},)))
        try:
            self.container.execute_item_batch(batch_operations=ops, partition_key=match_id)
            return True
        except exceptions.CosmosBatchOperationError as ex:
            if ex.error_index == 0 and ex.status_code in (409, 412):
                return False  # someone else saved this match's state first: re-apply on fresh state
            raise

    def matches_with_open_work(self) -> list[str]:
        rows = self.container.query_items(
            "SELECT c.match_id FROM c WHERE c.type = 'state' AND c.open_work = true",
            enable_cross_partition_query=True)
        return [r["match_id"] for r in rows]


class WebPubSubSender:
    def __init__(self, endpoint: str, hub: str):
        from azure.messaging.webpubsubservice import WebPubSubServiceClient
        if _is_local(endpoint):
            # The local stand-in accepts any key; Azure never uses one.
            self.client = WebPubSubServiceClient.from_connection_string(
                f"Endpoint={endpoint};AccessKey=local-development-only-not-a-real-key;Version=1.0;", hub=hub)
        else:
            self.client = WebPubSubServiceClient(endpoint=endpoint, hub=hub, credential=_credential())

    def send(self, group: str, envelope: dict) -> None:
        self.client.send_to_group(group, envelope, content_type="application/json")


def from_env() -> tuple[CosmosStore, WebPubSubSender]:
    store = CosmosStore(os.environ["OVERLAP_COSMOS_ENDPOINT"], os.environ.get("OVERLAP_COSMOS_KEY") or None,
                        os.environ.get("OVERLAP_COSMOS_DATABASE", "live"),
                        os.environ.get("OVERLAP_COSMOS_CONTAINER", "screen"))
    sender = WebPubSubSender(os.environ["OVERLAP_WEBPUBSUB_ENDPOINT"], os.environ.get("OVERLAP_WEBPUBSUB_HUB", "live"))
    return store, sender
