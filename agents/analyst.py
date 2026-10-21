# analyst.py — Tactical analyst
#
# Purpose: explain why the moment matters: read context through the MCP tools, then one model call for a short
#          interpretation (no numbers, not displayed) and the fact keys that matter
# Inputs:  the moment; MCP context (frozen moment context, live state, player, pressing, pass network, periods)
# Outputs: {interpretation | None, key_facts, context: ok | unavailable | off, tools: [...], merged_facts}
# Spec:    agents/specs/agents.md §2; mcp_server/specs/tools.md; stats/agents-guide.md §4 (Tactical analyst)
#
# Numbers from the tools are context only: never cited, and nothing computed after the moment is used as its cause
# (`after_moment` replies are dropped). Denied scope or another moment's context rejects the job.

from __future__ import annotations

import json
import re

from pydantic import BaseModel, Field, field_validator

from context import ContextRejected, ContextUnavailable
from fact_checker import evidence_view
from models import ModelFailed
from runtime import RunState

# Tools that fit each trigger, after get_match_state and get_live_state. "actor" is player_ids[0].
PLAN = {"goal": [("get_player_context", "actor")], "milestone": [("get_player_context", "actor")],
        "big_chance": [("get_player_context", "actor")], "penalty": [("get_player_context", "actor")],
        "red_card": [("get_player_context", "actor")], "shot_cluster": [("compare_periods", "team")],
        "momentum_swing": [("compare_periods", "team"), ("get_pass_network", "team")],
        "press_change": [("get_team_pressing", "team"), ("compare_periods", "team")]}
CONTEXT_CHARS = 3200                         # the tool data the model sees; the evidence is never cut
DIGIT = re.compile(r"\d")


class Analysis(BaseModel):
    interpretation: str = Field(min_length=1, max_length=300)
    key_facts: list[str] = Field(min_length=1, max_length=8)

    @field_validator("interpretation")
    @classmethod
    def no_numbers(cls, v: str) -> str:
        if DIGIT.search(v):
            raise ValueError("the interpretation must not contain numbers")
        return v


async def run(run: RunState) -> dict:
    spot = run.output("spotter")
    if not spot.get("model") or run.deps.context is None:
        return {"interpretation": None, "key_facts": _keys(run), "context": "off", "tools": []}
    try:
        tools, data = await _read_context(run)
    except ContextRejected as e:
        return {"terminal": "rejected", "reason": f"mcp:{e}"}
    except ContextUnavailable as e:
        return {"interpretation": None, "key_facts": _keys(run), "context": "unavailable", "reason": str(e),
                "tools": []}
    merged = await _merged_facts(run, spot.get("merged", []))
    payload = {"moment": evidence_view(run.moment), "context": data, "same_event_moments": merged}
    try:
        result = await run.ask("analyst", payload, Analysis)
    except ModelFailed as e:
        return {"interpretation": None, "key_facts": _keys(run), "context": "ok", "tools": tools,
                "reason": e.reason}
    keys = [k for k in result.key_facts if k in _keys(run)] or _keys(run)
    return {"interpretation": result.interpretation, "key_facts": keys, "context": "ok", "tools": tools}


def _keys(run: RunState) -> list[str]:
    return [f["key"] for f in run.moment["evidence"]["facts"]]


async def _read_context(run: RunState) -> tuple[list[dict], dict]:
    """The frozen context must be this moment's own; the other tools are best effort (a failed one is skipped)."""
    m, e = run.moment, run.moment["evidence"]
    tools: list[dict] = []
    data: dict = {}
    async with run.deps.context(m) as mcp:
        frozen = await mcp.call("get_match_state")
        if frozen["state"]["teams"] != m["context"]["teams"]:
            raise ContextRejected("get_match_state:context_mismatch")
        tools.append({"tool": "get_match_state", "status": "ok"})
        plan = [("get_live_state", None), *PLAN.get(e["trigger"], [])]
        for tool, arg in plan:
            args = {}
            if arg == "actor":
                if not e["player_ids"]:
                    continue
                args = {"player_id": e["player_ids"][0]}
            elif arg == "team":
                args = {"team_id": e["team_id"]}
            try:
                reply = await mcp.call(tool, **args)
            except ContextUnavailable as err:
                tools.append({"tool": tool, "status": "unavailable", "reason": str(err)})
                continue
            except ContextRejected as err:
                if not str(err).endswith(":context_mismatch"):
                    raise                                    # denied scope or another version: reject the job
                # An optional tool that can't read its document consistently is skipped; its data is never used.
                # (The frozen context above is the identity check; a mismatch there still rejects.)
                tools.append({"tool": tool, "status": "inconsistent"})
                continue
            if reply.get("after_moment"):
                tools.append({"tool": tool, "status": "after_moment"})   # never explain a moment with later numbers
                continue
            tools.append({"tool": tool, "status": "ok", "as_of": reply.get("as_of")})
            data[tool] = _compact(tool, reply["data"])
    return tools, _bounded(data)


def _compact(tool: str, d: dict) -> dict:
    if tool == "get_team_pressing":
        return {k: v for k, v in d.items() if k != "pressing_grid"}
    if tool == "get_pass_network":
        return {**{k: v for k, v in d.items() if k != "links"}, "top_links": d.get("links", [])[:6]}
    return d


def _bounded(data: dict) -> dict:
    """Drop whole tool results (least useful last) until the context fits; never cut one in half."""
    order = ["get_pass_network", "compare_periods", "get_team_pressing", "get_player_context", "get_live_state"]
    data = dict(data)
    for tool in order:
        if len(json.dumps(data)) <= CONTEXT_CHARS:
            break
        data.pop(tool, None)
    return data


async def _merged_facts(run: RunState, ids: list[str]) -> list[dict]:
    """Moments of the same event that merged into this card: their facts are context, never citable here."""
    out = []
    for o in await run.deps.store.moments(run.match_id):
        if o["moment_id"] in ids:
            out.append({"trigger": o["evidence"]["trigger"],
                        "facts": [{"label": f["label"], "value": f["value"]} for f in o["evidence"]["facts"]]})
    return out
