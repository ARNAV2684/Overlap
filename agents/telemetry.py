# telemetry.py — Traces of the insight workflow
#
# Purpose: turn on Agent Framework's OpenTelemetry (agent_framework.observability) and export it to Application
#          Insights; one span per job, per agent stage, per model call and per MCP tool call, with match, moment and
#          agent attributes
# Inputs:  Settings.tracing (OVERLAP_TRACING: off | console | azure); APPLICATIONINSIGHTS_CONNECTION_STRING for azure
# Outputs: spans and Agent Framework's gen_ai metrics; nothing when tracing is off (the default)
# Spec:    agents/specs/observability.md
#
# Spans carry ids, names, statuses, counts and durations only: never a prompt, a payload, a reply or a line's text.
# Agent Framework's own sensitive capture (message content, instructions, tool arguments) is forced off, whatever
# ENABLE_SENSITIVE_DATA says. A tracing failure never stops a card: setup errors are logged and tracing stays off.

from __future__ import annotations

import contextlib
import logging
import os
import threading
from collections.abc import Iterator, Mapping
from typing import Any

from opentelemetry import trace
from opentelemetry.trace import Span, Status, StatusCode

from config import Settings

SERVICE_NAME = "overlap-agents"
TRACER_NAME = "overlap.agents"
CONNECTION_ENV = "APPLICATIONINSIGHTS_CONNECTION_STRING"

log = logging.getLogger("agents.telemetry")
_lock = threading.Lock()
_configured: str | None = None                       # the exporter set up in this process, once


def configure(settings: Settings, env: Mapping[str, str] | None = None, *, exporters: list | None = None) -> str:
    """Set up the exporters once per process; returns what is on (`off`, `console`, `azure`). `exporters` replaces
    the Application Insights ones (tests pass in-memory exporters)."""
    global _configured
    env = os.environ if env is None else env
    with _lock:
        if _configured is not None:
            return _configured
        if settings.tracing == "off":
            _configured = "off"
            return _configured
        try:
            _configured = _setup(settings.tracing, env, exporters)
        except Exception as e:  # noqa: BLE001 — never let tracing take the agents down
            log.warning("tracing stays off: %s", type(e).__name__)
            _configured = "off"
        return _configured


def _setup(kind: str, env: Mapping[str, str], exporters: list | None) -> str:
    from agent_framework.observability import configure_otel_providers
    if exporters is None and kind == "azure":
        connection = env.get(CONNECTION_ENV, "").strip()
        if not connection:
            log.warning("tracing stays off: %s is not set", CONNECTION_ENV)
            return "off"
        from azure.monitor.opentelemetry.exporter import AzureMonitorMetricExporter, AzureMonitorTraceExporter
        exporters = [AzureMonitorTraceExporter(connection_string=connection),
                     AzureMonitorMetricExporter(connection_string=connection)]
    configure_otel_providers(service_name=SERVICE_NAME, exporters=exporters or [],
                             enable_console_exporters=kind == "console" and exporters is None,
                             enable_sensitive_data=False, enable_message_events=False)
    log.info("tracing on: %s", kind)
    return kind


def reset_for_tests() -> None:
    global _configured
    with _lock:
        _configured = None


def tracer() -> trace.Tracer:
    from agent_framework.observability import get_tracer
    return get_tracer(TRACER_NAME)


def _ids(moment: Mapping[str, Any]) -> dict[str, Any]:
    evidence = moment.get("evidence") or {}
    return {"overlap.match_id": moment.get("match_id", ""), "overlap.moment_id": moment.get("moment_id", ""),
            "overlap.trigger": evidence.get("trigger", "")}


def _set(span: Span, attributes: Mapping[str, Any]) -> None:
    for k, v in attributes.items():
        if v is not None:
            span.set_attribute(k, v)


@contextlib.contextmanager
def job_span(moment: Mapping[str, Any], order: tuple[str, ...]) -> Iterator[Span]:
    """The whole job for one moment (or the recap): its stages are children, so one trace per card."""
    with tracer().start_as_current_span(f"overlap.job {moment.get('moment_id', '')}") as span:
        _set(span, {**_ids(moment), "overlap.stages": len(order), "overlap.workflow": order[0]})
        yield span


def job_result(span: Span, result: Mapping[str, Any]) -> None:
    _set(span, {"overlap.status": result.get("status"), "overlap.reason": _short(result.get("reason")),
                "overlap.verified": result.get("verified"), "overlap.fallback": result.get("fallback"),
                "overlap.audiences": result.get("audiences")})


@contextlib.contextmanager
def stage_span(moment: Mapping[str, Any], agent: str, *, reused: bool) -> Iterator[Span]:
    """One agent stage. `reused`: the saved output of a resumed job, so nothing ran."""
    with tracer().start_as_current_span(f"overlap.stage {agent}") as span:
        _set(span, {**_ids(moment), "overlap.agent": agent, "overlap.stage.reused": reused})
        yield span


def stage_result(span: Span, output: Mapping[str, Any]) -> None:
    """What a stage decided, as ids, flags and counts."""
    calls = output.get("calls") or []
    status = output.get("status")
    lines = output.get("lines")
    _set(span, {
        "overlap.terminal": output.get("terminal"), "overlap.reason": _short(output.get("reason")),
        "overlap.decision": _short(output.get("decision")), "overlap.model": output.get("model"),
        "overlap.context": output.get("context"), "overlap.verified": output.get("verified"),
        "overlap.model_calls": len(calls), "overlap.model_calls_ok": sum(1 for c in calls if c.get("ok")),
        "overlap.lines": len(lines) if isinstance(lines, list) else None,
        "overlap.lines_fallback": sum(1 for s in status.values() if isinstance(s, dict) and s.get("fallback"))
        if isinstance(status, dict) else None,
        "overlap.rewrite_rounds": len(output["rounds"]) if isinstance(output.get("rounds"), list) else None,
        "overlap.dropped": len(output["dropped"]) if isinstance(output.get("dropped"), list) else None,
        "overlap.tools": len(output["tools"]) if isinstance(output.get("tools"), list) else None,
    })


@contextlib.contextmanager
def model_span(moment: Mapping[str, Any], agent: str, prompt: str, model: str) -> Iterator[Span]:
    """One structured model call. Agent Framework's own invoke_agent and chat spans (tokens, model, duration) are
    its children; the outcome is set with `model_result`."""
    with tracer().start_as_current_span(f"overlap.model_call {agent}") as span:
        _set(span, {**_ids(moment), "overlap.agent": agent, "overlap.prompt_version": prompt,
                    "gen_ai.request.model": model})
        yield span


def model_result(span: Span, ok: bool, reason: str | None = None) -> None:
    _set(span, {"overlap.ok": ok, "overlap.reason": reason})
    if not ok:
        span.set_status(Status(StatusCode.ERROR, reason or "failed"))


class TracedContext:
    """Wraps an MCP context (`call(tool, **args)`): one span per tool call with the tool name and its outcome. The
    arguments are ids (player or team) and are recorded; the reply's data is not."""

    def __init__(self, inner: Any, moment: Mapping[str, Any]):
        self.inner, self.moment = inner, moment

    async def call(self, tool: str, **args: Any) -> Any:
        with tracer().start_as_current_span(f"overlap.tool_call {tool}") as span:
            _set(span, {**_ids(self.moment), "overlap.agent": "analyst", "gen_ai.tool.name": tool,
                        "overlap.tool.args": ",".join(f"{k}={v}" for k, v in sorted(args.items())) or None})
            try:
                reply = await self.inner.call(tool, **args)
            except Exception as e:
                _set(span, {"overlap.tool.status": type(e).__name__, "overlap.reason": _short(str(e))})
                span.set_status(Status(StatusCode.ERROR, type(e).__name__))
                raise
            after = isinstance(reply, dict) and bool(reply.get("after_moment"))
            _set(span, {"overlap.tool.status": "after_moment" if after else "ok"})
            return reply


@contextlib.contextmanager
def safety_span(moment: Mapping[str, Any], line_id: str) -> Iterator[Span]:
    """One Content Safety screen of one line (the line's id, not its text)."""
    with tracer().start_as_current_span("overlap.content_safety") as span:
        _set(span, {**_ids(moment), "overlap.agent": "fact_checker", "overlap.line_id": line_id})
        yield span


def _short(value: Any) -> str | None:
    """Reasons and decisions are short codes (`timeout`, `merge_into:MO-…`, `mcp:get_live_state:…`); capped anyway."""
    return None if value is None else str(value)[:200]
