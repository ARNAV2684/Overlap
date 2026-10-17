"""Scope-bound immutable context read. Spec: mcp_server/specs/tools.md §§2–4."""

from __future__ import annotations

import asyncio

from ..data_access import Reader, SourceFailure, bounded_read
from ..schema import OUTPUT_LIMIT, Identity, Reply, encoded, parse_moment, projection


class MatchStateTool:
    def __init__(self, reader: Reader, bound: Identity, timeout: float = 2.0):
        self.reader, self.bound, self.timeout = reader, bound, timeout
        self.attempts = 0
        self.lock = asyncio.Lock()

    async def call(self, requested: Identity) -> Reply:
        if requested != self.bound:
            return Reply(**requested.model_dump(), status="denied", reason="outside_scope")
        async with self.lock:
            # One session per job. Repeated calls cannot multiply the two-attempt allowance.
            while self.attempts < 2:
                self.attempts += 1
                try:
                    doc = await bounded_read(self.reader, requested, self.timeout)
                    if not isinstance(doc, dict):
                        raise SourceFailure("context_mismatch")
                    if (type(doc.get("schema_version")) is not int
                            or type(doc.get("evidence_version")) is not int
                            or doc["schema_version"] != 1 or doc["evidence_version"] != 1):
                        raise SourceFailure("version_mismatch")
                    moment = parse_moment(doc)
                    if moment.identity != requested:
                        raise SourceFailure("context_mismatch")
                    reply = projection(moment, self.reader.source)
                    if len(encoded(reply.payload())) > OUTPUT_LIMIT:
                        raise SourceFailure("response_too_large")
                    return reply
                except SourceFailure as exc:
                    if exc.transient and self.attempts < 2:
                        continue
                    return Reply(**requested.model_dump(), status="unavailable", reason=exc.reason)
                except (ValueError, TypeError, KeyError):
                    return Reply(**requested.model_dump(), status="unavailable", reason="context_mismatch")
            return Reply(**requested.model_dump(), status="unavailable", reason="source_not_ready")
