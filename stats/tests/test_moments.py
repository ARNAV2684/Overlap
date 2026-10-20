# test_moments.py — Moment publishing tests
#
# Purpose: moments are written once with stable ids: a replay gives the same documents, an identical repeat is a
#          no-op, a different one stops the match; match_state follows each moment
# Inputs:  tests/fixtures/SYN-1017; in-memory stores
# Outputs: pass / fail
# Spec:    stats/specs/publishing.md §3

from __future__ import annotations

import copy
import json
from pathlib import Path

import pytest

import main
import publish

FIXTURE = Path(__file__).parent / "fixtures" / "SYN-1017"


def test_replaying_twice_gives_identical_moments():
    a = main.numbers_json(main.replay_moments(FIXTURE))
    b = main.numbers_json(main.replay_moments(FIXTURE))
    assert a == b
    ids = [m["id"] for m in json.loads(a)["SYN-1017"]]
    assert ids == [f"MO-1017-{n:04d}" for n in range(1, len(ids) + 1)]


def test_a_second_run_into_the_same_store_writes_nothing_new():
    store = publish.DictMomentStore()
    first = publish.Moments(store)
    main.replay_match(FIXTURE, moments=first)
    again = publish.Moments(store)                       # a restarted engine replaying the match
    main.replay_match(FIXTURE, moments=again)
    assert first.written["SYN-1017"] > 0 and again.written.get("SYN-1017", 0) == 0
    assert again.repeats["SYN-1017"] == first.written["SYN-1017"]


def test_a_different_document_under_the_same_id_is_a_conflict():
    store = publish.DictMomentStore()
    main.replay_match(FIXTURE, moments=publish.Moments(store))
    key, doc = next(iter(store.docs.items()))
    changed = copy.deepcopy(doc)
    changed["evidence"]["facts"][0]["value"] += 1
    with pytest.raises(publish.MomentConflict):
        store.create(changed)
    assert store.docs[key] == doc                        # the old document stays


def test_a_conflict_stops_that_match():
    store = publish.DictMomentStore()
    main.replay_match(FIXTURE, moments=publish.Moments(store))
    key = next(iter(store.docs))
    store.docs[key] = {**store.docs[key], "evidence": {}}  # as if an older engine wrote something else
    result = main.replay_match(FIXTURE, moments=publish.Moments(store))
    assert result["input"]["stopped"] and "already exists" in result["input"]["stopped"]


def test_match_state_follows_each_moment():
    states = publish.DictStore()
    moments = publish.Moments(publish.DictMomentStore(), states)
    main.replay_match(FIXTURE, moments=moments)
    events_with_moments = {d["source"]["event_seq"] for d in moments.store.docs.values()}
    assert states.writes == len(events_with_moments)    # one write per event that fired, however many moments
    doc = states.docs[("SYN-1017", "state")]
    assert doc["kind"] == "match_state"
