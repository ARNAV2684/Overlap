"""Unit tests for the relay core with an in-memory store and sender (no emulators needed)."""

from __future__ import annotations

import copy
import json
import threading
import time

import pytest
import screen_relay as R

MATCH = "SYN-0007"


# --------------------------------------------------------------------------------------------- fakes


class MemoryStore:
    """Same contract as CosmosStore: conditional save, all or nothing."""

    def __init__(self):
        self.state: dict[str, dict] = {}
        self.version: dict[str, int] = {}
        self.envelopes: dict[str, dict[int, dict]] = {}
        self.latest_positions: dict[str, dict] = {}
        self.conflict_once = False

    def load(self, match_id):
        if match_id not in self.state:
            return None, None
        return copy.deepcopy(self.state[match_id]), self.version[match_id]

    def save(self, match_id, state, version, envelopes):
        if self.conflict_once:
            self.conflict_once = False
            return False
        if self.version.get(match_id) != version:
            return False
        seqs = [e["seq"] for e in envelopes if e["kind"] != "positions"]
        assert not set(seqs) & set(self.envelopes.get(match_id, {})), "envelope written twice"
        self.state[match_id] = copy.deepcopy(state)
        self.version[match_id] = (version or 0) + 1
        for e in envelopes:
            if e["kind"] == "positions":
                self.latest_positions[match_id] = e
            else:
                self.envelopes.setdefault(match_id, {})[e["seq"]] = e
        return True

    def matches_with_open_work(self):
        return [m for m, s in self.state.items() if s.get("open_work")]


class RecordingSender:
    def __init__(self, fail_times=0):
        self.sent: list[tuple[str, dict]] = []
        self.fail_times = fail_times

    def send(self, group, envelope):
        if self.fail_times:
            self.fail_times -= 1
            raise ConnectionError("stand-in down")
        self.sent.append((group, json.loads(json.dumps(envelope))))


class Clock:
    def __init__(self):
        self.t = 1000.0

    def __call__(self):
        return self.t


# --------------------------------------------------------------------------------------------- data


def player(team, n, pos):
    return {"player_id": f"{team}-{n:02d}", "name": f"P {team} {n}", "pos": pos, "shirt": n,
            "attr": {"pace": 70, "passing": 70, "dribbling": 70, "finishing": 70, "tackling": 70, "stamina": 70}}


def team(tid):
    lineup = [player(tid, 1, "GK")] + [player(tid, n, "CM") for n in range(2, 12)]
    return {"team_id": tid, "name": f"{tid} FC", "colours": {"primary": "#111111", "secondary": "#EEEEEE"},
            "formation": "4-3-3", "style": {"press_intensity": 0.5, "directness": 0.5, "width": 0.5},
            "lineup": lineup, "bench": [player(tid, 12, "GK")]}


SETUP = {"match_id": MATCH, "seed": 7, "competition": "Test", "season_id": "S1",
         "venue": {"name": "Ground", "city": "Town"}, "kickoff_utc": "2026-10-24T19:00:00Z", "storylines": [],
         "teams": {"home": team("AAA"), "away": team("BBB")}}


def event(seq, etype, ms, period=1, **extra):
    e = {"event_id": f"{MATCH}-{seq:05d}", "match_id": MATCH, "seq": seq, "possession_id": 1, "period": period,
         "period_ms": ms if period == 1 else ms - 2_700_000, "match_ms": ms,
         "clock": R.clock(period, ms if period == 1 else ms - 2_700_000), "type": etype}
    if etype not in ("PeriodStart", "PeriodEnd"):
        e.update({"team_id": "AAA", "player_id": "AAA-09", "x": 50.0, "y": 50.0})
    e.update(extra)
    return e


def frame(ms, period=1):
    return {"match_id": MATCH, "period": period, "period_ms": ms if period == 1 else ms - 2_700_000, "match_ms": ms,
            "ball": {"x": 50.0, "y": 50.0, "z": 0.0, "speed_kmh": 0.0},
            "players": [{"player_id": "AAA-09", "x": 40.0, "y": 50.0, "speed_kmh": 10.0, "dist_m": 1.0}]}


def msg(kind, body, hub=None):
    hub = hub or (R.TRACKING_HUB if kind == "tracking" else R.EVENTS_HUB)
    return R.parse(hub, json.dumps(body), {"kind": kind, "match_id": MATCH})


@pytest.fixture
def relay():
    store, sender, clock = MemoryStore(), RecordingSender(), Clock()
    return R.Relay(store, sender, clock_fn=clock, sleep_fn=lambda s: None), store, sender, clock


def kinds(sender):
    return [(e["kind"], e["data"].get("type") or e["data"].get("phase")) for _, e in sender.sent]


# --------------------------------------------------------------------------------------------- tests


def test_setup_then_events_produce_numbered_envelopes(relay):
    r, _, sender, _ = relay
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0)),
              msg("event", event(2, "Pass", 2000, outcome="success", receiver_id="AAA-08"))])
    assert [e["seq"] for _, e in sender.sent] == [1, 2, 3, 4]
    assert kinds(sender) == [("status", "pre_match"), ("event", "PeriodStart"), ("status", "live"), ("event", "Pass")]
    assert sender.sent[0][1]["data"]["setup"] == SETUP
    assert all(g == f"match-{MATCH}" for g, _ in sender.sent)
    assert sender.sent[3][1]["data"] == event(2, "Pass", 2000, outcome="success", receiver_id="AAA-08")


def test_goal_updates_score_after_the_event(relay):
    r, _, sender, _ = relay
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0)),
              msg("event", event(2, "Shot", 60000, shot_outcome="goal", situation="open_play"))])
    goal_event, status = sender.sent[-2][1], sender.sent[-1][1]
    assert goal_event["kind"] == "event" and status["kind"] == "status"
    assert status["data"]["score"] == {"home": 1, "away": 0} and status["match_ms"] == 60000


def test_period_end_sets_half_and_full_time(relay):
    r, _, sender, _ = relay
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0)),
              msg("event", event(2, "PeriodEnd", 2_700_000)),
              msg("event", event(3, "PeriodStart", 2_700_200, period=2)),
              msg("event", event(4, "PeriodEnd", 5_500_000, period=2))])
    phases = [e["data"]["phase"] for _, e in sender.sent if e["kind"] == "status"]
    assert phases == ["pre_match", "live", "half_time", "live", "full_time"]


def test_frames_bundle_in_fives_and_split_on_period(relay):
    r, store, sender, clock = relay
    r.handle([msg("setup", SETUP)] + [msg("tracking", frame(ms)) for ms in range(0, 2400, 200)])
    bundles = [e for _, e in sender.sent if e["kind"] == "positions"]
    assert [len(b["data"]["frames"]) for b in bundles] == [5, 5]
    assert bundles[0]["match_ms"] == 800 and bundles[0]["clock"] == "0:00"
    assert store.state[MATCH]["open_work"] is True  # two frames still open
    clock.t += 0.3
    r.tick()
    assert [len(e["data"]["frames"]) for _, e in sender.sent if e["kind"] == "positions"] == [5, 5, 2]
    assert store.latest_positions[MATCH]["seq"] == sender.sent[-1][1]["seq"]


def test_period_change_flushes_partial_bundle(relay):
    r, _, sender, _ = relay
    r.handle([msg("setup", SETUP), msg("tracking", frame(0)), msg("tracking", frame(200)),
              msg("tracking", frame(2_700_000, period=2))])
    bundles = [e for _, e in sender.sent if e["kind"] == "positions"]
    assert len(bundles) == 1 and [f["period"] for f in bundles[0]["data"]["frames"]] == [1, 1]


def test_duplicates_are_dropped_and_conflicts_counted(relay):
    r, store, sender, _ = relay
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0))])
    sent_before = len(sender.sent)
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0)), msg("tracking", frame(0)),
              msg("tracking", frame(0))])
    changed = event(1, "PeriodStart", 0)
    changed["possession_id"] = 99
    r.handle([msg("event", changed)])
    counts = store.state[MATCH]["counts"]
    assert counts["duplicates"] == 3 and counts["conflicts"] == 1
    assert len(sender.sent) == sent_before  # the open frame is not sent yet; nothing else is new


def test_invalid_messages_are_skipped_and_counted(relay):
    r, store, sender, _ = relay
    bad = event(2, "Pass", 1000)
    bad["surprise"] = 1
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0)), msg("event", bad),
              msg("event", event(3, "Pass", 2000))])
    assert store.state[MATCH]["counts"]["invalid"] == 1
    assert store.state[MATCH]["counts"]["gaps"] == 1  # seq 2 never applied
    assert kinds(sender)[-1] == ("event", "Pass")


def test_messages_before_setup_are_held_then_released(relay):
    r, _, sender, _ = relay
    r.handle([msg("tracking", frame(ms)) for ms in range(0, 1000, 200)])
    assert sender.sent == []
    r.handle([msg("setup", SETUP)])
    assert kinds(sender)[0] == ("status", "pre_match")
    assert [len(e["data"]["frames"]) for _, e in sender.sent if e["kind"] == "positions"] == [5]


def test_held_messages_dropped_after_timeout(relay):
    r, store, sender, clock = relay
    r.handle([msg("tracking", frame(0))])
    clock.t += 11
    r.tick()
    assert store.state[MATCH]["held"] == [] and store.state[MATCH]["counts"]["invalid"] == 1
    assert sender.sent == []


def test_concurrent_save_reapplies_without_double_numbering(relay):
    r, store, sender, _ = relay
    r.handle([msg("setup", SETUP)])
    store.conflict_once = True
    r.handle([msg("event", event(1, "PeriodStart", 0))])
    assert [e["seq"] for _, e in sender.sent] == [1, 2, 3]


def test_numbering_continues_after_restart(relay):
    r, store, sender, clock = relay
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0))])
    restarted = R.Relay(store, sender, clock_fn=clock, sleep_fn=lambda s: None)  # new process, same store
    restarted.handle([msg("event", event(2, "Pass", 1000))])
    assert [e["seq"] for _, e in sender.sent] == [1, 2, 3, 4]


def test_send_failure_is_retried_and_envelope_kept(relay):
    _, store, _, clock = relay
    sender = RecordingSender(fail_times=2)
    r = R.Relay(store, sender, clock_fn=clock, sleep_fn=lambda s: None)
    r.handle([msg("setup", SETUP)])
    assert len(sender.sent) == 1 and store.envelopes[MATCH][1]["kind"] == "status"


def test_body_and_property_must_agree():
    r = R.Relay(MemoryStore(), RecordingSender(), sleep_fn=lambda s: None)
    m = R.parse(R.EVENTS_HUB, json.dumps(SETUP), {"kind": "setup", "match_id": "SYN-9999"})
    assert r.handle([m])["invalid"] == 1


def test_stats_panels_are_forwarded_in_order(relay):
    r, _, sender, _ = relay
    panel = {"match_id": MATCH, "match_ms": 60000, "clock": "1:00", "possession": {"home": 55, "away": 45}}
    r.handle([msg("setup", SETUP), msg("stats", panel), msg("stats", panel)])
    stats = [e for _, e in sender.sent if e["kind"] == "stats"]
    assert len(stats) == 1 and stats[0]["data"] == panel


def test_large_batches_are_saved_in_chunks(relay):
    r, store, sender, _ = relay
    msgs = [msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0))]
    msgs += [msg("event", event(s, "Pass", s * 100)) for s in range(2, 150)]
    r.handle(msgs)
    assert len(store.envelopes[MATCH]) == 2 + 149  # pre_match + live statuses + 149 events
    assert [e["seq"] for _, e in sender.sent] == list(range(1, 152))


def test_clock_matches_contract_examples():
    assert R.clock(1, 2_830_000) == "45+2:10"
    assert R.clock(2, 1_034_000) == "62:14"
    assert R.clock(2, 2_765_000) == "90+1:05"


def test_parallel_readers_send_in_seq_order():
    class SlowSender(RecordingSender):
        def send(self, group, envelope):
            time.sleep(0.001)  # widen the window in which sends could overlap
            super().send(group, envelope)

    store, sender = MemoryStore(), SlowSender()
    r = R.Relay(store, sender, sleep_fn=lambda s: None)
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0))])
    events = [msg("event", event(s, "Pass", s * 100)) for s in range(2, 120)]
    frames = [msg("tracking", frame(ms)) for ms in range(0, 120_000, 200)]
    threads = [threading.Thread(target=r.handle, args=([m],)) for m in events] +               [threading.Thread(target=r.handle, args=(frames[i:i + 20],)) for i in range(0, len(frames), 20)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    seqs = [e["seq"] for _, e in sender.sent]
    assert seqs == list(range(1, len(seqs) + 1))


def test_send_workers_keep_events_in_order_and_send_everything():
    class SlowSender(RecordingSender):
        def send(self, group, envelope):
            time.sleep(0.001)
            super().send(group, envelope)

    store, sender = MemoryStore(), SlowSender()
    r = R.Relay(store, sender, sleep_fn=lambda s: None, send_workers=4)
    events = [msg("event", event(s, "Pass", s * 1000)) for s in range(2, 40)]
    frames = [msg("tracking", frame(ms)) for ms in range(0, 40_000, 200)]
    r.handle([msg("setup", SETUP), msg("event", event(1, "PeriodStart", 0))])
    for i in range(0, len(frames), 20):
        r.handle(events[i // 20 * 4:i // 20 * 4 + 4] + frames[i:i + 20])
    seqs = sorted(e["seq"] for _, e in sender.sent)
    assert seqs == list(range(1, len(seqs) + 1))          # every envelope sent exactly once
    ordered = [e["seq"] for _, e in sender.sent if e["kind"] not in R.UNORDERED_KINDS]
    assert ordered == sorted(ordered)                     # events and status leave in seq order
    assert sum(e["kind"] == "positions" for _, e in sender.sent) == len(frames) // R.BUNDLE_SIZE
