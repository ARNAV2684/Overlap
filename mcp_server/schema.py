"""Strict first-slice document and tool schemas. Spec: mcp_server/specs/tools.md §§2–4."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

INPUT_LIMIT = 1024
OUTPUT_LIMIT = 12 * 1024
DOCUMENT_LIMIT = 64 * 1024
SYSTEM_FIELDS = frozenset({"_rid", "_self", "_etag", "_attachments", "_ts"})
MatchId = Annotated[str, Field(pattern=r"^SYN-[0-9]{4}$")]
MomentId = Annotated[str, Field(pattern=r"^MO-[0-9]{4}-[0-9]{4}$")]
TeamId = Annotated[str, Field(pattern=r"^[A-Z]{3}$")]
PlayerId = Annotated[str, Field(pattern=r"^[A-Z]{3}-[0-9]{2}$")]
EventId = Annotated[str, Field(pattern=r"^SYN-[0-9]{4}-[0-9]{5}$")]
Version = Annotated[int, Field(ge=1, le=1, json_schema_extra={"const": 1})]
NonNegative = Annotated[int, Field(ge=0)]
Period = Annotated[int, Field(ge=1, le=2)]
Reason = Literal[
    "not_found", "version_mismatch", "source_not_ready", "context_mismatch",
    "source_timeout", "response_too_large", "source_error", "outside_scope",
]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)


class Identity(StrictModel):
    match_id: MatchId
    moment_id: MomentId
    evidence_version: Version


class Source(StrictModel):
    event_seq: Annotated[int, Field(ge=1, le=99999)]
    period: Period
    match_ms: NonNegative


class Team(StrictModel):
    team_id: TeamId
    name: Annotated[str, Field(min_length=1, max_length=80)]

    @model_validator(mode="after")
    def valid_name(self):
        if not self.name.strip() or any(ord(c) < 32 for c in self.name):
            raise ValueError("Invalid team name")
        return self


class Teams(StrictModel):
    home: Team
    away: Team

    @model_validator(mode="after")
    def distinct(self):
        if self.home.team_id == self.away.team_id:
            raise ValueError("Team IDs must differ")
        return self


class Score(StrictModel):
    home: NonNegative
    away: NonNegative


class Context(StrictModel):
    phase: Literal["live"]
    score: Score
    teams: Teams


class Window(StrictModel):
    from_ms: NonNegative
    to_ms: NonNegative


class Fact(StrictModel):
    key: Literal["shots_last_5min", "window_duration_min"]
    value: int
    unit: str | None = None
    decimals: Annotated[int, Field(ge=0, le=0)]
    label: Annotated[str, Field(min_length=1, max_length=240)]

    @model_validator(mode="after")
    def meanings(self):
        if self.key == "shots_last_5min":
            if self.value < 3 or "unit" in self.model_fields_set:
                raise ValueError("Shot count must be at least three, without a unit")
        elif self.value != 5 or self.unit != "min":
            raise ValueError("Window duration must be five minutes")
        return self


class Evidence(StrictModel):
    moment_id: MomentId
    match_id: MatchId
    trigger: Literal["shot_cluster"]
    period: Period
    match_ms: NonNegative
    clock: Annotated[str, Field(pattern=r"^[0-9]{1,3}(?:\+[0-9]{1,2})?:[0-5][0-9]$")]
    team_id: TeamId
    player_ids: Annotated[list[PlayerId], Field(min_length=1, max_length=99)]
    event_ids: Annotated[list[EventId], Field(min_length=3, max_length=500)]
    window: Window
    facts: Annotated[list[Fact], Field(min_length=2, max_length=2)]

    @model_validator(mode="after")
    def consistent(self):
        if {f.key for f in self.facts} != {"shots_last_5min", "window_duration_min"}:
            raise ValueError("Exactly the two agreed facts are required")
        shots = next(f.value for f in self.facts if f.key == "shots_last_5min")
        if shots != len(self.event_ids) or len(set(self.event_ids)) != shots:
            raise ValueError("Shot count must match distinct evidence events")
        if len(set(self.player_ids)) != len(self.player_ids) or len(self.player_ids) > shots:
            raise ValueError("Invalid distinct shooter list")
        if any(p[:3] != self.team_id for p in self.player_ids):
            raise ValueError("Shooter belongs to a different team")
        if any(e[:8] != self.match_id for e in self.event_ids):
            raise ValueError("Event belongs to a different match")
        seqs = [int(e[-5:]) for e in self.event_ids]
        if seqs != sorted(seqs) or seqs[0] < 1:
            raise ValueError("Events must be in sequence order")
        if self.window.to_ms != self.match_ms or self.window.to_ms - self.window.from_ms != 300000:
            raise ValueError("Invalid five-minute window")
        return self


class Moment(Identity):
    id: MomentId
    kind: Literal["moment"]
    schema_version: Version
    evidence: Evidence
    source: Source
    context: Context

    @model_validator(mode="after")
    def consistent(self):
        if self.id != self.moment_id or self.match_id[4:] != self.moment_id[3:7]:
            raise ValueError("Document identity mismatch")
        e, s = self.evidence, self.source
        if (e.match_id, e.moment_id) != (self.match_id, self.moment_id):
            raise ValueError("Evidence identity mismatch")
        if (e.period, e.match_ms) != (s.period, s.match_ms):
            raise ValueError("Evidence cursor mismatch")
        if int(e.event_ids[-1][-5:]) != s.event_seq:
            raise ValueError("Source must end at the triggering evidence event")
        if e.team_id not in (self.context.teams.home.team_id, self.context.teams.away.team_id):
            raise ValueError("Evidence team absent from context")
        return self

    @property
    def identity(self) -> Identity:
        return Identity(match_id=self.match_id, moment_id=self.moment_id,
                        evidence_version=self.evidence_version)


class Provenance(StrictModel):
    source: Literal["fixture", "cosmos"]
    document_id: MomentId


class Reply(Identity):
    status: Literal["ok", "unavailable", "denied"]
    as_of: Source | None = None
    state: Context | None = None
    provenance: Provenance | None = None
    reason: Reason | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.status == "ok":
            if self.reason is not None or None in (self.as_of, self.state, self.provenance):
                raise ValueError("Success requires context, cursor and provenance")
            if self.provenance.document_id != self.moment_id:
                raise ValueError("Provenance identity mismatch")
        else:
            if self.reason is None or any(x is not None for x in (self.as_of, self.state, self.provenance)):
                raise ValueError("Failure must not contain state")
            if (self.status == "denied") != (self.reason == "outside_scope"):
                raise ValueError("Invalid failure reason")
        return self

    def payload(self) -> dict:
        return self.model_dump(exclude_none=True)


def encoded(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, allow_nan=False, sort_keys=True,
                      separators=(",", ":")).encode("utf-8")


def clean_document(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if k not in SYSTEM_FIELDS}


def _unique_pairs(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def read_json(path: Path) -> dict:
    with path.open("rb") as stream:
        raw = stream.read(DOCUMENT_LIMIT + 1)
    if len(raw) > DOCUMENT_LIMIT:
        raise ValueError("Document exceeds size limit")
    value = json.loads(raw, object_pairs_hook=_unique_pairs,
                       parse_constant=lambda _: (_ for _ in ()).throw(ValueError("Non-finite JSON")))
    if not isinstance(value, dict):
        raise TypeError("Expected a JSON object")
    return value


def parse_moment(doc: dict) -> Moment:
    if not isinstance(doc, dict) or len(encoded(doc)) > DOCUMENT_LIMIT:
        raise ValueError("Invalid or oversized source")
    return Moment.model_validate(clean_document(doc))


def projection(moment: Moment, source: Literal["fixture", "cosmos"]) -> Reply:
    return Reply(**moment.identity.model_dump(), status="ok", as_of=moment.source,
                 state=moment.context, provenance=Provenance(source=source, document_id=moment.id))
