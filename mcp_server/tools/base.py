"""Bound session shared by the analyst tools. Spec: mcp_server/specs/tools.md §2b.

A server process is bound to one match, moment and evidence version (one agent job). Every tool first resolves that
moment (once per session), then answers from `match_state` or the archived panels with point reads only. Out-of-scope
requests (another match or moment, a team or player not in this match) are denied without a read. Each tool has a
two-attempt budget per session, like `get_match_state`.
"""

from __future__ import annotations

import asyncio
from typing import ClassVar

from ..data_access import Reader, SourceFailure, bounded_doc, bounded_read
from ..schema import OUTPUT_LIMIT, AsOf, Identity, Moment, ToolProvenance, ToolReply, encoded, parse_moment

SIDES = ("home", "away")
MAX_ATTEMPTS = 2


class OutOfScope(Exception):
    """The request names something outside this session's match: deny without reading."""


class BoundSession:
    def __init__(self, reader: Reader, bound: Identity, timeout: float = 2.0):
        self.reader, self.bound, self.timeout = reader, bound, timeout
        self._moment: Moment | None = None
        self._lock = asyncio.Lock()

    async def moment(self) -> Moment:
        async with self._lock:
            if self._moment is None:
                moment = parse_moment(await bounded_read(self.reader, self.bound, self.timeout))
                if moment.identity != self.bound:
                    raise SourceFailure("context_mismatch")
                self._moment = moment
            return self._moment

    async def doc(self, container: str, doc_id: str) -> dict:
        doc = await bounded_doc(self.reader, container, self.bound.match_id, doc_id, self.timeout)
        if not isinstance(doc, dict) or doc.get("match_id") != self.bound.match_id:
            raise SourceFailure("context_mismatch")
        return doc

    def side_of(self, moment: Moment, team_id: str) -> str:
        for side in SIDES:
            if getattr(moment.context.teams, side).team_id == team_id:
                return side
        raise OutOfScope

    def provenance(self, container: str, document_id: str) -> ToolProvenance:
        return ToolProvenance(source=self.reader.source, container=container, document_id=document_id)


class AnalystTool:
    name: ClassVar[str]
    description: ClassVar[str]
    request_model: ClassVar[type[Identity]]

    def __init__(self, session: BoundSession):
        self.session = session
        self.attempts = 0
        self.lock = asyncio.Lock()

    def _reply(self, requested: Identity, **fields) -> ToolReply:
        ident = Identity(match_id=requested.match_id, moment_id=requested.moment_id,
                         evidence_version=requested.evidence_version)
        return ToolReply(**ident.model_dump(), tool=self.name, **fields)

    def ok(self, requested: Identity, as_of: AsOf, after_moment: bool, provenance: ToolProvenance,
           data: dict) -> ToolReply:
        return self._reply(requested, status="ok", as_of=as_of, after_moment=after_moment, provenance=provenance,
                           data=data)

    async def answer(self, requested: Identity, moment: Moment) -> ToolReply:
        raise NotImplementedError

    async def call(self, requested: Identity) -> ToolReply:
        ident = Identity(match_id=requested.match_id, moment_id=requested.moment_id,
                         evidence_version=requested.evidence_version)
        if ident != self.session.bound:
            return self._reply(requested, status="denied", reason="outside_scope")
        async with self.lock:
            while self.attempts < MAX_ATTEMPTS:
                self.attempts += 1
                try:
                    reply = await self.answer(requested, await self.session.moment())
                    if len(encoded(reply.payload())) > OUTPUT_LIMIT:
                        raise SourceFailure("response_too_large")
                    return reply
                except OutOfScope:
                    return self._reply(requested, status="denied", reason="outside_scope")
                except SourceFailure as exc:
                    if exc.reason == "outside_scope":
                        return self._reply(requested, status="denied", reason="outside_scope")
                    if exc.transient and self.attempts < MAX_ATTEMPTS:
                        continue
                    return self._reply(requested, status="unavailable", reason=exc.reason)
                except (ValueError, TypeError, KeyError, AttributeError):
                    return self._reply(requested, status="unavailable", reason="context_mismatch")
            return self._reply(requested, status="unavailable", reason="source_not_ready")


def pick(source: dict, fields: tuple[str, ...]) -> dict:
    """Allowlisted numeric or text fields; anything else is left out, never invented."""
    def allowed(v) -> bool:
        scalar = v is None or (isinstance(v, (int, float, str)) and not isinstance(v, bool))
        return scalar or (isinstance(v, list) and all(isinstance(x, str) for x in v))
    return {f: source.get(f) for f in fields if f in source and allowed(source.get(f))}


def state_cursor(state: dict) -> AsOf:
    src = state["source"]
    return AsOf(event_seq=src["event_seq"], match_ms=src["match_ms"])


def panel_id(match_ms: int) -> str:
    return f"stats-{match_ms:09d}"
