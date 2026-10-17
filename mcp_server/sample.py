"""Separate create-only emulator loader. Spec: mcp_server/specs/tools.md §6."""

from __future__ import annotations

import argparse
import asyncio
import logging
from pathlib import Path

from azure.cosmos import PartitionKey, exceptions

from .data_access import cosmos_client
from .schema import clean_document, encoded, parse_moment, read_json
from .server import SAMPLE_DIR

SAMPLE_FILE = SAMPLE_DIR / "MO-1017-0001.json"


async def insert_once(container, document: dict) -> str:
    document = clean_document(document)
    parse_moment(document)
    try:
        await container.create_item(body=document)
        result = "created"
    except exceptions.CosmosResourceExistsError:
        result = "already_present"
    stored = await container.read_item(document["id"], partition_key=document["match_id"])
    if clean_document(stored) != document:
        raise ValueError("Conflicting stored moment; nothing was overwritten")
    return result


async def seed(path: Path) -> dict:
    document = read_json(path)
    parse_moment(document)
    async with asyncio.timeout(15):
        async with cosmos_client() as client:
            database = await client.create_database_if_not_exists("live")
            container = await database.create_container_if_not_exists(
                "moments", partition_key=PartitionKey(path="/match_id"))
            properties = await container.read()
            if properties.get("partitionKey", {}).get("paths") != ["/match_id"]:
                raise ValueError("Existing moments container has the wrong partition key")
            result = await insert_once(container, document)
    return {"status": result, "database": "live", "container": "moments",
            "match_id": document["match_id"], "moment_id": document["id"],
            "data_kind": "development_sample", "readback_verified": True}


def main() -> None:
    logging.basicConfig(level=logging.ERROR)
    p = argparse.ArgumentParser(description="Create one development sample in the local Cosmos emulator")
    p.add_argument("--sample", type=Path, default=SAMPLE_FILE)
    args = p.parse_args()
    try:
        print(encoded(asyncio.run(seed(args.sample))).decode())
    except Exception:  # noqa: BLE001 -- CLI boundary must not print SDK errors containing connection details.
        p.exit(1, "Sample load failed: check local endpoint/key, JSON, partition key and existing content. "
                  "No conflicting document is replaced.\n")


if __name__ == "__main__":
    main()
