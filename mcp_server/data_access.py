"""Explicit, read-only local sources. Spec: mcp_server/specs/tools.md §3."""

from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Protocol
from urllib.parse import urlsplit

from azure.core.exceptions import ServiceRequestError, ServiceResponseError
from azure.cosmos import exceptions
from azure.cosmos.aio import CosmosClient

from .schema import DOCUMENT_LIMIT, Identity, Reason, encoded, read_json


class SourceFailure(Exception):
    def __init__(self, reason: Reason, *, transient: bool = False):
        super().__init__(reason)
        self.reason, self.transient = reason, transient


DOC_CONTAINERS = ("match_state", "stats")          # read-only analyst sources (tools.md §2b)


class Reader(Protocol):
    source: str

    async def read(self, identity: Identity) -> dict: ...
    async def read_doc(self, container: str, match_id: str, doc_id: str) -> dict: ...
    async def close(self) -> None: ...


def _check_doc_args(container: str, doc_id: str) -> None:
    if container not in DOC_CONTAINERS or not doc_id.replace("-", "").isalnum():
        raise SourceFailure("outside_scope")


def local_cosmos_settings() -> tuple[str, str]:
    endpoint = os.environ.get("OVERLAP_COSMOS_ENDPOINT", "http://127.0.0.1:8081")
    parsed = urlsplit(endpoint)
    if (parsed.scheme not in ("http", "https") or parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ("", "/")):
        raise ValueError("This milestone accepts only a loopback Cosmos emulator endpoint")
    if not parsed.port:
        raise ValueError("Specify the local emulator port")
    if os.environ.get("OVERLAP_COSMOS_DATABASE", "live") != "live":
        raise ValueError("This milestone reads only database live")
    key = os.environ.get("OVERLAP_COSMOS_KEY")
    if not key:
        raise ValueError("Set OVERLAP_COSMOS_KEY from infra/local/env.example (emulator only)")
    return endpoint, key


def cosmos_client() -> CosmosClient:
    endpoint, key = local_cosmos_settings()
    # SDK retries are off: the bound tool owns its two-attempt budget.
    return CosmosClient(endpoint, credential=key, retry_total=0, retry_connect=0,
                        retry_read=0, retry_status=0, connection_timeout=1, read_timeout=1)


class FixtureReader:
    source = "fixture"

    def __init__(self, directory: Path):
        self.directory = directory.resolve()

    async def read(self, identity: Identity) -> dict:
        path = (self.directory / f"{identity.moment_id}.json").resolve()
        if path.parent != self.directory:
            raise SourceFailure("source_error")
        try:
            return read_json(path)
        except FileNotFoundError:
            raise SourceFailure("not_found") from None
        except (ValueError, TypeError, UnicodeError):
            raise SourceFailure("context_mismatch") from None
        except OSError:
            raise SourceFailure("source_error") from None

    async def read_doc(self, container: str, match_id: str, doc_id: str) -> dict:
        """Fixture layout: <dir>/<container>/<match_id>/<doc_id>.json."""
        _check_doc_args(container, doc_id)
        base = (self.directory / container / match_id).resolve()
        path = (base / f"{doc_id}.json").resolve()
        if path.parent != base or self.directory not in base.parents:
            raise SourceFailure("source_error")
        try:
            return read_json(path)
        except FileNotFoundError:
            raise SourceFailure("not_found") from None
        except (ValueError, TypeError, UnicodeError):
            raise SourceFailure("context_mismatch") from None
        except OSError:
            raise SourceFailure("source_error") from None

    async def close(self) -> None:
        pass


class CosmosReader:
    source = "cosmos"

    def __init__(self):
        self.client = cosmos_client()
        self.ready = False
        self.container = self.client.get_database_client("live").get_container_client("moments")

    async def read(self, identity: Identity) -> dict:
        try:
            if not self.ready:
                await self.client.__aenter__()
                self.ready = True
            doc = await self.container.read_item(identity.moment_id, partition_key=identity.match_id)
            if len(encoded(doc)) > DOCUMENT_LIMIT:
                raise SourceFailure("response_too_large")
            return doc
        except exceptions.CosmosResourceNotFoundError:
            raise SourceFailure("not_found") from None
        except exceptions.CosmosHttpResponseError as exc:
            transient = exc.status_code in (408, 429, 500, 502, 503, 504)
            raise SourceFailure("source_error", transient=transient) from None
        except (ServiceRequestError, ServiceResponseError):
            raise SourceFailure("source_error", transient=True) from None

    async def read_doc(self, container: str, match_id: str, doc_id: str) -> dict:
        _check_doc_args(container, doc_id)
        try:
            if not self.ready:
                await self.client.__aenter__()
                self.ready = True
            client = self.client.get_database_client("live").get_container_client(container)
            doc = await client.read_item(doc_id, partition_key=match_id)
            if len(encoded(doc)) > DOCUMENT_LIMIT:
                raise SourceFailure("response_too_large")
            return doc
        except exceptions.CosmosResourceNotFoundError:
            raise SourceFailure("not_found") from None
        except exceptions.CosmosHttpResponseError as exc:
            transient = exc.status_code in (408, 429, 500, 502, 503, 504)
            raise SourceFailure("source_error", transient=transient) from None
        except (ServiceRequestError, ServiceResponseError):
            raise SourceFailure("source_error", transient=True) from None

    async def close(self) -> None:
        await self.client.close()


def make_reader(source: str, directory: Path) -> Reader:
    if source == "fixture":
        return FixtureReader(directory)
    if source == "cosmos":
        return CosmosReader()
    raise ValueError("Choose explicitly between fixture and cosmos")


async def bounded_doc(reader: Reader, container: str, match_id: str, doc_id: str, timeout: float = 2.0) -> dict:
    try:
        async with asyncio.timeout(timeout):
            return await reader.read_doc(container, match_id, doc_id)
    except TimeoutError:
        raise SourceFailure("source_timeout", transient=True) from None


async def bounded_read(reader: Reader, identity: Identity, timeout: float = 2.0) -> dict:
    try:
        async with asyncio.timeout(timeout):
            return await reader.read(identity)
    except TimeoutError:
        raise SourceFailure("source_timeout", transient=True) from None
