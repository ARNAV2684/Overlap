"""Readiness timings preserve failure evidence and never fabricate legacy latency."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

import runtime
import workflow as W
from evals.latency import job_timings
from models import ModelFailed
from runtime import RunState
from state import MemoryStore
from tests.test_workflow import Counting, deps, run, shot_cluster


@pytest.mark.parametrize("failed", [False, True])
def test_model_attempt_duration_on_success_and_failure(monkeypatch, failed):
    ticks = iter([10.0, 10.125])
    monkeypatch.setattr(runtime, "time", SimpleNamespace(perf_counter=lambda: next(ticks)))
    ask = AsyncMock(return_value={"ok": True})
    if failed:
        ask.side_effect = ModelFailed("timeout")
    state = RunState(moment={"match_id": "SYN-1", "moment_id": "MO-1"},
                     job=SimpleNamespace(doc={"deadline_utc": 100}),
                     deps=SimpleNamespace(settings=SimpleNamespace(model_name="test"),
                                          models=SimpleNamespace(ask=ask)))
    if failed:
        with pytest.raises(ModelFailed):
            asyncio.run(state.ask("narrator", {}, dict))
    else:
        assert asyncio.run(state.ask("narrator", {}, dict)) == {"ok": True}
    assert state.calls[0]["duration_ms"] == 125.0
    assert state.calls[0]["ok"] is not failed
    if failed:
        assert state.calls[0]["reason"] == "timeout"


def test_saved_stage_timing_is_reused(moments, clock, monkeypatch):
    ticks = iter(range(30))
    monkeypatch.setattr(W, "time", SimpleNamespace(perf_counter=lambda: next(ticks)))
    store, counting = MemoryStore(), Counting()
    d = deps(store, clock, stages=counting.stages())
    run(W.process_moment(shot_cluster(moments), d))
    before, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert all(o["duration_ms"] == 1000 for o in before["stage_outputs"].values())
    run(W.process_moment(shot_cluster(moments), d))
    after, _ = run(store.read("SYN-1017", "job:MO-1017-0013"))
    assert after["stage_outputs"] == before["stage_outputs"]
    assert all(n == 1 for n in counting.calls.values())


def test_summary_keeps_failed_attempts_and_skips_legacy_unknowns():
    report = job_timings([{"stage_outputs": {"narrator": {
        "duration_ms": 250, "calls": [
            {"agent": "narrator", "ok": True, "duration_ms": 100},
            {"agent": "narrator", "ok": False, "duration_ms": 150},
            {"agent": "narrator", "ok": True}]} }},
        {"stage_outputs": {"narrator": {}}},
        {"stage_outputs": {"analyst": {"duration_ms": float("nan")}}}])
    assert report["stages"]["narrator"] == {"n": 1, "p50": 250, "p95": 250, "max": 250}
    assert "analyst" not in report["stages"]
    assert report["model_attempts"]["narrator"]["failure"]["p95"] == 150
    assert report["model_attempts"]["narrator"]["success"]["n"] == 1
