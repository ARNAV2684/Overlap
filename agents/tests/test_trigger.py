"""The moment trigger (functions/moment_trigger.py): moments only, each once, and the store it opens is closed."""
import asyncio
import os
import sys
from pathlib import Path

import pytest

import workflow as W
from config import Settings
from state import JobStore, MemoryStore
from translation import FakeTranslator

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "functions"))
import moment_trigger as T


def deps(store, clock):
    return W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=Settings(), translator=FakeTranslator())


def seed(store, moments):
    for i, m in enumerate(moments[:4]):
        asyncio.run(store.create({**m, "_ts": 100 + i}))


def test_poll_processes_each_moment_once(moments, clock):
    store = MemoryStore()
    seed(store, moments)
    d = deps(store, clock)
    assert asyncio.run(T.poll(d, "SYN-1017", once=True)) == {"delivery_pending": 4}
    written = len(store.docs)                          # 4 moments + 4 jobs + 4 outboxes
    assert written == 12
    # job and outbox records are in the same partition but never start a job; a second worker inside the
    # lease skips, and the same worker resumes at delivery without running the stages again
    other = W.Deps(**{**d.__dict__, "worker": "w2"})
    assert asyncio.run(T.poll(other, "SYN-1017", once=True)) == {"skipped": 4}
    assert asyncio.run(T.poll(d, "SYN-1017", once=True)) == {"delivery_pending": 4}
    assert len(store.docs) == written


def test_batch_ignores_documents_that_are_not_moments(moments, clock):
    store = MemoryStore()
    docs = [{"id": "state", "kind": "state", "match_id": "SYN-1017"}, "not a document", moments[0]]
    results = asyncio.run(T.handle_batch(docs, deps(store, clock)))
    assert [r["status"] for r in results] == ["delivery_pending"]


class ClosingStore(MemoryStore):
    closed = 0

    async def close(self):
        self.closed += 1


@pytest.mark.parametrize("fail", [False, True])
def test_batch_closes_the_store_it_opened(moments, clock, monkeypatch, fail):
    store = ClosingStore()
    monkeypatch.setattr(T, "make_deps", lambda: deps(store, clock))
    if fail:
        monkeypatch.setattr(W, "process_moment", _boom)
        with pytest.raises(RuntimeError):
            asyncio.run(T.handle_batch([moments[0]]))
    else:
        asyncio.run(T.handle_batch([moments[0]]))
    assert store.closed == 1


async def _boom(doc, deps):
    raise RuntimeError("crash")


def test_queue_keeps_the_newest_normal_moments_and_every_high_one(moments):
    normal = [m for m in moments if m["evidence"]["trigger"] in ("momentum_swing", "press_change")][:6]
    goal = next(m for m in moments if m["evidence"]["trigger"] == "goal")
    keep, drop = T.plan_batch([*normal, goal, {"kind": "insight_job"}], max_queued=2)
    assert [d["id"] for d in drop] == [m["id"] for m in normal[:3]]            # the oldest three normal ones
    assert {d["id"] for d in keep} == {m["id"] for m in normal[3:]} | {goal["id"]}


def test_overflow_is_closed_durably_and_never_runs(moments, clock):
    store = MemoryStore()
    normal = [m for m in moments if m["evidence"]["trigger"] in ("momentum_swing", "press_change")][:5]
    results = asyncio.run(T.handle_batch(normal, deps(store, clock)))
    status = {r["moment_id"]: r["status"] for r in results}
    assert [status[m["id"]] for m in normal[:2]] == ["suppressed", "suppressed"]
    first = asyncio.run(store.read("SYN-1017", f"job:{normal[0]['id']}"))[0]
    assert first["state"] == "suppressed" and first["terminal_reason"] == "queue_overflow"
    assert first["stage_outputs"] == {}
    assert asyncio.run(store.read("SYN-1017", f"outbox:{normal[0]['id']}")) is None
    again = asyncio.run(T.handle_batch(normal[:1], deps(store, clock)))          # a repeated notification
    assert again[0]["status"] == "skipped"


# --- Azure Functions: recap from the match_state feed, publisher timer --------------------------------------------

def final_state():
    path = Path(__file__).resolve().parents[2] / "mcp_server/tests/data/tools/match_state/SYN-1017/state.json"
    import json
    return {**json.loads(path.read_text(encoding="utf-8")), "phase": "full_time"}


def test_state_feed_runs_the_recap_once_at_full_time(moments, clock):
    store = MemoryStore()
    for m in moments:
        asyncio.run(store.create(m))
    d = deps(store, clock)
    live = {**final_state(), "phase": "live"}
    store.states["SYN-1017"] = live
    assert asyncio.run(T.handle_states([live, {"kind": "not a state"}], d)) == []
    store.states["SYN-1017"] = final_state()
    first = asyncio.run(T.handle_states([final_state()], d))
    assert [r["status"] for r in first] == ["delivery_pending"]
    again = asyncio.run(T.handle_states([final_state()], d))              # a repeated notification
    assert again[0]["status"] in ("skipped", "delivery_pending")
    assert len([k for k in store.docs if k[1].startswith("outbox:RC-")]) == 1


def test_matches_to_publish_are_pending_outboxes_and_recent_states():
    store = MemoryStore()
    asyncio.run(store.create({"id": "outbox:a", "match_id": "A", "kind": "insight_outbox", "state": "pending"}))
    asyncio.run(store.create({"id": "outbox:b", "match_id": "B", "kind": "insight_outbox", "state": "done"}))
    store.states = {"C": {"_ts": 50}, "D": {"_ts": 5}}
    assert asyncio.run(store.matches_to_publish(since_ts=10)) == ["A", "C"]


class Sender:
    def __init__(self):
        self.sent = []

    async def send(self, group, envelope):
        self.sent.append((group, envelope))


def test_publisher_pass_sends_each_card_once(moments, clock):
    from publisher import Publisher
    store = MemoryStore()
    card = next(m for m in moments if m["id"] == "MO-1017-0019")
    assert asyncio.run(W.process_moment(card, deps(store, clock)))["status"] == "delivery_pending"
    e = card["evidence"]
    store.states["SYN-1017"] = {"id": "state", "match_id": "SYN-1017", "phase": "live", "period": e["period"],
                                "clock": e["clock"], "source": {"event_seq": 1, "match_ms": e["match_ms"] + 1000}}
    sender = Sender()
    publisher = Publisher(store, MemoryStore(), sender, Settings())
    assert asyncio.run(T.publish_pass(publisher, since_ts=0))["sent"] > 0
    count = len(sender.sent)
    asyncio.run(T.publish_pass(publisher, since_ts=0))
    assert len(sender.sent) == count                                       # the outbox is done: nothing again


# --- the MCP server inside the Functions package -------------------------------------------------------------------

def test_mcp_runs_on_this_python_when_there_is_no_server_venv(tmp_path, monkeypatch):
    import context as C
    monkeypatch.setattr(C, "ROOT", tmp_path)
    s = Settings()
    assert C.mcp_python(s) == sys.executable
    monkeypatch.setenv("OVERLAP_COSMOS_ENDPOINT", "https://x.documents.azure.com:443/")
    monkeypatch.setenv("IDENTITY_ENDPOINT", "http://localhost:42356/msi/token")
    monkeypatch.setenv("UNRELATED_SECRET", "no")
    packages = tmp_path / ".python_packages"            # where the Functions build installs the packages
    packages.mkdir()
    worker = tmp_path.parent / "functions-worker-libs"   # the host's own libraries: outside the app, never passed
    worker.mkdir(exist_ok=True)
    monkeypatch.setattr(sys, "path", [str(worker), *sys.path, str(packages)])
    env = C.mcp_env(s, sys.executable)
    path = env["PYTHONPATH"].split(os.pathsep)
    assert path[0] == str(tmp_path) and str(packages) in path and str(worker) not in path
    assert env["IDENTITY_ENDPOINT"] and env["OVERLAP_COSMOS_ENDPOINT"] and "UNRELATED_SECRET" not in env
    assert "PYTHONPATH" not in C.mcp_env(s, "/elsewhere/python")


def test_a_change_feed_delivery_is_the_same_moment(moments, clock):
    """The Cosmos change feed adds _lsn (a new value on every delivery): the moment is still valid and the same
    source, so a repeated delivery is not a conflict."""
    store = MemoryStore()
    first = asyncio.run(T.handle_batch([{**moments[0], "_lsn": 11}], deps(store, clock)))
    assert first[0]["status"] == "delivery_pending"
    again = asyncio.run(T.handle_batch([{**moments[0], "_lsn": 12}], deps(store, clock)))
    assert again[0]["status"] != "conflict"
