# workflow.py — The insight workflow for one moment (and the recap at full time)
#
# Purpose: claim the job, run the agents on Microsoft Agent Framework (spotter → analyst → narrator → fact-checker →
#          translator → director for a moment; recap writer → fact-checker → translator → director at full time),
#          save each stage's output on the job, write the outbox
# Inputs:  a moment document (or a match's final state); Deps (stores, settings, translator, models, MCP context)
# Outputs: job, outbox documents; a result {status, ...} for the caller
# Spec:    agents/specs/workflow.md §1–§4; agents/specs/agents.md
#
# A stage's saved output is reused when a job resumes, so a crash never repeats a finished stage, and a job whose
# outbox is written never reruns at all. With no model every agent uses its labelled template, so the same chain
# runs with the provider off, over budget or past the deadline.

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any

from agent_framework import Executor, WorkflowBuilder, WorkflowContext, handler

import analyst
import director
import fact_checker
import narrator
import recap_writer
import spotter
import telemetry
import translator
from runtime import Deps, RunState, Stage, Stages
from state import LeaseLost, SourceConflict, Store, write_outbox
from validate import InvalidMoment, validate_moment

__all__ = ["AGENT_STAGES", "ORDER", "RECAP_ORDER", "TEMPLATE_STAGES", "Deps", "RunKey", "RunState", "Stages",
           "build_workflow", "process_moment", "process_recap", "suppress_moment"]

ORDER = ("spotter", "analyst", "narrator", "fact_checker", "translator", "director")
RECAP_ORDER = ("recap_writer", "fact_checker", "translator", "director")
PRIORITY = spotter.PRIORITY

AGENT_STAGES = Stages(spotter=spotter.run, analyst=analyst.run, narrator=narrator.run, fact_checker=fact_checker.run,
                      translator=translator.run, director=director.run)
TEMPLATE_STAGES = AGENT_STAGES          # with no model each agent takes its template path; kept as a name for tests


@dataclass(frozen=True)
class RunKey:
    """The workflow message: only a key into the runs in progress."""
    key: str


_RUNS: dict[str, RunState] = {}


class StageExecutor(Executor):
    """One agent stage. Reuses a saved output when the job resumes; otherwise runs and saves it. The last stage
    writes the outbox."""

    def __init__(self, name: str, last: bool):
        super().__init__(id=name)
        self.name, self.last = name, last

    @handler
    async def run(self, message: RunKey, ctx: WorkflowContext[RunKey, dict]) -> None:
        state = _RUNS[message.key]
        jobs, job = state.deps.jobs, state.job
        output = job.stage_outputs.get(self.name)
        with telemetry.stage_span(state.moment, self.name, reused=output is not None) as span:
            if output is None:
                state.calls = []
                output = await _stage(state, self.name)(state)
                if state.calls:
                    output = {**output, "calls": state.calls}
                await jobs.save_stage(job, self.name, output)
            telemetry.stage_result(span, output)
        if output.get("terminal"):
            await jobs.finish(job, output["terminal"], output.get("reason"))
            await ctx.yield_output({"status": output["terminal"], "reason": output.get("reason")})
            return
        if self.name == "spotter" and output.get("decision") != "admit":
            decision = output.get("decision", "")
            reason = decision if decision.startswith("merge_into:") else output.get("reason", "spotter")
            await jobs.finish(job, "suppressed", reason)
            await ctx.yield_output({"status": "suppressed", "reason": reason})
            return
        if self.last:
            intent = output["intent"]
            await write_outbox(state.deps.store, job, intent)
            await jobs.save(job, state="delivery_pending", publication_id=intent["overlay_id"])
            await ctx.yield_output({"status": "delivery_pending", "overlay_id": intent["overlay_id"],
                                    "audiences": len(intent["audiences"]), "verified": intent["verified"],
                                    "fallback": intent["fallback"]})
            return
        await ctx.send_message(message)


def _stage(state: RunState, name: str) -> Stage:
    if name == "recap_writer":
        return recap_writer.run
    return getattr(state.deps.stages or AGENT_STAGES, name)


def build_workflow(order: tuple[str, ...] = ORDER):
    steps = [StageExecutor(name, last=i == len(order) - 1) for i, name in enumerate(order)]
    return WorkflowBuilder(start_executor=steps[0], name="overlap-insight").add_chain(steps).build()


async def _run_job(moment: dict, deps: Deps, order: tuple[str, ...]) -> dict:
    try:
        job = await deps.jobs.claim(moment, deps.worker)
    except SourceConflict:
        return {"status": "conflict", "moment_id": moment["moment_id"]}
    if job is None:
        return {"status": "skipped", "moment_id": moment["moment_id"]}
    if job.doc["state"] == "delivery_pending":
        return {"status": "delivery_pending", "moment_id": moment["moment_id"], "resumed": True}
    key = f"{moment['moment_id']}:{uuid.uuid4().hex}"
    _RUNS[key] = RunState(moment, job, deps)
    with telemetry.job_span(moment, order) as span:
        try:
            result = await build_workflow(order).run(RunKey(key))
        except LeaseLost:
            telemetry.job_result(span, {"status": "lease_lost"})
            return {"status": "lease_lost", "moment_id": moment["moment_id"]}
        finally:
            _RUNS.pop(key, None)
        outputs = result.get_outputs()
        final = {**(outputs[-1] if outputs else {"status": "incomplete"}), "moment_id": moment["moment_id"]}
        telemetry.job_result(span, final)
    return final


async def process_moment(doc: dict, deps: Deps) -> dict:
    """The single entry point for a moment document (local poller and Azure change feed)."""
    try:
        moment = validate_moment(doc)
    except InvalidMoment as e:
        await _record_rejection(deps.store, doc, str(e))
        return {"status": "rejected", "moment_id": doc.get("id")}
    return await _run_job(moment, deps, ORDER)


async def suppress_moment(doc: dict, deps: Deps, reason: str) -> dict:
    """Close a moment without running it (queue overflow): claimed like any job, then finished `suppressed`, so a
    repeated notification later finds it finished. No stage, model call or outbox."""
    try:
        moment = validate_moment(doc)
    except InvalidMoment as e:
        await _record_rejection(deps.store, doc, str(e))
        return {"status": "rejected", "moment_id": doc.get("id")}
    try:
        job = await deps.jobs.claim(moment, deps.worker)
    except SourceConflict:
        return {"status": "conflict", "moment_id": moment["moment_id"]}
    if job is None or job.doc["state"] != "running" or job.stage_outputs:
        return {"status": "skipped", "moment_id": moment["moment_id"]}   # already done, or started: leave it be
    await deps.jobs.finish(job, "suppressed", reason)
    return {"status": "suppressed", "reason": reason, "moment_id": moment["moment_id"]}


async def process_recap(match_id: str, deps: Deps) -> dict:
    """The recap at full time: only once the final match_state says `full_time`; once per match."""
    state = await deps.store.match_state(match_id)
    if state is None or state.get("phase") != "full_time":
        return {"status": "not_full_time", "match_id": match_id}
    moments = sorted(await deps.store.moments(match_id), key=lambda m: m["id"])
    return await _run_job(recap_writer.recap_moment(state, moments), deps, RECAP_ORDER)


async def _record_rejection(store: Store, doc: Any, reason: str) -> None:
    """A durable rejection record when the document has usable ids; never a model call."""
    if not isinstance(doc, dict):
        return
    match_id, moment_id = doc.get("match_id"), doc.get("moment_id") or doc.get("id")
    if not (isinstance(match_id, str) and isinstance(moment_id, str)):
        return
    await store.create({"id": f"job:{moment_id}", "match_id": match_id, "kind": "insight_job",
                        "moment_id": moment_id, "state": "rejected", "terminal_reason": reason[:200]})
