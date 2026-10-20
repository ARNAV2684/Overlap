# narrator.py — Narrator
#
# Purpose: one model call writes the English lines for every requested audience text: casual, analyst, a club line
#          for each team and a player line for each followed player; a rewrite call fixes only the failed lines
# Inputs:  facts, names, the analyst's interpretation, the line ids and their limits
# Outputs: {lines: [{id, mode, lang: "en", text, claims}], fallback, model_ids}
# Spec:    agents/specs/agents.md §3; agents/specs/prompts.md §1–§2; CONTRACTS.md §5.1, §10.6
#
# Every number in a line is a claim of one fact at its stored value. Lines the model doesn't return (or returns in
# the wrong shape) use their template at once; the fact-checker decides about the rest.

from __future__ import annotations

from pydantic import BaseModel, Field

from fact_checker import LIMITS, evidence_view
from fallbacks import line_ids, mode_of, target_of, template_line, template_lines
from models import ModelFailed
from runtime import RunState


class Claim(BaseModel):
    key: str
    value: int | float


class DraftLine(BaseModel):
    id: str
    text: str = Field(min_length=1, max_length=400)
    claims: list[Claim] = Field(default_factory=list, max_length=8)


class Lines(BaseModel):
    lines: list[DraftLine] = Field(max_length=16)


def requested(moment: dict, ids: list[str]) -> list[dict]:
    """What each line is for, in words the model can use (no ids in the text it writes)."""
    teams = {moment["context"]["teams"][s]["team_id"]: moment["context"]["teams"][s]["name"] for s in ("home", "away")}
    players = {p["player_id"]: p["name"] for p in moment["context"].get("players") or []}
    out = []
    for i in ids:
        mode, target = mode_of(i), target_of(i)
        item = {"id": i, "mode": mode, "max_chars": LIMITS[mode]}
        if mode == "club":
            item["for_club"] = teams[target]
        elif mode == "player":
            item["for_player"] = players[target]
        out.append(item)
    return out


def _line(draft: DraftLine) -> dict:
    return {"id": draft.id, "mode": mode_of(draft.id), "lang": "en", "text": draft.text.strip(),
            "claims": [{"key": c.key, "value": c.value} for c in draft.claims]}


def _accept(result: Lines, ids: list[str]) -> dict[str, dict]:
    out: dict[str, dict] = {}
    for d in result.lines:
        if d.id in ids and d.id not in out:
            out[d.id] = _line(d)
    return out


async def run(run: RunState) -> dict:
    s, m = run.deps.settings, run.moment
    ids = line_ids(m, s.modes, s.max_player_lines)
    analysis = run.output("analyst")
    if not run.output("spotter").get("model") or analysis.get("context") == "unavailable":
        return {"lines": template_lines(m, ids), "fallback": True, "model_ids": []}
    payload = {"moment": evidence_view(m), "interpretation": analysis.get("interpretation"),
               "key_facts": analysis.get("key_facts"), "lines": requested(m, ids)}
    try:
        got = _accept(await run.ask("narrator", payload, Lines), ids)
    except ModelFailed:
        return {"lines": template_lines(m, ids), "fallback": True, "model_ids": []}
    lines = [got.get(i) or template_line(m, i) for i in ids]
    return {"lines": lines, "fallback": not got, "model_ids": [i for i in ids if i in got]}


async def rewrite(run: RunState, failed: list[dict], agent: str = "narrator") -> dict[str, dict]:
    """New candidates for the failed lines only: each with its text, claims and the checker's reasons, plus the
    permitted facts (fact-checking.md §3). Missing ones are simply not returned."""
    m = run.moment
    ids = [f["line"]["id"] for f in failed]
    payload = {"moment": evidence_view(m), "rewrite": [
        {**next(r for r in requested(m, ids) if r["id"] == f["line"]["id"]), "text": f["line"]["text"],
         "claims": f["line"]["claims"], "reasons": f["reasons"][:3]} for f in failed]}
    try:
        return _accept(await run.ask(agent, payload, Lines), ids)
    except ModelFailed:
        return {}
