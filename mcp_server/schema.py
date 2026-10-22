"""Strict moment document and tool schemas. Spec: mcp_server/specs/tools.md §§2–4.

Accepts every moment the stats engine writes (stats/agents-guide.md §5): eight triggers, their fact keys,
context.players and 1–500 event ids. Anything else is still rejected."""

from __future__ import annotations

import itertools
import json
import math
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

INPUT_LIMIT = 1024
OUTPUT_LIMIT = 12 * 1024
DOCUMENT_LIMIT = 64 * 1024
# Cosmos system fields; a change-feed delivery (Azure Functions trigger) also carries _lsn
SYSTEM_FIELDS = frozenset({"_rid", "_self", "_etag", "_attachments", "_ts", "_lsn"})
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
Trigger = Literal["goal", "red_card", "penalty", "big_chance", "shot_cluster", "momentum_swing", "press_change",
                  "milestone"]
Position = Literal["GK", "CB", "LB", "RB", "LWB", "RWB", "DM", "CM", "AM", "LM", "RM", "LW", "RW", "ST"]
FIVE_MIN_MS = 300000

# Fact key -> (unit or None, decimals). stats/specs/evidence-packs.md §1; stats/agents-guide.md §3.
FACT_SPECS: dict[str, tuple[str | None, int]] = {
    "shot_xg": ("xG", 2), "shot_distance_m": ("m", 0), "team_goals_match": (None, 0),
    "opponent_goals_match": (None, 0), "player_goals_match": (None, 0), "team_shots_match": (None, 0),
    "shot_is_penalty": (None, 0), "team_xg_match": ("xG", 2), "team_players_on_pitch": (None, 0),
    "team_fouls_match": (None, 0), "team_cards_match": (None, 0), "shots_last_5min": (None, 0),
    "window_duration_min": ("min", 0), "momentum_share_last_5min_pct": ("%", 0),
    "momentum_share_previous_10min_pct": ("%", 0), "team_shots_last_5min": (None, 0),
    "pressures_per_opp_pass_last_5min": (None, 2), "pressures_per_opp_pass_previous_10min": (None, 2),
    "team_pressures_last_5min": (None, 0), "team_high_regains_last_5min": (None, 0),
    "press_height_last_5min_m": ("m", 0),
}
# Trigger -> (required fact keys, optional fact keys).
TRIGGER_FACTS: dict[str, tuple[frozenset[str], frozenset[str]]] = {
    "goal": (frozenset({"shot_xg", "shot_distance_m", "team_goals_match", "opponent_goals_match",
                        "player_goals_match", "team_shots_match", "shot_is_penalty"}), frozenset()),
    "red_card": (frozenset({"team_players_on_pitch", "team_fouls_match", "team_cards_match"}), frozenset()),
    "penalty": (frozenset({"shot_xg", "team_goals_match", "opponent_goals_match"}), frozenset()),
    "big_chance": (frozenset({"shot_xg", "shot_distance_m", "team_shots_match", "team_xg_match"}), frozenset()),
    "shot_cluster": (frozenset({"shots_last_5min", "window_duration_min"}), frozenset()),
    "momentum_swing": (frozenset({"momentum_share_last_5min_pct", "momentum_share_previous_10min_pct",
                                  "team_shots_last_5min", "window_duration_min"}), frozenset()),
    "press_change": (frozenset({"pressures_per_opp_pass_last_5min", "pressures_per_opp_pass_previous_10min",
                                "team_pressures_last_5min", "team_high_regains_last_5min",
                                "window_duration_min"}), frozenset({"press_height_last_5min_m"})),
    "milestone": (frozenset({"player_goals_match", "shot_xg"}), frozenset()),
}
FIVE_MINUTE_WINDOW = frozenset({"shot_cluster", "momentum_swing", "press_change"})


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


class Player(StrictModel):
    player_id: PlayerId
    name: Annotated[str, Field(min_length=1, max_length=80)]
    pos: Position

    @model_validator(mode="after")
    def valid_name(self):
        if not self.name.strip() or any(ord(c) < 32 for c in self.name):
            raise ValueError("Invalid player name")
        return self


class Context(StrictModel):
    phase: Literal["live"]
    score: Score
    teams: Teams
    players: Annotated[list[Player], Field(max_length=99)] | None = None   # stats S3; absent in the old sample


class Window(StrictModel):
    from_ms: NonNegative
    to_ms: NonNegative


class Fact(StrictModel):
    key: str
    value: int | float
    unit: str | None = None
    decimals: Annotated[int, Field(ge=0, le=2)]
    label: Annotated[str, Field(min_length=1, max_length=240)]

    @model_validator(mode="after")
    def meanings(self):
        spec = FACT_SPECS.get(self.key)
        if spec is None:
            raise ValueError("Unknown fact key")
        unit, decimals = spec
        if self.decimals != decimals:
            raise ValueError("Unexpected decimals for this fact")
        if unit is None and "unit" in self.model_fields_set:
            raise ValueError("This fact has no unit")
        if unit is not None and self.unit != unit:
            raise ValueError("Unexpected unit for this fact")
        v = self.value
        if decimals == 0 and not isinstance(v, int):
            raise ValueError("Whole-number fact must be an integer")
        if not math.isfinite(v) or v < 0 or round(v, decimals) != v:
            raise ValueError("Fact value out of range or not at its decimals")
        if unit == "%" and v > 100:
            raise ValueError("Percentage above 100")
        if self.key == "shot_xg" and v > 1:
            raise ValueError("Shot xG above 1")
        if self.key == "shot_is_penalty" and v not in (0, 1):
            raise ValueError("Penalty flag must be 0 or 1")
        if self.key == "shots_last_5min" and v < 3:
            raise ValueError("Shot count must be at least three")
        if self.key == "window_duration_min" and v != 5:
            raise ValueError("Window duration must be five minutes")
        if self.key == "player_goals_match" and v < 1:
            raise ValueError("A scorer has at least one goal")
        return self


class Evidence(StrictModel):
    moment_id: MomentId
    match_id: MatchId
    trigger: Trigger
    period: Period
    match_ms: NonNegative
    clock: Annotated[str, Field(pattern=r"^[0-9]{1,3}(?:\+[0-9]{1,2})?:[0-5][0-9]$")]
    team_id: TeamId
    player_ids: Annotated[list[PlayerId], Field(max_length=99)]
    event_ids: Annotated[list[EventId], Field(min_length=1, max_length=500)]
    window: Window
    facts: Annotated[list[Fact], Field(min_length=2, max_length=7)]

    @model_validator(mode="after")
    def consistent(self):
        keys = [f.key for f in self.facts]
        required, optional = TRIGGER_FACTS[self.trigger]
        if len(set(keys)) != len(keys) or not required <= set(keys) <= required | optional:
            raise ValueError("Facts do not match the trigger's evidence pack")
        if len(set(self.player_ids)) != len(self.player_ids):
            raise ValueError("Duplicate player id")
        if any(p[:3] != self.team_id for p in self.player_ids):
            raise ValueError("Player belongs to a different team")
        if any(e[:8] != self.match_id for e in self.event_ids):
            raise ValueError("Event belongs to a different match")
        seqs = [int(e[-5:]) for e in self.event_ids]
        if seqs[0] < 1 or any(b <= a for a, b in itertools.pairwise(seqs)):
            raise ValueError("Events must be distinct and in sequence order")
        if self.window.to_ms != self.match_ms or self.window.from_ms > self.window.to_ms:
            raise ValueError("Invalid evidence window")
        if self.trigger in FIVE_MINUTE_WINDOW and self.window.to_ms - self.window.from_ms != FIVE_MIN_MS:
            raise ValueError("Invalid five-minute window")
        if self.trigger != "shot_cluster" and self.trigger not in ("momentum_swing", "press_change") \
                and not self.player_ids:
            raise ValueError("This trigger names at least one player")
        if self.trigger == "shot_cluster":                  # CONTRACTS.md §10.1
            shots = next(f.value for f in self.facts if f.key == "shots_last_5min")
            if shots != len(self.event_ids):
                raise ValueError("Shot count must match distinct evidence events")
            if not self.player_ids or len(self.player_ids) > shots:
                raise ValueError("Invalid distinct shooter list")
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
        if self.context.players is not None:
            ids = [p.player_id for p in self.context.players]
            if len(set(ids)) != len(ids) or not set(ids) <= set(e.player_ids):
                raise ValueError("Context players must be distinct evidence players")
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


# --- Analyst tools (M2). Spec: mcp_server/specs/tools.md §2b ------------------------------------------------------
# These return context for the analyst, never narration evidence: narrated numbers come only from evidence.facts.

ToolStatus = Literal["ok", "unavailable", "denied"]
Number = int | float


class PlayerRequest(Identity):
    player_id: PlayerId


class TeamRequest(Identity):
    team_id: TeamId


class AsOf(StrictModel):
    event_seq: Annotated[int, Field(ge=0, le=99999)]
    match_ms: NonNegative


class ToolProvenance(StrictModel):
    source: Literal["fixture", "cosmos"]
    container: Literal["match_state", "stats"]
    document_id: Annotated[str, Field(pattern=r"^(state|stats-[0-9]{9})$")]


class ToolReply(Identity):
    """Common envelope for the analyst tools: status, cursor, provenance and one data object."""
    tool: Literal["get_live_state", "get_player_context", "get_team_pressing", "get_pass_network", "compare_periods"]
    status: ToolStatus
    as_of: AsOf | None = None
    after_moment: bool | None = None
    provenance: ToolProvenance | None = None
    data: dict | None = None
    reason: Reason | None = None

    @model_validator(mode="after")
    def consistent(self):
        if self.status == "ok":
            if self.reason is not None or None in (self.as_of, self.provenance, self.data, self.after_moment):
                raise ValueError("Success requires data, cursor and provenance")
        else:
            if self.reason is None or any(x is not None for x in (self.as_of, self.provenance, self.data)):
                raise ValueError("Failure must not contain data")
            if (self.status == "denied") != (self.reason == "outside_scope"):
                raise ValueError("Invalid failure reason")
        return self

    def payload(self) -> dict:
        return self.model_dump(exclude_none=True)
