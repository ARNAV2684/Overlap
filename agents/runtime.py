# runtime.py — What every agent stage works with
#
# Purpose: the run state of one job (moment, job, dependencies), the dependencies themselves, and the one helper
#          every agent uses for a model call (prompt file, deadline, audit of the call)
# Inputs:  set up by workflow.py for each job
# Outputs: —
# Spec:    agents/specs/workflow.md §1–§3; agents/specs/prompts.md §3 (prompt versions recorded per job)

from __future__ import annotations

import time
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from pydantic import BaseModel

import prompts
import telemetry
from config import Settings
from models import ModelFailed, Models
from state import Job, JobStore, Store
from translation import Translator


@dataclass
class RunState:
    """What the stages work with: the moment, its job and the dependencies. Kept out of the workflow messages,
    because Agent Framework copies messages between steps and stores and clients must not be copied."""
    moment: dict
    job: Job
    deps: Deps
    calls: list[dict] = field(default_factory=list)        # model calls of the current stage, for its audit

    @property
    def match_id(self) -> str:
        return self.moment["match_id"]

    @property
    def moment_id(self) -> str:
        return self.moment["moment_id"]

    def output(self, stage: str) -> dict:
        return self.job.stage_outputs[stage]

    async def ask(self, agent: str, payload: dict, schema: type[BaseModel]) -> Any:
        """One structured model call for `agent` with its prompt file; raises ModelFailed (the caller's template
        takes over). Every attempt is recorded with the prompt version and model."""
        entry = {"agent": agent, "prompt": prompts.version(agent), "model": self.deps.settings.model_name}
        started = time.perf_counter()
        with telemetry.model_span(self.moment, agent, entry["prompt"], entry["model"]) as span:
            try:
                result = await self.deps.models.ask(agent, prompts.instructions(agent), payload, schema,
                                                    match_id=self.match_id, moment_id=self.moment_id,
                                                    deadline_utc=self.job.doc["deadline_utc"])
            except ModelFailed as e:
                self.calls.append({**entry, "ok": False, "reason": e.reason,
                                   "duration_ms": round((time.perf_counter() - started) * 1000, 3)})
                telemetry.model_result(span, False, e.reason)
                raise
            self.calls.append({**entry, "ok": True, "duration_ms": round((time.perf_counter() - started) * 1000, 3)})
            telemetry.model_result(span, True)
        return result


Stage = Callable[[RunState], Awaitable[dict]]
ContextFactory = Callable[[dict], Any]          # moment -> async context manager with `call(tool, **args)`


@dataclass
class Stages:
    spotter: Stage
    analyst: Stage
    narrator: Stage
    fact_checker: Stage
    translator: Stage
    director: Stage


@dataclass
class Deps:
    store: Store
    jobs: JobStore
    settings: Settings
    translator: Translator
    stages: Stages | None = None                 # None: the seven agents (workflow.AGENT_STAGES)
    worker: str = field(default_factory=lambda: f"worker-{uuid.uuid4().hex[:8]}")
    models: Models | None = None                 # None: no model (every step uses its template)
    context: ContextFactory | None = None        # None: no MCP context (the analyst adds no interpretation)
    safety: Any = None                           # None: no Content Safety screen (safety.ContentSafety when on)

    def __post_init__(self):
        if self.models is None:
            self.models = Models(self.settings)


def agent_deps(store: Store, settings: Settings, *, translator: Translator | None = None, clock=None) -> Deps:
    """The dependencies for a real run: durable budget in `store`, the chat client of the configured provider and
    the MCP context (both only when a model is on)."""
    import time

    from models import ModelGate, chat_client
    from state import DurableBudget
    from translation import translator as make_translator
    clock = clock or time.time
    telemetry.configure(settings)                # once per process; off unless OVERLAP_TRACING asks for it
    jobs = JobStore(store, deadline_s=settings.moment_deadline_s, clock=clock)
    models = Models(settings, clock=clock)
    context = None
    if settings.provider != "off":
        from context import mcp_context
        models = Models(settings, ModelGate(settings, DurableBudget.from_settings(store, settings)),
                        chat_client(settings), clock)
        context = mcp_context(settings)
    safety = None
    if settings.content_safety != "off":
        from safety import ContentSafety
        safety = ContentSafety.from_settings(settings)
    return Deps(store=store, jobs=jobs, settings=settings, translator=translator or make_translator(settings),
                models=models, context=context, safety=safety)
