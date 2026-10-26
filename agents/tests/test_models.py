"""Client factory and model gate, with no model or network calls. Spec: agents/specs/agents.md §8,
agents/specs/workflow.md §3."""
import asyncio
import json
from types import SimpleNamespace
from typing import ClassVar

import pytest
from pydantic import BaseModel

from config import Settings
from models import (
    Budget,
    BudgetExceeded,
    ModelDisabled,
    ModelFailed,
    ModelGate,
    Models,
    ModelTimeout,
    chat_client,
    used_tokens,
)

LOCAL = Settings(provider="local", local_base_url="http://localhost:5273/v1", local_model="small-model")
AZURE = Settings(provider="azure", azure_endpoint="https://example.openai.azure.com", azure_deployment="mini")


class FakeAgent:
    def __init__(self, delay=0.0, tokens=100, fail=None):
        self.delay, self.tokens, self.fail, self.calls = delay, tokens, fail, 0

    async def run(self, messages=None, **kwargs):
        self.calls += 1
        await asyncio.sleep(self.delay)
        if self.fail:
            raise self.fail

        return SimpleNamespace(text="ok", usage_details={"total_token_count": self.tokens})


def run(coro):
    return asyncio.run(coro)


def test_off_refuses_everything():
    with pytest.raises(ModelDisabled):
        chat_client(Settings())
    agent = FakeAgent()
    with pytest.raises(ModelDisabled):
        run(ModelGate(Settings()).run(agent, "hi", match_id="SYN-0001", moment_id="MO-0001-0001"))
    assert agent.calls == 0


def test_local_client_points_at_this_machine():
    client = chat_client(LOCAL)
    assert type(client).__name__ == "OpenAIChatCompletionClient"


def test_azure_client_uses_a_credential_not_a_key():
    class Credential:                       # stands in for managed identity; never asked for a token here
        async def get_token(self, *scopes, **kwargs):
            raise AssertionError("no network in unit tests")
    client = chat_client(AZURE, credential=Credential())
    assert type(client).__name__ == "OpenAIChatCompletionClient"


def test_gate_counts_calls_and_tokens():
    s = Settings(provider="local", local_base_url="http://localhost:1/v1", local_model="m",
                 max_calls_per_moment=2, max_calls_per_match=5)
    gate = ModelGate(s)
    agent = FakeAgent(tokens=150)
    for moment in ("MO-0001-0001", "MO-0001-0001", "MO-0001-0002"):
        run(gate.run(agent, "hi", match_id="SYN-0001", moment_id=moment))
    assert gate.budget.calls_by_match["SYN-0001"] == 3
    assert gate.budget.tokens_by_match["SYN-0001"] == 450            # reservations replaced by known usage
    with pytest.raises(BudgetExceeded, match="MO-0001-0001"):          # third call for one moment
        run(gate.run(agent, "hi", match_id="SYN-0001", moment_id="MO-0001-0001"))


def test_gate_refuses_past_the_match_budget():
    s = Settings(provider="local", local_base_url="http://localhost:1/v1", local_model="m",
                 max_calls_per_match=1)
    gate = ModelGate(s)
    run(gate.run(FakeAgent(), "hi", match_id="SYN-0001", moment_id="MO-0001-0001"))
    with pytest.raises(BudgetExceeded, match="SYN-0001"):
        run(gate.run(FakeAgent(), "hi", match_id="SYN-0001", moment_id="MO-0001-0002"))


def test_token_budget_reserves_before_the_call():
    budget = Budget(max_calls_per_moment=10, max_calls_per_match=10, max_tokens_per_match=5000, reserve_tokens=3800)
    budget.reserve("SYN-0001", "MO-0001-0001")
    with pytest.raises(BudgetExceeded, match="token"):
        budget.reserve("SYN-0001", "MO-0001-0002")


def test_timeout_keeps_the_reservation():
    s = Settings(provider="local", local_base_url="http://localhost:1/v1", local_model="m", request_timeout_s=0.05)
    gate = ModelGate(s)
    with pytest.raises(ModelTimeout):
        run(gate.run(FakeAgent(delay=1.0), "hi", match_id="SYN-0001", moment_id="MO-0001-0001"))
    assert gate.budget.tokens_by_match["SYN-0001"] == s.max_input_tokens + s.max_output_tokens


def test_error_keeps_the_reservation_and_reraises():
    gate = ModelGate(LOCAL)
    with pytest.raises(RuntimeError, match="boom"):
        run(gate.run(FakeAgent(fail=RuntimeError("boom")), "hi", match_id="SYN-0001", moment_id="MO-0001-0001"))
    assert gate.budget.tokens_by_match["SYN-0001"] == LOCAL.max_input_tokens + LOCAL.max_output_tokens


def test_used_tokens_reads_only_reported_totals():
    assert used_tokens(SimpleNamespace(usage_details={"total_token_count": 42})) == 42
    assert used_tokens(object()) is None


# --- structured calls (Models.ask) --------------------------------------------------------------------------------

class Reply:
    def __init__(self, text):
        self.text, self.usage_details = text, None


class ScriptedAgent:
    replies: ClassVar[list] = []
    seen: ClassVar[list] = []

    def __init__(self, client, instructions, name=None):
        self.instructions = instructions

    async def run(self, messages, **kwargs):
        ScriptedAgent.seen.append((messages, kwargs))
        return Reply(ScriptedAgent.replies.pop(0))


class Out(BaseModel):
    decision: str


def models_with(monkeypatch, *replies, provider="local", clock=lambda: 0.0):
    import agent_framework
    monkeypatch.setattr(agent_framework, "Agent", ScriptedAgent)
    ScriptedAgent.replies, ScriptedAgent.seen = list(replies), []
    s = Settings(provider=provider, local_base_url="http://localhost:1", local_model="m",
                 azure_endpoint="https://x.example", azure_deployment="d")
    return Models(s, ModelGate(s), client=object(), clock=clock)


def ask(m, deadline=100.0, payload=None):
    return asyncio.run(m.ask("spotter", "rules", payload or {"x": 1}, Out, match_id="M", moment_id="MO",
                             deadline_utc=deadline))



def test_the_recap_writer_gets_its_own_output_allowance(monkeypatch):
    # It writes (and rewrites) every recap line in one call; 800 tokens left nothing after gpt-5 reasoning (SYN-3013)
    m = models_with(monkeypatch, '{"decision": "a"}', '{"decision": "b"}')
    asyncio.run(m.ask("recap_writer", "rules", {"x": 1}, Out, match_id="M", moment_id="RC", deadline_utc=100.0))
    ask(m)
    assert ScriptedAgent.seen[0][1]["options"]["max_tokens"] == m.settings.recap_max_output_tokens == 2400
    assert ScriptedAgent.seen[1][1]["options"]["max_tokens"] == 800

def test_ask_parses_a_fenced_reply(monkeypatch):
    m = models_with(monkeypatch, '```json\n{"decision": "admit"}\n```')
    assert ask(m).decision == "admit"
    messages, kwargs = ScriptedAgent.seen[0]
    assert json.loads(messages) == {"x": 1} and "response_format" not in kwargs["options"]


def test_ask_uses_structured_outputs_on_azure(monkeypatch):
    m = models_with(monkeypatch, '{"decision": "admit"}', provider="azure")
    ask(m)
    assert ScriptedAgent.seen[0][1]["options"]["response_format"] is Out


def test_azure_call_suits_a_reasoning_model(monkeypatch):
    # GPT-5 models reject temperature; they take a reasoning effort and max completion tokens instead
    m = models_with(monkeypatch, '{"decision": "admit"}', provider="azure")
    ask(m)
    options = ScriptedAgent.seen[0][1]["options"]
    assert "temperature" not in options and options["reasoning_effort"] == "low" and options["max_tokens"] == 800


def test_local_call_keeps_a_low_temperature(monkeypatch):
    ask(m := models_with(monkeypatch, '{"decision": "admit"}'))
    assert ScriptedAgent.seen[0][1]["options"]["temperature"] == 0.2 and "reasoning_effort" not in ScriptedAgent.seen[0][1]["options"]
    assert m.settings.provider == "local"


@pytest.mark.parametrize("text", ["", "not json", '{"other": 1}', "[1, 2]"])
def test_ask_refuses_unusable_replies(monkeypatch, text):
    with pytest.raises(ModelFailed) as e:
        ask(models_with(monkeypatch, text))
    assert e.value.reason == "invalid_output"


def test_ask_respects_the_deadline_without_calling(monkeypatch):
    m = models_with(monkeypatch, '{"decision": "admit"}', clock=lambda: 99.0)
    with pytest.raises(ModelFailed) as e:
        ask(m, deadline=100.0)                       # one second left is the template's reserve
    assert e.value.reason == "deadline" and ScriptedAgent.seen == []


def test_ask_never_truncates_a_large_input(monkeypatch):
    with pytest.raises(ModelFailed) as e:
        ask(models_with(monkeypatch, '{"decision": "admit"}'), payload={"facts": "x" * 20_000})
    assert e.value.reason == "input_too_large" and ScriptedAgent.seen == []


def test_ask_is_off_without_a_provider():
    with pytest.raises(ModelFailed) as e:
        asyncio.run(Models(Settings()).ask("spotter", "r", {}, Out, match_id="M", moment_id="MO", deadline_utc=1e12))
    assert e.value.reason == "off"


def test_models_close_their_http_client():
    closed = []

    class Inner:
        async def close(self):
            closed.append(True)

    asyncio.run(Models(Settings(), client=SimpleNamespace(client=Inner())).close())
    asyncio.run(Models(Settings()).close())                    # no client: nothing to close
    assert closed == [True]


# --- the breaker ----------------------------------------------------------------------------------------------------

class Clock:
    def __init__(self):
        self.t = 0.0

    def __call__(self):
        return self.t


def test_breaker_pauses_after_failures_then_probes_once():
    from models import Breaker
    b, now = Breaker(limit=3, cooldown_s=60), 100.0
    for _ in range(2):
        assert b.allow(now)
        b.failure(now)
    assert b.allow(now)
    b.failure(now)                                         # third in a row: paused
    assert not b.allow(now + 59)
    assert b.allow(now + 61)                               # one probe
    assert not b.allow(now + 61)                           # and only one
    b.failure(now + 62)                                    # probe failed: paused again
    assert not b.allow(now + 100) and b.allow(now + 123)
    b.success()
    assert b.allow(now + 124) and b.failures == 0


class SlowAgent:
    calls = 0

    def __init__(self, client, instructions, name=None):
        pass

    async def run(self, messages, **kwargs):
        SlowAgent.calls += 1
        raise ConnectionError("model down")


def test_failing_model_trips_the_breaker_and_later_calls_skip_it(monkeypatch):
    import agent_framework
    monkeypatch.setattr(agent_framework, "Agent", SlowAgent)
    SlowAgent.calls = 0
    clock = Clock()
    s = Settings(provider="local", local_base_url="http://localhost:1", local_model="m", model_breaker_failures=2,
                 model_breaker_cooldown_s=30)
    m = Models(s, ModelGate(s), client=object(), clock=clock)
    reasons = []
    for _ in range(5):
        try:
            ask(m, deadline=1e9)
        except ModelFailed as e:
            reasons.append(e.reason)
    assert reasons == ["provider_error", "provider_error", "breaker_open", "breaker_open", "breaker_open"]
    assert SlowAgent.calls == 2                            # paused calls never reach the provider (or the budget)
    clock.t = 31
    with pytest.raises(ModelFailed) as e:
        ask(m, deadline=1e9)
    assert e.value.reason == "provider_error" and SlowAgent.calls == 3     # the probe


class SleepyAgent:
    calls = 0

    def __init__(self, client, instructions, name=None):
        pass

    async def run(self, messages, **kwargs):
        SleepyAgent.calls += 1
        await asyncio.sleep(5)                             # always longer than the call's timeout


def sleepy_models(monkeypatch, request_timeout_s):
    import agent_framework
    monkeypatch.setattr(agent_framework, "Agent", SleepyAgent)
    SleepyAgent.calls = 0
    s = Settings(provider="local", local_base_url="http://localhost:1", local_model="m", model_breaker_failures=1,
                 model_breaker_cooldown_s=30, request_timeout_s=request_timeout_s)
    return Models(s, ModelGate(s), client=object(), clock=Clock())


def test_a_timeout_cut_short_by_the_deadline_never_trips_the_breaker(monkeypatch):
    # The job's deadline leaves 0.6 s of a 4 s request timeout: the model was never given its full time
    m = sleepy_models(monkeypatch, request_timeout_s=4.0)
    reasons = []
    for _ in range(3):
        try:
            ask(m, deadline=1.6)
        except ModelFailed as e:
            reasons.append(e.reason)
    assert reasons == ["timeout", "timeout", "timeout"]
    assert SleepyAgent.calls == 3 and m.breaker.failures == 0 and not m.breaker.open_until


def test_a_full_length_timeout_still_trips_the_breaker(monkeypatch):
    m = sleepy_models(monkeypatch, request_timeout_s=0.6)
    reasons = []
    for _ in range(2):
        try:
            ask(m, deadline=1e9)
        except ModelFailed as e:
            reasons.append(e.reason)
    assert reasons == ["timeout", "breaker_open"]          # limit 1: the first full timeout pauses the model
    assert SleepyAgent.calls == 1


def test_a_probe_cut_short_by_the_deadline_is_released_not_counted(monkeypatch):
    m = sleepy_models(monkeypatch, request_timeout_s=4.0)
    m.breaker.failures, m.breaker.open_until = 1, 10.0     # paused earlier by a real failure
    m.clock.t = 11.0                                       # cooldown over: the next call is the probe
    with pytest.raises(ModelFailed) as e:
        ask(m, deadline=12.6)                              # 0.6 s left of 4 s
    assert e.value.reason == "timeout" and SleepyAgent.calls == 1
    assert not m.breaker.probing and m.breaker.failures == 1
    with pytest.raises(ModelFailed):
        ask(m, deadline=12.6)                              # the next call may probe again
    assert SleepyAgent.calls == 2
