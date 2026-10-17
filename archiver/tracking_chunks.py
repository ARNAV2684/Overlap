"""Blob side of the archive: one gzip NDJSON file per minute of play (CONTRACTS.md §4.1, storage spec §2).

Path `<match_id>/p<period>/m<MMM>.ndjson.gz` in container `tracking`. Each batch's frames for a minute become one gzip
member, staged as a block (id from the first and last `match_ms`, so restaging the same batch replaces it); then the
blob is committed with all its blocks in `match_ms` order. Joined gzip members are one valid gzip file.

Settings: OVERLAP_ARCHIVE_STORAGE (connection string; "UseDevelopmentStorage=true" = local Azurite) or, on Azure,
OVERLAP_ARCHIVE_BLOB_ENDPOINT (https://<account>.blob.core.windows.net, managed identity).
"""

from __future__ import annotations

import gzip
import json
import os
import re

from azure.core.exceptions import ResourceExistsError, ResourceNotFoundError
from azure.storage.blob import BlobBlock, BlobServiceClient

CONTAINER = "tracking"
# Azurite's public, documented development account (works only against Azurite on localhost).
AZURITE = ("DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;"
           "AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;"
           "BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;")
NAME = re.compile(r"^(?P<match>SYN-\d{4})/p(?P<period>\d+)/m(?P<minute>\d{3})\.ndjson\.gz$")


def blob_name(match_id: str, period: int, minute: int) -> str:
    return f"{match_id}/p{period}/m{minute:03d}.ndjson.gz"


def service_from_env() -> BlobServiceClient:
    endpoint = os.environ.get("OVERLAP_ARCHIVE_BLOB_ENDPOINT")
    if endpoint:
        from azure.identity import DefaultAzureCredential
        return BlobServiceClient(endpoint, credential=DefaultAzureCredential())
    conn = os.environ.get("OVERLAP_ARCHIVE_STORAGE", "UseDevelopmentStorage=true")
    if conn.strip().rstrip(";") == "UseDevelopmentStorage=true":
        conn = AZURITE
    return BlobServiceClient.from_connection_string(conn)


class BlobTracking:
    def __init__(self, service: BlobServiceClient, container: str = CONTAINER, create: bool = True):
        self.container = service.get_container_client(container)
        if create:
            try:
                self.container.create_container()
            except ResourceExistsError:
                pass

    @classmethod
    def from_env(cls) -> BlobTracking:
        return cls(service_from_env(), create=not os.environ.get("OVERLAP_ARCHIVE_BLOB_ENDPOINT"))

    def append(self, match_id: str, period: int, minute: int, frames: list[dict]) -> None:
        frames = sorted(frames, key=lambda f: f["match_ms"])
        data = gzip.compress("".join(json.dumps(f, separators=(",", ":"), ensure_ascii=False) + "\n"
                                     for f in frames).encode("utf-8"))
        block_id = f"{frames[0]['match_ms']:010d}-{frames[-1]['match_ms']:010d}"
        blob = self.container.get_blob_client(blob_name(match_id, period, minute))
        blob.stage_block(block_id, data)
        committed, uncommitted = blob.get_block_list("all")
        ids = sorted({b.id for b in committed} | {b.id for b in uncommitted})
        blob.commit_block_list([BlobBlock(block_id=i) for i in ids])

    def minutes(self, match_id: str) -> list[tuple[int, int, str]]:
        out = []
        for b in self.container.list_blobs(name_starts_with=f"{match_id}/"):
            m = NAME.match(b.name)
            if m:
                out.append((int(m["period"]), int(m["minute"]), b.name))
        return sorted(out)

    def frames(self, match_id: str) -> list[dict]:
        """Every stored frame of the match in order, repeats (same match_ms) dropped."""
        seen: set[int] = set()
        out = []
        for _, _, name in self.minutes(match_id):
            try:
                raw = self.container.download_blob(name).readall()
            except ResourceNotFoundError:
                continue
            for line in gzip.decompress(raw).decode("utf-8").splitlines():
                if not line:
                    continue
                f = json.loads(line)
                if f["match_ms"] in seen:
                    continue
                seen.add(f["match_ms"])
                out.append(f)
        return out
