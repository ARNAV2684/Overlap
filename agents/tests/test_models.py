"""Client factory and model gate, with no model or network calls. Spec: agents/specs/agents.md §8,
agents/specs/workflow.md §3."""
import asyncio
from types import SimpleNamespace

import pytest

from config import Settings
from models import Budget, BudgetExceeded, ModelDisabled, ModelGate, ModelTimeout, chat_client, used_tokens

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
