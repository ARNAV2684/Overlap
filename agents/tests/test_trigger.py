"""The moment trigger (functions/moment_trigger.py): moments only, each once, and the store it opens is closed."""
import asyncio
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
