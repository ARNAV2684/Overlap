# models.py — Model client and gate
#
# Purpose: build the chat client for the configured provider, and run every model call through one gate that
#          enforces the budgets and the timeout
# Inputs:  Settings (config.py); an Agent Framework agent (anything with an async `run`)
# Outputs: the agent's response, or a clear error (ModelDisabled, BudgetExceeded, ModelTimeout)
# Spec:    agents/specs/agents.md §8; agents/specs/workflow.md §3
#
# One client class serves both providers: Agent Framework's OpenAIChatCompletionClient talks to Foundry Local
# through its OpenAI-compatible endpoint, and to Azure OpenAI in Foundry with a managed-identity credential. There is
# no silent fallback from one provider to another. `Budget` here is per process; `state.DurableBudget` keeps the
# per-match budget document in Cosmos with the same interface (async), and the gate accepts either.

from __future__ import annotations

import asyncio
import inspect
import json
import threading
import time
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any, Protocol

from pydantic import BaseModel, ValidationError

from config import Settings

LOCAL_API_KEY = "local-no-key"          # Foundry Local ignores the key; the OpenAI client requires a value


class ModelDisabled(RuntimeError):
    """Model calls are off (provider `off`), so the workflow must use its template."""


class BudgetExceeded(RuntimeError):
    """A per-moment or per-match limit would be passed by this call."""


class ModelTimeout(RuntimeError):
    """The call did not finish within its time limit."""


def chat_client(settings: Settings, *, credential: Any = None):
    """The Agent Framework chat client for the configured provider."""
    if settings.provider == "off":
        raise ModelDisabled("model calls are off (OVERLAP_MODEL_PROVIDER=off)")
    from agent_framework.openai import OpenAIChatCompletionClient
    if settings.provider == "local":
        return OpenAIChatCompletionClient(model=settings.local_model, base_url=settings.local_base_url,
                                          api_key=LOCAL_API_KEY)
    if credential is None:                                   # managed identity on Azure, az login locally
        from azure.identity.aio import DefaultAzureCredential
        credential = DefaultAzureCredential()
    return OpenAIChatCompletionClient(model=settings.azure_deployment, azure_endpoint=settings.azure_endpoint,
                                      credential=credential, api_version=settings.azure_api_version or None)


class RunsAgent(Protocol):
    async def run(self, messages: Any = None, **kwargs: Any) -> Any: ...


@dataclass
class Reservation:
    match_id: str
    moment_id: str
    tokens: int
    settled: bool = False


@dataclass
class Budget:
    """Calls and tokens per moment and per match. A reservation is made before each call; a call whose usage is
    unknown (timeout, error) keeps its full reservation, because the provider may still bill it."""
    max_calls_per_moment: int
    max_calls_per_match: int
    max_tokens_per_match: int
    reserve_tokens: int
    calls_by_moment: dict[tuple[str, str], int] = field(default_factory=dict)
    calls_by_match: dict[str, int] = field(default_factory=dict)
    tokens_by_match: dict[str, int] = field(default_factory=dict)
    model_jobs: dict[str, list[str]] = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    @classmethod
    def from_settings(cls, s: Settings) -> Budget:
        return cls(s.max_calls_per_moment, s.max_calls_per_match, s.max_tokens_per_match,
                   s.max_input_tokens + s.max_output_tokens)

    def reserve(self, match_id: str, moment_id: str) -> Reservation:
        with self._lock:
            key = (match_id, moment_id)
            if self.calls_by_moment.get(key, 0) >= self.max_calls_per_moment:
                raise BudgetExceeded(f"{moment_id}: {self.max_calls_per_moment} model calls already used")
            if self.calls_by_match.get(match_id, 0) >= self.max_calls_per_match:
                raise BudgetExceeded(f"{match_id}: {self.max_calls_per_match} model calls already used")
            if self.tokens_by_match.get(match_id, 0) + self.reserve_tokens > self.max_tokens_per_match:
                raise BudgetExceeded(f"{match_id}: token budget of {self.max_tokens_per_match} reached")
            self.calls_by_moment[key] = self.calls_by_moment.get(key, 0) + 1
            self.calls_by_match[match_id] = self.calls_by_match.get(match_id, 0) + 1
            self.tokens_by_match[match_id] = self.tokens_by_match.get(match_id, 0) + self.reserve_tokens
            return Reservation(match_id, moment_id, self.reserve_tokens)

    def claim_model_job(self, match_id: str, moment_id: str, *, high: bool, max_jobs: int, reserve: int) -> bool:
        with self._lock:
            jobs = self.model_jobs.setdefault(match_id, [])
            if moment_id not in jobs:
                if len(jobs) >= (max_jobs if high else max_jobs - reserve):
                    return False
                jobs.append(moment_id)
            return True

    def model_jobs_used(self, match_id: str) -> int:
        return len(self.model_jobs.get(match_id, []))

    def settle(self, r: Reservation, used_tokens: int | None) -> None:
        """Replace the reservation with the known usage; keep it when usage is unknown."""
        with self._lock:
            if r.settled:
                return
            r.settled = True
            if used_tokens is not None and 0 <= used_tokens:
                self.tokens_by_match[r.match_id] += used_tokens - r.tokens


def used_tokens(response: Any) -> int | None:
    """Total tokens from an Agent Framework response, when the provider reported them."""
    usage = getattr(response, "usage_details", None)
    if usage is None:
        return None
    total = usage.get("total_token_count") if isinstance(usage, dict) else getattr(usage, "total_token_count", None)
    return total if isinstance(total, int) else None


class ModelGate:
    """Every model call goes through here: provider check, budget reservation, timeout, usage."""

    def __init__(self, settings: Settings, budget: Any = None):
        self.settings = settings
        self.budget = budget or Budget.from_settings(settings)

    async def run(self, agent: RunsAgent, messages: Any, *, match_id: str, moment_id: str,
                  timeout_s: float | None = None, **kwargs: Any) -> Any:
        if self.settings.provider == "off":
            raise ModelDisabled("model calls are off (OVERLAP_MODEL_PROVIDER=off)")
        reservation = await _maybe(self.budget.reserve(match_id, moment_id))
        try:
            response = await asyncio.wait_for(agent.run(messages, **kwargs),
                                              timeout_s or self.settings.request_timeout_s)
        except TimeoutError as e:
            await _maybe(self.budget.settle(reservation, None))
            raise ModelTimeout(f"{moment_id}: model call timed out") from e
        except BaseException:
            await _maybe(self.budget.settle(reservation, None))
            raise
        await _maybe(self.budget.settle(reservation, used_tokens(response)))
        return response


async def _maybe(value: Any) -> Any:
    """Await a durable (async) budget call; pass an in-process one straight through."""
    return await value if inspect.isawaitable(value) else value


# --- structured calls (prompts.md §1) -----------------------------------------------------------------------------

class ModelFailed(RuntimeError):
    """A model step produced nothing usable; `reason` is a short code for the audit. The caller uses its template."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def parse_json(text: str | None) -> dict:
    """The JSON object in a reply. Tolerates a code fence around it (small local models add one); nothing else."""
    if not text:
        raise ValueError("empty reply")
    body = text.strip()
    if body.startswith("```"):
        body = body.split("\n", 1)[1] if "\n" in body else ""
        body = body.rsplit("```", 1)[0]
    start, end = body.find("{"), body.rfind("}")
    if start < 0 or end < start:
        raise ValueError("no JSON object")
    return json.loads(body[start:end + 1])           # starts with "{", so a JSON object or a decode error


def approx_tokens(text: str) -> int:
    return len(text) // 3 + 1                     # deliberately generous; no tokenizer dependency


@dataclass
class Breaker:
    """Pauses model calls after `limit` failures in a row (timeouts, provider errors), for `cooldown_s`; then lets
    one probe call through: success closes it, failure pauses again. A slow or failing model then costs each moment
    nothing instead of its whole deadline, so cards still go out (as templates) before they expire. A timeout counts
    only when the call had its full request timeout (`Models.ask`), not one shortened by the job's deadline."""
    limit: int
    cooldown_s: float
    failures: int = 0
    open_until: float = 0.0
    probing: bool = False

    def allow(self, now: float) -> bool:
        if not self.open_until:
            return True
        if now < self.open_until or self.probing:
            return False
        self.probing = True                              # one probe call after the pause
        return True

    def success(self) -> None:
        self.failures, self.open_until, self.probing = 0, 0.0, False

    def failure(self, now: float) -> None:
        self.failures += 1
        probe, self.probing = self.probing, False
        if probe or self.failures >= self.limit:
            self.open_until = now + self.cooldown_s


@dataclass
class Models:
    """Model access for the agents: the gate (budget, timeout) and the chat client, bounded by the job's deadline.
    With provider `off` or no client every call fails fast with reason `off`."""
    settings: Settings
    gate: ModelGate | None = None
    client: Any = None
    clock: Callable[[], float] = time.time
    breaker: Breaker | None = None

    def __post_init__(self):
        if self.breaker is None:
            self.breaker = Breaker(self.settings.model_breaker_failures, self.settings.model_breaker_cooldown_s)

    @property
    def on(self) -> bool:
        return self.settings.provider != "off" and self.gate is not None and self.client is not None

    async def close(self) -> None:
        """Close the provider's HTTP client (and its credential on Azure) before the event loop ends."""
        inner = getattr(self.client, "client", None)
        if inner is not None and hasattr(inner, "close"):
            await inner.close()

    async def ask(self, name: str, instructions: str, payload: dict, schema: type[BaseModel], *, match_id: str,
                  moment_id: str, deadline_utc: float) -> BaseModel:
        if not self.on:
            raise ModelFailed("off")
        timeout = min(self.settings.request_timeout_s, deadline_utc - self.clock() - FALLBACK_RESERVE_S)
        if timeout < MIN_CALL_S:
            raise ModelFailed("deadline")
        # A call cut short by the job's deadline says nothing about the model's health; only a call that had its full
        # request timeout counts towards the breaker when it times out
        full_timeout = timeout >= self.settings.request_timeout_s
        message = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
        if approx_tokens(instructions) + approx_tokens(message) > self.settings.max_input_tokens:
            raise ModelFailed("input_too_large")              # never truncate evidence silently
        from agent_framework import Agent
        # The recap writer writes every recap line in one call (and rewrites them in one): on SYN-3013 its rewrite
        # spent all 800 tokens on reasoning and returned nothing, so every recap line fell back to the template
        cap = self.settings.recap_max_output_tokens if name == "recap_writer" else self.settings.max_output_tokens
        options: dict[str, Any] = {"max_tokens": cap}
        if self.settings.provider == "azure":
            # The Azure model is a GPT-5 reasoning model: it rejects temperature, and the Agent Framework sends
            # max_tokens as max_completion_tokens (which also covers its reasoning tokens)
            options["response_format"] = schema            # structured outputs on Azure OpenAI
            options["reasoning_effort"] = self.settings.reasoning_effort
        else:
            options["temperature"] = 0.2
        agent = Agent(self.client, instructions, name=name)
        if not self.breaker.allow(self.clock()):
            raise ModelFailed("breaker_open")
        try:
            response = await self.gate.run(agent, message, match_id=match_id, moment_id=moment_id,
                                           timeout_s=timeout, options=options)
        except ModelDisabled as e:
            self.breaker.probing = False                 # not the model's health: release a probe, count nothing
            raise ModelFailed("off") from e
        except BudgetExceeded as e:
            self.breaker.probing = False
            raise ModelFailed("budget") from e
        except ModelTimeout as e:
            if full_timeout:
                self.breaker.failure(self.clock())
            else:
                self.breaker.probing = False             # release a probe, count nothing
            raise ModelFailed("timeout") from e
        except Exception as e:                          # provider, network or credential failure: template
            self.breaker.failure(self.clock())
            raise ModelFailed("provider_error") from e
        self.breaker.success()                          # the provider answered, whatever the answer was
        try:
            return schema.model_validate(parse_json(getattr(response, "text", None)))
        except (ValueError, ValidationError) as e:
            raise ModelFailed("invalid_output") from e


FALLBACK_RESERVE_S = 1.0                          # workflow.md §3: keep a second for the template path
MIN_CALL_S = 0.5
