"""A scripted model and a fake MCP context for the agent tests: no model, no network, no subprocess."""
from __future__ import annotations

import copy
from types import SimpleNamespace

from config import Settings
from fallbacks import template_line
from models import Budget, ModelFailed


def good(agent: str, payload: dict) -> dict:
    """A well-behaved model: admits, explains without numbers, writes the template wording, passes every line."""
    if agent == "spotter":
        return {"decision": "admit", "reason": "worth a line"}
    if agent == "analyst":
        return {"interpretation": "A spell of pressure from the team in this phase.",
                "key_facts": [f["key"] for f in payload["moment"]["facts"]]}
    if agent in ("narrator", "recap_writer"):
        return {"lines": [_written(payload, r["id"]) for r in payload.get("lines") or payload.get("rewrite")]}
    if agent == "fact_checker":
        return {"pass": True, "interpretation_supported": True,
                "lines": [{"id": ln["id"], "pass": True, "reasons": []} for ln in payload["lines"]]}
    if agent == "translator":
        return {"pass": True, "lines": [{"id": ln["id"], "pass": True, "reasons": []} for ln in payload["lines"]]}
    raise AssertionError(agent)


def _written(payload: dict, line_id: str) -> dict:
    moment = payload["_moment"]
    if moment["evidence"]["trigger"] == "recap":
        from recap_writer import recap_template
        t = recap_template(moment, line_id)
    else:
        t = template_line(moment, line_id)
    return {"id": line_id, "text": t["text"], "claims": t["claims"]}


class ScriptedModels:
    """Stands in for models.Models: `script(agent, payload)` returns the reply dict or raises ModelFailed."""

    def __init__(self, settings: Settings | None = None, script=good):
        self.settings = settings or Settings(provider="local", local_base_url="http://localhost:1",
                                             local_model="fake")
        self.script = script
        self.gate = SimpleNamespace(budget=Budget.from_settings(self.settings))
        self.calls: list[tuple[str, dict]] = []
        self.moment: dict | None = None

    @property
    def on(self) -> bool:
        return True

    async def ask(self, name, instructions, payload, schema, *, match_id, moment_id, deadline_utc):
        assert instructions, "every call carries its prompt file"
        self.calls.append((name, payload))
        reply = self.script(name, {**payload, "_moment": self.moment})
        if isinstance(reply, Exception):
            raise reply
        try:
            return schema.model_validate(reply)
        except ValueError as e:
            raise ModelFailed("invalid_output") from e


def fail(reason="timeout"):
    return ModelFailed(reason)


class FakeContext:
    """The MCP server's replies for one moment, built from its own context; `replies` overrides per tool."""

    def __init__(self, moment: dict, replies: dict | None = None, opened: list | None = None):
        self.moment, self.replies = moment, replies or {}
        self.called: list[str] = []
        if opened is not None:
            opened.append(self)

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return None

    async def call(self, tool, **args):
        from context import ContextRejected, ContextUnavailable
        self.called.append(tool)
        ident = {k: self.moment[k] for k in ("match_id", "moment_id", "evidence_version")}
        reply = self.replies.get(tool)
        if isinstance(reply, Exception):
            raise reply
        if reply == "denied":
            raise ContextRejected(f"{tool}:outside_scope")
        if reply == "unavailable":
            raise ContextUnavailable(f"{tool}:source_not_ready")
        if tool == "get_match_state":
            return {"status": "ok", **ident, "state": copy.deepcopy(reply or self.moment["context"])}
        return {"status": "ok", **ident, "tool": tool, "after_moment": reply == "after_moment",
                "as_of": {"event_seq": 1, "match_ms": 1}, "data": {"shots": 10, "note": tool}}
