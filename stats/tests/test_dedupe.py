# test_dedupe.py — Dedupe tests
#
# Purpose: check that repeated events never double-count, a gap holds processing and a conflict stops it
# Inputs:  small hand-made events
# Outputs: pass / fail
# Spec:    stats/specs/publishing.md (input); CONTRACTS.md §1.3

from __future__ import annotations

import pytest

from dedupe import ConflictError, Orderer


def ev(seq: int, **extra) -> dict:
    return {"event_id": f"SYN-0001-{seq:05d}", "match_id": "SYN-0001", "seq": seq, "type": "Pass", **extra}


def test_in_order_events_pass_straight_through():
    o = Orderer("SYN-0001")
    assert [e["seq"] for s in (1, 2, 3) for e in o.push(ev(s))] == [1, 2, 3]


def test_a_duplicate_is_dropped():
    o = Orderer("SYN-0001")
    o.push(ev(1))
    assert o.push(ev(1)) == [] and o.duplicates == 1
    assert [e["seq"] for e in o.push(ev(2))] == [2]


def test_a_gap_holds_later_events_until_it_fills():
    o = Orderer("SYN-0001")
    o.push(ev(1))
    assert o.push(ev(3)) == [] and o.push(ev(4)) == []
    assert o.gap == 2 and o.waiting == 2
    assert [e["seq"] for e in o.push(ev(2))] == [2, 3, 4]
    assert o.gap is None


def test_a_duplicate_of_a_held_event_is_dropped_too():
    o = Orderer("SYN-0001")
    o.push(ev(1))
    o.push(ev(3))
    assert o.push(ev(3)) == [] and o.duplicates == 1


@pytest.mark.parametrize("held", [False, True])
def test_a_different_body_for_the_same_seq_is_a_conflict(held):
    o = Orderer("SYN-0001")
    o.push(ev(1))
    if held:
        o.push(ev(3, x=10.0))
        with pytest.raises(ConflictError):
            o.push(ev(3, x=11.0))
    else:
        with pytest.raises(ConflictError):
            o.push(ev(1, x=5.0))
