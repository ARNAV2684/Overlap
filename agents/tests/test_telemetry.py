"""Tracing (agents/specs/observability.md §1–§2): off by default, Application Insights exporters when asked, one span
per job, stage, model call and tool call, and never a prompt, payload or line text. In-memory exporters only."""
import asyncio
import copy
import json

import pytest
from opentelemetry import trace
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import SimpleSpanProcessor
from opentelemetry.sdk.trace.export.in_memory_span_exporter import InMemorySpanExporter
from pydantic import BaseModel

import telemetry
import workflow as W
from config import Settings, SettingsError
from models import ModelGate, Models
from state import JobStore, MemoryStore
from tests.fakes import FakeContext, ScriptedModels
from translation import FakeTranslator

MODEL = Settings(provider="local", local_base_url="http://localhost:1", local_model="fake")


@pytest.fixture(autouse=True)
def fresh():
    telemetry.reset_for_tests()
    yield
    telemetry.reset_for_tests()


@pytest.fixture(scope="module")
def exporter():
    """One in-memory exporter on the process's tracer provider (OpenTelemetry allows setting it only once)."""
    memory = InMemorySpanExporter()
    provider = trace.get_tracer_provider()
    if not isinstance(provider, TracerProvider):
        provider = TracerProvider()
        trace.set_tracer_provider(provider)
    provider.add_span_processor(SimpleSpanProcessor(memory))
    return memory


@pytest.fixture
def spans(exporter):
    exporter.clear()
    yield exporter
    exporter.clear()


def capture(monkeypatch):
    """Record configure_otel_providers' arguments instead of setting up real providers."""
    import agent_framework.observability as obs
    seen: dict = {}
    monkeypatch.setattr(obs, "configure_otel_providers", lambda **kw: seen.update(kw))
    return seen


# --- setup -------------------------------------------------------------------------------------------------------

def test_tracing_is_off_by_default(monkeypatch):
    seen = capture(monkeypatch)
    assert Settings().tracing == "off"
    assert telemetry.configure(Settings(), {"APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=x"}) == "off"
    assert seen == {}                                    # nothing set up, nothing exported


def test_azure_exports_to_application_insights(monkeypatch):
    import azure.monitor.opentelemetry.exporter as exp
    made = []

    class Fake:
        def __init__(self, *, connection_string):
            made.append((type(self).__name__, connection_string))

    class FakeTrace(Fake):
        pass

    class FakeMetric(Fake):
        pass

    monkeypatch.setattr(exp, "AzureMonitorTraceExporter", FakeTrace)
    monkeypatch.setattr(exp, "AzureMonitorMetricExporter", FakeMetric)
    seen = capture(monkeypatch)
    env = {"APPLICATIONINSIGHTS_CONNECTION_STRING": "InstrumentationKey=abc;IngestionEndpoint=https://x/"}
    assert telemetry.configure(Settings(tracing="azure"), env) == "azure"
    assert made == [("FakeTrace", env["APPLICATIONINSIGHTS_CONNECTION_STRING"]),
                    ("FakeMetric", env["APPLICATIONINSIGHTS_CONNECTION_STRING"])]
    assert [type(e).__name__ for e in seen["exporters"]] == ["FakeTrace", "FakeMetric"]
    assert seen["enable_sensitive_data"] is False and seen["enable_message_events"] is False
    assert seen["enable_console_exporters"] is False and seen["service_name"] == "overlap-agents"
    assert telemetry.configure(Settings(tracing="azure"), env) == "azure"     # once per process
    assert len(made) == 2


def test_azure_without_a_connection_string_stays_off(monkeypatch):
    seen = capture(monkeypatch)
    assert telemetry.configure(Settings(tracing="azure"), {}) == "off"
    assert seen == {}


def test_console_tracing_for_local_debugging(monkeypatch):
    seen = capture(monkeypatch)
    assert telemetry.configure(Settings(tracing="console"), {}) == "console"
    assert seen["enable_console_exporters"] is True and seen["enable_sensitive_data"] is False


def test_a_setup_failure_never_stops_the_agents(monkeypatch):
    import agent_framework.observability as obs

    def broken(**kw):
        raise RuntimeError("exporter down")

    monkeypatch.setattr(obs, "configure_otel_providers", broken)
    assert telemetry.configure(Settings(tracing="console"), {}) == "off"


def test_tracing_setting_is_validated():
    assert Settings.from_env({"OVERLAP_TRACING": "azure"}).tracing == "azure"
    with pytest.raises(SettingsError, match="OVERLAP_TRACING"):
        Settings.from_env({"OVERLAP_TRACING": "jaeger"})


def test_sensitive_capture_stays_off_even_when_the_environment_asks(monkeypatch, spans):
    from agent_framework.observability import OBSERVABILITY_SETTINGS
    monkeypatch.setenv("ENABLE_SENSITIVE_DATA", "true")
    assert telemetry.configure(Settings(tracing="azure"), {}, exporters=[InMemorySpanExporter()]) == "azure"
    assert OBSERVABILITY_SETTINGS.SENSITIVE_DATA_ENABLED is False


# --- spans -------------------------------------------------------------------------------------------------------

class Out(BaseModel):
    text: str


def echo_client(reply: str):
    from agent_framework import BaseChatClient, ChatResponse, Message
    from agent_framework.observability import ChatTelemetryLayer

    class EchoClient(ChatTelemetryLayer, BaseChatClient):
        OTEL_PROVIDER_NAME = "fake"

        async def _inner_get_response(self, *, messages, stream, options, **kw):
            return ChatResponse(messages=[Message("assistant", [reply])], model="fake")

    return EchoClient()


def all_values(spans) -> str:
    return json.dumps([[s.name, dict(s.attributes or {}), [dict(e.attributes or {}) for e in s.events]]
                       for s in spans], ensure_ascii=False, default=str)


def test_agent_framework_spans_carry_no_prompt_or_reply(monkeypatch, spans):
    monkeypatch.setenv("ENABLE_SENSITIVE_DATA", "true")
    telemetry.configure(Settings(tracing="azure"), {}, exporters=[InMemorySpanExporter()])
    models = Models(MODEL, ModelGate(MODEL), echo_client('{"text": "REPLY-TEXT"}'))
    got = asyncio.run(models.ask("narrator", "INSTRUCTIONS-TEXT", {"facts": "PAYLOAD-TEXT"}, Out, match_id="SYN-1",
                                 moment_id="MO-1", deadline_utc=1e12))
    assert got.text == "REPLY-TEXT"
    found = spans.get_finished_spans()
    assert {s.name for s in found} >= {"invoke_agent narrator", "chat fake"}
    text = all_values(found)
    for secret in ("INSTRUCTIONS-TEXT", "PAYLOAD-TEXT", "REPLY-TEXT"):
        assert secret not in text


def by_id(moments, i):
    return copy.deepcopy(next(m for m in moments if m["id"] == i))


def run_moment(moment, clock, replies=None):
    store, models = MemoryStore(), ScriptedModels(MODEL)
    models.moment = moment
    deps = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=MODEL, translator=FakeTranslator(),
                  models=models, context=lambda m: FakeContext(m, replies))
    result = asyncio.run(W.process_moment(moment, deps))
    return store, models, result


def test_one_span_per_job_stage_model_call_and_tool_call(moments, clock, spans):
    moment = by_id(moments, "MO-1017-0013")
    store, models, result = run_moment(moment, clock)
    assert result["status"] == "delivery_pending"
    found = spans.get_finished_spans()
    ours = [s for s in found if s.name.startswith("overlap.")]
    for s in ours:
        assert s.attributes["overlap.match_id"] == "SYN-1017"
        assert s.attributes["overlap.moment_id"] == "MO-1017-0013"
        assert s.attributes["overlap.trigger"] == "shot_cluster"
    jobs = [s for s in ours if s.name.startswith("overlap.job")]
    assert len(jobs) == 1 and jobs[0].attributes["overlap.status"] == "delivery_pending"
    assert jobs[0].attributes["overlap.verified"] is True
    stages = [s.attributes["overlap.agent"] for s in ours if s.name.startswith("overlap.stage")]
    assert sorted(stages) == sorted(W.ORDER)
    calls = [s.attributes["overlap.agent"] for s in ours if s.name.startswith("overlap.model_call")]
    assert sorted(calls) == sorted(name for name, _ in models.calls)
    assert all(s.attributes["overlap.ok"] for s in ours if s.name.startswith("overlap.model_call"))
    tools = [s for s in ours if s.name.startswith("overlap.tool_call")]
    assert [s.attributes["gen_ai.tool.name"] for s in tools] == ["get_match_state", "get_live_state",
                                                                "compare_periods"]
    assert all(s.attributes["overlap.tool.status"] == "ok" for s in tools)
    job_ctx = jobs[0].context
    assert all(s.context.trace_id == job_ctx.trace_id for s in ours)          # one trace per card
    narrator = next(s for s in ours if s.name == "overlap.stage narrator")
    assert narrator.parent is not None and narrator.attributes["overlap.model_calls"] == 1
    # no line, prompt or payload text anywhere
    text = all_values(found)
    intent = asyncio.run(store.read("SYN-1017", "outbox:MO-1017-0013"))[0]["intent"]
    for a in intent["audiences"]:
        assert a["line"]["text"] not in text
    for fact in moment["evidence"]["facts"]:
        assert fact["label"] not in text


def test_failed_model_calls_and_tools_are_marked(moments, clock, spans):
    from models import ModelFailed
    moment = by_id(moments, "MO-1017-0013")
    store, models = MemoryStore(), ScriptedModels(MODEL, lambda agent, payload: ModelFailed("timeout"))
    models.moment = moment
    deps = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=MODEL, translator=FakeTranslator(),
                  models=models, context=lambda m: FakeContext(m, {"get_live_state": "unavailable"}))
    result = asyncio.run(W.process_moment(moment, deps))
    assert result["status"] == "delivery_pending" and result["fallback"] is True
    ours = [s for s in spans.get_finished_spans() if s.name.startswith("overlap.")]
    failed = [s for s in ours if s.name.startswith("overlap.model_call")]
    assert failed and all(s.attributes["overlap.ok"] is False and s.attributes["overlap.reason"] == "timeout"
                          for s in failed)
    assert all(s.status.status_code == trace.StatusCode.ERROR for s in failed)
    live = next(s for s in ours if s.name == "overlap.tool_call get_live_state")
    assert live.attributes["overlap.tool.status"] == "ContextUnavailable"
    job = next(s for s in ours if s.name.startswith("overlap.job"))
    assert job.attributes["overlap.fallback"] is True


def test_a_suppressed_moment_ends_its_trace_at_the_spotter(moments, clock, spans):
    moment = by_id(moments, "MO-1017-0013")
    store, models = MemoryStore(), ScriptedModels(MODEL, lambda agent, payload: {"decision": "suppress",
                                                                                 "reason": "routine"})
    models.moment = moment
    deps = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=MODEL, translator=FakeTranslator(),
                  models=models, context=lambda m: FakeContext(m))
    result = asyncio.run(W.process_moment(moment, deps))
    assert result["status"] == "suppressed"
    ours = [s for s in spans.get_finished_spans() if s.name.startswith("overlap.")]
    assert [s.attributes["overlap.agent"] for s in ours if s.name.startswith("overlap.stage")] == ["spotter"]
    job = next(s for s in ours if s.name.startswith("overlap.job"))
    assert job.attributes["overlap.status"] == "suppressed"
