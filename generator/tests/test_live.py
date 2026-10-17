# test_live.py — Live mode and recorded matches
#
# Purpose: check message order and timing, batching, retries and stopping, and recorded files
# Inputs:  a small hand-built match; a virtual clock; fake hubs (one that fails)
# Outputs: pass / fail
# Spec:    generator/specs/live-and-batch.md §1-§2

from __future__ import annotations

import asyncio

import pytest

import live
import recording
from state import MatchResult


def tiny_match() -> MatchResult:
    setup = {"match_id": "SYN-0099", "teams": {"home": {"team_id": "CAL"}, "away": {"team_id": "DTN"}}}
    events, frames = [], []
    seq = 0
    offset = 0
    for period in (1, 2):
        for t in range(0, 3000, 200):
            frames.append({"match_id": "SYN-0099", "period": period, "period_ms": t, "match_ms": offset + t})
        for t in (0, 1000, 2800):
            seq += 1
            events.append({"seq": seq, "event_id": f"SYN-0099-{seq:05d}", "type": "Pass" if t == 1000 else
                           ("PeriodStart" if t == 0 else "PeriodEnd"), "period": period, "match_ms": offset + t})
        offset += 3000
    return MatchResult(setup, events, frames, {"home": 0, "away": 0}, {}, {"score": {"home": 0, "away": 0}})


class VirtualClock:
    def __init__(self):
        self.now = 0.0

    def clock(self) -> float:
        return self.now

    async def sleep(self, s: float) -> None:
        self.now += s


class MemorySink:
    def __init__(self, clock: VirtualClock, fail_times: int = 0, always_fail: bool = False):
        self.clock, self.fail_times, self.always_fail = clock, fail_times, always_fail
        self.sent: list[tuple[float, str, live.Message]] = []

    async def start(self) -> None:
        return None

    async def send(self, match_id, hub, msgs) -> None:
        if self.always_fail or self.fail_times > 0:
            self.fail_times -= 1
            raise ConnectionError("hub unavailable")
        self.sent += [(self.clock.now, hub, m) for m in msgs]

    async def close(self) -> None:
        return None


def run(coro):
    return asyncio.run(coro)


def test_setup_first_then_events_in_seq_order():
    msgs = live.schedule(tiny_match(), speed=20)
    assert msgs[0].kind == "setup" and msgs[0].hub == live.EVENTS_HUB
    seqs = [m.seq for m in msgs if m.kind == "event"]
    assert seqs == sorted(seqs) == list(range(1, 7))
    assert {m.hub for m in msgs if m.kind == "tracking"} == {live.TRACKING_HUB}


def test_messages_leave_at_match_time_over_speed():
    vc = VirtualClock()
    sink = MemorySink(vc)
    result = tiny_match()
    sent = run(live.stream(result, [sink], 20, lead_in=1.0, clock=vc.clock, sleep=vc.sleep, log=lambda *_: None))
    assert sent == 1 + len(result.events) + len(result.frames)
    half = min(live.HALF_TIME_S / 20, live.HALF_TIME_CAP_S)
    for t, _, m in sink.sent:
        if m.kind == "setup":
            continue
        expected = 1.0 + m.body["match_ms"] / 1000 / 20 + (half if m.body["period"] == 2 else 0)
        assert expected - 1e-9 <= t <= expected + 0.2 + 1e-9, (m.kind, t, expected)   # never early


def test_same_window_messages_share_a_batch():
    groups = live.batches(live.schedule(tiny_match(), speed=1, lead_in=0))
    assert groups[0][1][0].kind == "setup" and len(groups[0][1]) == 1
    assert all(g[0] == g[1][-1].due_s and g[1][-1].due_s - g[1][0].due_s < 0.2 for g in groups)


def test_a_failing_hub_is_retried():
    vc = VirtualClock()
    sink = MemorySink(vc, fail_times=2)
    run(live.stream(tiny_match(), [sink], 20, lead_in=0, clock=vc.clock, sleep=vc.sleep, log=lambda *_: None))
    assert sink.sent[0][2].kind == "setup"


def test_a_hub_that_stays_down_stops_the_match_with_the_last_seq():
    vc = VirtualClock()
    good = MemorySink(vc)

    class FailsAfterSetup(MemorySink):
        async def send(self, match_id, hub, msgs):
            if any(m.kind == "event" and m.seq >= 3 for m in msgs):
                raise ConnectionError("hub unavailable")
            await super().send(match_id, hub, msgs)

    bad = FailsAfterSetup(vc)
    with pytest.raises(live.StreamError) as err:
        run(live.stream(tiny_match(), [bad], 1, lead_in=0, clock=vc.clock, sleep=vc.sleep, log=lambda *_: None))
    assert err.value.match_id == "SYN-0099" and err.value.last_seq == 2
    assert good.sent == []


def test_azure_needs_a_namespace(monkeypatch):
    monkeypatch.delenv(live.NAMESPACE_VAR, raising=False)
    sink = live.EventHubsSink("azure")
    with pytest.raises(RuntimeError, match=live.NAMESPACE_VAR):
        sink._client(live.EVENTS_HUB)


def test_recorded_files_round_trip(tmp_path):
    r = tiny_match()
    d = recording.save(r, tmp_path, world_version=2)
    assert sorted(p.name for p in d.iterdir()) == ["events.ndjson", "setup.json", "summary.json",
                                                   "tracking.ndjson.gz"]
    back = recording.load(d)
    assert back.events == r.events and back.frames == r.frames and back.setup == r.setup
    assert back.summary["world_version"] == 2
