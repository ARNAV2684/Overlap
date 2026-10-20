# workflow.py — The insight workflow for one moment
#
# Purpose: claim the moment's job, run the seven stages on Microsoft Agent Framework (spotter → analyst → narrator →
#          fact-checker → translator → director), save each stage's output on the job, write the outbox
# Inputs:  a moment document; Deps (stores, settings, translator, stage functions)
# Outputs: job, outbox documents; a result {status, ...} for the caller
# Spec:    agents/specs/workflow.md §1–§4; agents/specs/agents.md
#
# Stages are plain async functions, so the same workflow runs with model-backed agents (M4) or with the template
# stages below (provider off, budget spent, deadline passed). A stage's saved output is reused when a job resumes, so
# a crash never repeats a finished stage, and a job whose outbox is written never reruns at all.

from __future__ import annotations

import re
import uuid
from collections.abc import Awaitable, Callable
from dataclasses import dataclass, field
from typing import Any

from agent_framework import Executor, WorkflowBuilder, WorkflowContext, handler

from config import Settings
from fallbacks import fact_map, templates
from state import Job, JobStore, LeaseLost, SourceConflict, Store, write_outbox
from translation import TranslationError, Translator
from validate import InvalidMoment, validate_moment

ORDER = ("spotter", "analyst", "narrator", "fact_checker", "translator", "director")
PRIORITY = {"goal": "high", "red_card": "high", "penalty": "high"}         # everything else: normal
VISUAL = {"goal": "key_events", "big_chance": "key_events", "penalty": "key_events", "shot_cluster": "key_events",
          "momentum_swing": "momentum_tide", "press_change": "pressing_zones", "red_card": "key_events",
          "milestone": "key_events"}                                         # shot_map once the web app has it
NUMBER = re.compile(r"\d+(?:\.\d+)?")


@dataclass
class RunState:
    """What the stages work with: the moment, its job and the dependencies. Kept out of the workflow messages,
    because Agent Framework copies messages between steps and stores and clients must not be copied."""
    moment: dict
    job: Job
    deps: Deps


@dataclass(frozen=True)
class RunKey:
    """The workflow message: only a key into the runs in progress."""
    key: str


_RUNS: dict[str, RunState] = {}

Stage = Callable[[RunState], Awaitable[dict]]


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
    stages: Stages = field(default_factory=lambda: TEMPLATE_STAGES)
    worker: str = field(default_factory=lambda: f"worker-{uuid.uuid4().hex[:8]}")


# --- template stages (no model) -----------------------------------------------------------------------------------

async def spot_admit(run: RunState) -> dict:
    """Placeholder admission until the spotter agent (M4): admit, with the fixed priority."""
    trigger = run.moment["evidence"]["trigger"]
    return {"decision": "admit", "priority": PRIORITY.get(trigger, "normal"), "reason": "template"}


async def analyse_none(run: RunState) -> dict:
    return {"interpretation": None, "key_facts": [f["key"] for f in run.moment["evidence"]["facts"]]}


async def narrate_templates(run: RunState) -> dict:
    return {"lines": templates(run.moment, run.deps.settings.modes), "fallback": True}


def numeric_check(line: dict, moment: dict) -> list[str]:
    """Every number in the text is a claim, in order; every claim equals its stored fact (fact-checking.md §1)."""
    facts, problems = fact_map(moment), []
    numbers = [float(n) for n in NUMBER.findall(line["text"])]
    claims = line.get("claims", [])
    if len(numbers) != len(claims):
        problems.append("numbers_without_claims")
    for i, c in enumerate(claims):
        f = facts.get(c["key"])
        if f is None:
            problems.append(f"unknown_fact:{c['key']}")
        elif c["value"] != f["value"]:
            problems.append(f"wrong_value:{c['key']}")
        elif i < len(numbers) and numbers[i] != float(f["value"]):
            problems.append(f"text_differs:{c['key']}")
    return problems


async def check_numbers(run: RunState) -> dict:
    lines = run.job.stage_outputs["narrator"]["lines"]
    passed, rejected = [], []
    for line in lines:
        problems = numeric_check(line, run.moment)
        (rejected if problems else passed).append({**line, "problems": problems} if problems else line)
    return {"lines": passed, "rejected": rejected, "verified": False}


async def translate_lines(run: RunState) -> dict:
    lines = run.job.stage_outputs["fact_checker"]["lines"]
    out, failed = list(lines), []
    for lang in [lang for lang in run.deps.settings.languages if lang != "en"]:
        try:
            texts = await run.deps.translator.translate([ln["text"] for ln in lines], lang)
        except TranslationError:
            failed.append(lang)
            continue
        out += [{**ln, "lang": lang, "text": t} for ln, t in zip(lines, texts, strict=True)]
    return {"lines": out, "failed_languages": failed}


def groups_for(moment: dict, mode: str, lang: str) -> list[str]:
    match_id, e = moment["match_id"], moment["evidence"]
    if mode in ("casual", "analyst"):
        return [f"match-{match_id}-{mode}-{lang}"]
    if mode == "club":
        teams = [moment["context"]["teams"][s]["team_id"] for s in ("home", "away")]
        return [f"match-{match_id}-club-{t}-{lang}" for t in teams]
    if mode == "player":
        return [f"match-{match_id}-player-{p}-{lang}" for p in e["player_ids"]]
    return []


async def direct(run: RunState) -> dict:
    m, e = run.moment, run.moment["evidence"]
    lines = run.job.stage_outputs["translator"]["lines"]
    audiences = [{"mode": ln["mode"], "lang": ln["lang"], "group": g, "line": ln}
                 for ln in lines for g in groups_for(m, ln["mode"], ln["lang"])]
    highlight = {"team_id": e["team_id"]} if e["trigger"] == "momentum_swing" else \
        {"team_id": e["team_id"], "event_id": e["event_ids"][-1]}
    intent = {"overlay_id": "OV-" + m["moment_id"][3:], "moment_id": m["moment_id"], "trigger": e["trigger"],
              "priority": run.job.stage_outputs["spotter"]["priority"], "period": e["period"],
              "show_at_ms": e["match_ms"], "clock": e["clock"], "window": e["window"],
              "visual": {"component": VISUAL[e["trigger"]], "highlight": highlight},
              "fallback": run.job.stage_outputs["narrator"].get("fallback", True),
              "verified": run.job.stage_outputs["fact_checker"].get("verified", False),
              "audiences": audiences}
    return {"intent": intent}


TEMPLATE_STAGES = Stages(spotter=spot_admit, analyst=analyse_none, narrator=narrate_templates,
                         fact_checker=check_numbers, translator=translate_lines, director=direct)


# --- the Agent Framework workflow ---------------------------------------------------------------------------------

class StageExecutor(Executor):
    """One agent stage. Reuses a saved output when the job resumes; otherwise runs and saves it."""

    def __init__(self, name: str):
        super().__init__(id=name)
        self.name = name

    @handler
    async def run(self, message: RunKey, ctx: WorkflowContext[RunKey, dict]) -> None:
        state = _RUNS[message.key]
        jobs, job = state.deps.jobs, state.job
        output = job.stage_outputs.get(self.name)
        if output is None:
            output = await getattr(state.deps.stages, self.name)(state)
            await jobs.save_stage(job, self.name, output)
        if self.name == "spotter" and output.get("decision") != "admit":
            await jobs.finish(job, "suppressed", output.get("reason", "spotter"))
            await ctx.yield_output({"status": "suppressed", "reason": output.get("reason")})
            return
        if self.name == "director":
            intent = output["intent"]
            await write_outbox(state.deps.store, job, intent)
            await jobs.save(job, state="delivery_pending", publication_id=intent["overlay_id"])
            await ctx.yield_output({"status": "delivery_pending", "overlay_id": intent["overlay_id"],
                                    "audiences": len(intent["audiences"])})
            return
        await ctx.send_message(message)


def build_workflow():
    steps = [StageExecutor(name) for name in ORDER]
    return WorkflowBuilder(start_executor=steps[0], name="overlap-insight").add_chain(steps).build()


async def process_moment(doc: dict, deps: Deps) -> dict:
    """The single entry point for a moment document (local poller and Azure change feed)."""
    try:
        moment = validate_moment(doc)
    except InvalidMoment as e:
        await _record_rejection(deps.store, doc, str(e))
        return {"status": "rejected", "moment_id": doc.get("id")}
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
    try:
        result = await build_workflow().run(RunKey(key))
    except LeaseLost:
        return {"status": "lease_lost", "moment_id": moment["moment_id"]}
    finally:
        _RUNS.pop(key, None)
    outputs = result.get_outputs()
    return {**(outputs[-1] if outputs else {"status": "incomplete"}), "moment_id": moment["moment_id"]}


async def _record_rejection(store: Store, doc: Any, reason: str) -> None:
    """A durable rejection record when the document has usable ids; never a model call."""
    if not isinstance(doc, dict):
        return
    match_id, moment_id = doc.get("match_id"), doc.get("moment_id") or doc.get("id")
    if not (isinstance(match_id, str) and isinstance(moment_id, str)):
        return
    await store.create({"id": f"job:{moment_id}", "match_id": match_id, "kind": "insight_job",
                        "moment_id": moment_id, "state": "rejected", "terminal_reason": reason[:200]})
