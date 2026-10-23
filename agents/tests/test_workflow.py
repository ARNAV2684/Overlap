"""Claim, lease, resume and recovery (agents/specs/workflow.md §2–§4), with an in-memory store and no model."""
import asyncio
import copy

import pytest

import workflow as W
from config import Settings
from models import BudgetExceeded, ModelGate
from state import DurableBudget, JobStore, LeaseLost, MemoryStore
from translation import FakeTranslator

SETTINGS = Settings()                                # provider off: template stages only


def deps(store, clock, worker="w1", stages=None):
    return W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=SETTINGS, translator=FakeTranslator(),
                  stages=stages or W.TEMPLATE_STAGES, worker=worker)


class Counting:
    """Template stages that count how often each runs."""

    def __init__(self, fail_at=None):
        self.calls = {n: 0 for n in W.ORDER}
        self.fail_at = fail_at

    def stages(self):
        def wrap(name):
            async def run(state):
                self.calls[name] += 1
                if name == self.fail_at:
                    raise RuntimeError("crash")
                return await getattr(W.TEMPLATE_STAGES, name)(state)
            return run
        return W.Stages(**{n: wrap(n) for n in W.ORDER})


def run(coro):
    return asyncio.run(coro)


def shot_cluster(moments):
    return next(m for m in moments if m["id"] == "MO-1017-0013")


def test_template_chain_writes_an_outbox_for_every_mode_and_language(moments, clock):
    store = MemoryStore()
    result = run(W.process_moment(shot_cluster(moments), deps(store, clock)))
    assert result["status"] == "delivery_pending" and result["overlay_id"] == "OV-1017-0013"
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert job["state"] == "delivery_pending" and set(job["stage_outputs"]) == set(W.ORDER)
    outbox, _ = run(store.read("SYN-1017", "outbox:MO-1017-0013"))
    intent = outbox["intent"]
    assert intent["fallback"] is True and intent["verified"] is False and intent["period"] == 2
    langs = {a["lang"] for a in intent["audiences"]}
    assert langs == {"en", "es", "hi", "fr"}
    groups = {a["group"] for a in intent["audiences"]}
    assert "match-SYN-1017-casual-en" in groups and "match-SYN-1017-club-ORR-hi" in groups
    assert "match-SYN-1017-player-KES-11-fr" in groups


def test_every_real_moment_runs_through(moments, clock):
    store = MemoryStore()
    results = [run(W.process_moment(m, deps(store, clock))) for m in moments]
    assert [r["status"] for r in results] == ["delivery_pending"] * len(moments)


def test_duplicate_notification_reuses_the_job(moments, clock):
    store, counting = MemoryStore(), Counting()
    d = deps(store, clock, stages=counting.stages())
    first = run(W.process_moment(shot_cluster(moments), d))
    again = run(W.process_moment(shot_cluster(moments), d))
    assert first["status"] == "delivery_pending" and again["status"] in ("skipped", "delivery_pending")
    assert all(n == 1 for n in counting.calls.values())


def test_crash_after_claim_resumes_from_the_saved_stage(moments, clock):
    store, counting = MemoryStore(), Counting(fail_at="narrator")
    with pytest.raises(RuntimeError):
        run(W.process_moment(shot_cluster(moments), deps(store, clock, "w1", counting.stages())))
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert set(job["stage_outputs"]) == {"spotter", "analyst"} and job["lease_owner"] == "w1"
    counting.fail_at = None
    blocked = run(W.process_moment(shot_cluster(moments), deps(store, clock, "w2", counting.stages())))
    assert blocked["status"] == "skipped"                          # w1's lease is still valid
    clock.t += 10                                                  # lease (6 s) expires
    resumed = run(W.process_moment(shot_cluster(moments), deps(store, clock, "w2", counting.stages())))
    assert resumed["status"] == "delivery_pending"
    assert counting.calls["spotter"] == 1 and counting.calls["analyst"] == 1   # not repeated
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert job["attempts"] == 2 and job["first_seen_utc"] == 1_000.0          # lifetime not reset


def test_crash_after_outbox_does_not_rerun_stages(moments, clock):
    store, counting = MemoryStore(), Counting()
    d = deps(store, clock, "w1", counting.stages())
    original_save = d.jobs.save

    async def save_then_crash(job, **changes):
        if changes.get("state") == "delivery_pending":
            raise RuntimeError("crash after outbox")
        return await original_save(job, **changes)
    d.jobs.save = save_then_crash
    with pytest.raises(RuntimeError):
        run(W.process_moment(shot_cluster(moments), d))
    assert run(store.read("SYN-1017", "outbox:MO-1017-0013")) is not None
    clock.t += 10
    resumed = run(W.process_moment(shot_cluster(moments), deps(store, clock, "w2", counting.stages())))
    assert resumed["status"] == "delivery_pending"
    assert all(n == 1 for n in counting.calls.values())                        # nothing ran twice


def test_conflicting_source_is_terminal_and_never_overwritten(moments, clock):
    store = MemoryStore()
    run(W.process_moment(shot_cluster(moments), deps(store, clock)))
    changed = copy.deepcopy(shot_cluster(moments))
    changed["evidence"]["clock"] = "65:35"
    assert run(W.process_moment(changed, deps(store, clock, "w2")))["status"] == "conflict"
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert job["state"] == "delivery_pending"


def test_job_without_source_hash_is_a_conflict_not_a_crash(moments, clock):
    # A job document left by an older schema has no source_hash; the poller must skip it, not stop
    store = MemoryStore()
    m = shot_cluster(moments)
    run(store.create({"id": f"job:{m['moment_id']}", "match_id": m["match_id"], "kind": "insight_job", "state": "pending"}))
    assert run(W.process_moment(m, deps(store, clock)))["status"] == "conflict"
    assert run(W.suppress_moment(m, deps(store, clock), "queue_overflow"))["status"] == "conflict"


def test_invalid_moment_is_rejected_without_running_stages(moments, clock):
    store, counting = MemoryStore(), Counting()
    bad = copy.deepcopy(shot_cluster(moments))
    bad["evidence"]["facts"][0]["value"] = 99
    result = run(W.process_moment(bad, deps(store, clock, stages=counting.stages())))
    assert result["status"] == "rejected" and all(n == 0 for n in counting.calls.values())
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert job["state"] == "rejected"


def test_lease_lost_stops_the_old_worker(moments, clock):
    store = MemoryStore()
    jobs = JobStore(store, clock=clock)
    old = run(jobs.claim(shot_cluster(moments), "w1"))
    clock.t += 10
    new = run(jobs.claim(shot_cluster(moments), "w2"))
    assert new is not None and new.doc["lease_generation"] == 2
    with pytest.raises(LeaseLost):
        run(jobs.save_stage(old, "spotter", {"decision": "admit"}))


def test_restart_past_the_deadline_keeps_the_original_deadline(moments, clock):
    store = MemoryStore()
    jobs = JobStore(store, clock=clock)
    job = run(jobs.claim(shot_cluster(moments), "w1"))
    deadline = job.doc["deadline_utc"]
    clock.t += 60
    assert jobs.past_deadline(job)
    again = run(jobs.claim(shot_cluster(moments), "w2"))
    assert again.doc["deadline_utc"] == deadline


def test_spotter_suppression_finishes_the_job(moments, clock):
    store = MemoryStore()

    async def suppress(state):
        return {"decision": "suppress", "reason": "budget", "priority": "normal"}
    stages = W.Stages(**{**{n: getattr(W.TEMPLATE_STAGES, n) for n in W.ORDER}, "spotter": suppress})
    result = run(W.process_moment(shot_cluster(moments), deps(store, clock, stages=stages)))
    assert result["status"] == "suppressed"
    job, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert job["state"] == "suppressed" and job["terminal_reason"] == "budget"
    assert run(store.read("SYN-1017", "outbox:MO-1017-0013")) is None


def test_durable_budget_refuses_and_survives_concurrent_writers():
    store = MemoryStore()
    budget = DurableBudget(store, max_calls_per_moment=2, max_calls_per_match=3, max_tokens_per_match=10_000,
                           reserve_tokens=1000)

    async def scenario():
        await asyncio.gather(budget.reserve("SYN-1017", "MO-1017-0001"), budget.reserve("SYN-1017", "MO-1017-0002"))
        r = await budget.reserve("SYN-1017", "MO-1017-0001")
        await budget.settle(r, 300)
        with pytest.raises(BudgetExceeded):
            await budget.reserve("SYN-1017", "MO-1017-0003")             # match limit of 3 calls
        doc, _ = await store.read("SYN-1017", "budget:SYN-1017")
        return doc
    doc = run(scenario())
    assert doc["calls"] == 3 and doc["tokens"] == 2300 and doc["calls_by_moment"]["MO-1017-0001"] == 2


def test_gate_uses_the_durable_budget():
    store = MemoryStore()
    s = Settings(provider="local", local_base_url="http://localhost:1/v1", local_model="m", max_calls_per_match=1)
    gate = ModelGate(s, DurableBudget.from_settings(store, s))

    class Agent:
        async def run(self, messages=None, **kw):
            class R:
                text = "ok"
                usage_details = None
            return R()
    run(gate.run(Agent(), "hi", match_id="SYN-1017", moment_id="MO-1017-0001"))
    with pytest.raises(BudgetExceeded):
        run(gate.run(Agent(), "hi", match_id="SYN-1017", moment_id="MO-1017-0002"))
