"""The insights publisher (CONTRACTS.md §10.4, §10.6): save before send, seq per group, expiry, recovery, tags."""
import asyncio
import copy

import pytest

import workflow as W
from config import Settings
from publisher import Publisher, eligibility
from state import JobStore, MemoryStore
from translation import FakeTranslator

SETTINGS = Settings()


def run(coro):
    return asyncio.run(coro)


class Sender:
    def __init__(self, fail_groups=()):
        self.sent: list[tuple[str, dict]] = []
        self.fail_groups = set(fail_groups)

    async def send(self, group, envelope):
        if group in self.fail_groups:
            raise ConnectionError("stand-in down")
        self.sent.append((group, copy.deepcopy(envelope)))


def by_id(moments, i):
    return copy.deepcopy(next(m for m in moments if m["id"] == i))


def played(moments, clock, *ids):
    """Moments run through the agents (no model): outboxes in `store`."""
    store = MemoryStore()
    d = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=SETTINGS, translator=FakeTranslator())
    for i in ids:
        assert run(W.process_moment(by_id(moments, i), d))["status"] == "delivery_pending"
    return store


def state_at(moment, offset_ms=1000, **extra):
    e = moment["evidence"]
    return {"id": "state", "match_id": moment["match_id"], "phase": "live", "period": e["period"], "clock": e["clock"],
            "source": {"event_seq": 1, "match_ms": e["match_ms"] + offset_ms}, **extra}


CARD = "MO-1017-0019"


def test_eligibility_rules():
    m = {"period": 2, "show": 4_000_000}
    live = {"phase": "live", "period": 2, "source": {"match_ms": 4_000_000}}
    assert eligibility("overlay", m["period"], m["show"], live) == "live"
    assert eligibility("overlay", 2, m["show"], {**live, "source": {"match_ms": 4_300_000}}) == "live"
    assert eligibility("overlay", 2, m["show"], {**live, "source": {"match_ms": 4_300_001}}) == "late"
    assert eligibility("overlay", 2, m["show"], {**live, "source": {"match_ms": 3_999_000}}) == "early"
    assert eligibility("overlay", 1, m["show"], live) == "late"                        # a new half
    assert eligibility("overlay", 2, m["show"], {**live, "phase": "full_time"}) == "late"
    assert eligibility("overlay", 2, m["show"], None) == "unknown"
    assert eligibility("recap", 2, m["show"], live) == "early"
    assert eligibility("recap", 2, m["show"], {**live, "phase": "full_time"}) == "live"


def test_a_live_card_is_saved_then_sent_once_per_group(moments, clock):
    store, overlays, sender = played(moments, clock, CARD), MemoryStore(), Sender()
    store.states["SYN-1017"] = state_at(by_id(moments, CARD))
    pub = Publisher(store, overlays, sender, SETTINGS)
    totals = run(pub.run_once("SYN-1017"))
    intent = run(store.read("SYN-1017", f"outbox:{CARD}"))[0]["intent"]
    assert totals == {"sent": len(intent["audiences"])}
    groups = [g for g, _ in sender.sent]
    assert len(groups) == len(set(groups)) and all(env["seq"] == 1 for _, env in sender.sent)
    env = dict(sender.sent)["match-SYN-1017-casual-en"]
    assert set(env) == {"seq", "kind", "match_id", "match_ms", "clock", "data"} and env["kind"] == "overlay"
    assert env["match_ms"] == intent["show_at_ms"] and env["data"]["modes"]["casual"]["en"]
    assert run(store.read("SYN-1017", f"job:{CARD}"))[0]["state"] == "published"
    assert run(store.read("SYN-1017", f"outbox:{CARD}"))[0]["state"] == "done"
    assert run(pub.run_once("SYN-1017")) == {} and len(sender.sent) == len(groups)       # nothing twice


def test_seq_counts_up_per_group(moments, clock):
    store, overlays, sender = played(moments, clock, "MO-1017-0017", CARD), MemoryStore(), Sender()
    store.states["SYN-1017"] = state_at(by_id(moments, CARD))
    early = by_id(moments, "MO-1017-0017")
    assert by_id(moments, CARD)["evidence"]["match_ms"] - early["evidence"]["match_ms"] <= 300_000
    run(Publisher(store, overlays, sender, SETTINGS).run_once("SYN-1017"))
    casual = [env for g, env in sender.sent if g == "match-SYN-1017-casual-en"]
    assert [e["seq"] for e in casual] == [1, 2] and casual[0]["data"]["moment_id"] == "MO-1017-0017"
    assert run(overlays.read("SYN-1017", "counter:match-SYN-1017-casual-en"))[0]["last_seq"] == 2


def test_an_early_card_waits_and_an_unknown_playhead_sends_nothing(moments, clock):
    store, overlays, sender = played(moments, clock, CARD), MemoryStore(), Sender()
    pub = Publisher(store, overlays, sender, SETTINGS)
    assert run(pub.run_once("SYN-1017"))["pending"] > 0 and sender.sent == []          # no match_state yet
    store.states["SYN-1017"] = state_at(by_id(moments, CARD), offset_ms=-5000)
    assert run(pub.run_once("SYN-1017"))["pending"] > 0 and sender.sent == []
    assert run(overlays.of_kind("SYN-1017", "audience_delivery")) == []                # nothing numbered early
    store.states["SYN-1017"] = state_at(by_id(moments, CARD))
    assert "sent" in run(pub.run_once("SYN-1017"))


@pytest.mark.parametrize("state_change", [{"offset_ms": 300_001}, {"period": 3}, {"phase": "full_time"}])
def test_a_late_card_expires_without_a_number(moments, clock, state_change):
    store, overlays, sender = played(moments, clock, CARD), MemoryStore(), Sender()
    m = by_id(moments, CARD)
    offset = state_change.pop("offset_ms", 1000)
    store.states["SYN-1017"] = state_at(m, offset, **state_change)
    totals = run(Publisher(store, overlays, sender, SETTINGS).run_once("SYN-1017"))
    assert set(totals) == {"expired"} and sender.sent == []
    assert all(d["seq"] is None for d in run(overlays.of_kind("SYN-1017", "audience_delivery")))
    assert run(store.read("SYN-1017", f"job:{CARD}"))[0]["state"] == "expired"
    assert run(overlays.read("SYN-1017", "counter:match-SYN-1017-casual-en")) is None


def test_a_failed_send_is_retried_with_the_same_seq_and_envelope(moments, clock):
    store, overlays = played(moments, clock, CARD), MemoryStore()
    store.states["SYN-1017"] = state_at(by_id(moments, CARD))
    down = Sender(fail_groups={"match-SYN-1017-casual-en"})
    totals = run(Publisher(store, overlays, down, SETTINGS).run_once("SYN-1017"))
    assert totals["pending"] == 1
    saved = run(overlays.read("SYN-1017", "delivery:match-SYN-1017-casual-en:OV-1017-0019"))[0]
    assert saved["state"] == "pending" and saved["seq"] == 1                           # saved before the send
    up = Sender()
    assert run(Publisher(store, overlays, up, SETTINGS).run_once("SYN-1017")) == {"sent": 1}
    assert up.sent == [("match-SYN-1017-casual-en", saved["envelope"])]
    assert run(store.read("SYN-1017", f"job:{CARD}"))[0]["state"] == "published"


def test_a_crash_after_sending_resends_the_identical_envelope(moments, clock):
    store, overlays, sender = played(moments, clock, CARD), MemoryStore(), Sender()
    store.states["SYN-1017"] = state_at(by_id(moments, CARD))
    pub = Publisher(store, overlays, sender, SETTINGS)
    real = overlays.replace

    async def crash(doc, etag):
        if doc.get("state") == "sent" and doc["group"] == "match-SYN-1017-casual-en":
            raise RuntimeError("crash before the acknowledgement was saved")
        return await real(doc, etag)
    overlays.replace = crash
    with pytest.raises(RuntimeError):
        run(pub.run_once("SYN-1017"))
    overlays.replace = real
    run(pub.run_once("SYN-1017"))
    casual = [env for g, env in sender.sent if g == "match-SYN-1017-casual-en"]
    assert len(casual) == 2 and casual[0] == casual[1]                                   # browsers dedupe on seq


def test_one_audience_sent_and_another_expired_is_partially_expired(moments, clock):
    store, overlays = played(moments, clock, CARD), MemoryStore()
    m = by_id(moments, CARD)
    store.states["SYN-1017"] = state_at(m)
    run(Publisher(store, overlays, Sender(fail_groups={"match-SYN-1017-casual-hi"}), SETTINGS).run_once("SYN-1017"))
    store.states["SYN-1017"] = state_at(m, offset_ms=400_000)
    totals = run(Publisher(store, overlays, Sender(), SETTINGS).run_once("SYN-1017"))
    assert totals == {"expired": 1}
    assert run(store.read("SYN-1017", f"job:{CARD}"))[0]["state"] == "partially_expired"


def test_the_recap_is_sent_at_full_time(moments, clock):
    import json
    from pathlib import Path
    state = json.loads((Path(__file__).resolve().parents[2] /
                        "mcp_server/tests/data/tools/match_state/SYN-1017/state.json").read_text(encoding="utf-8"))
    store = MemoryStore()
    for m in moments:
        run(store.create(m))
    store.states["SYN-1017"] = {**state, "phase": "full_time"}
    d = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=SETTINGS, translator=FakeTranslator())
    assert run(W.process_recap("SYN-1017", d))["status"] == "delivery_pending"
    sender = Sender()
    run(Publisher(store, MemoryStore(), sender, SETTINGS).run_once("SYN-1017"))
    recaps = [env for g, env in sender.sent if env["kind"] == "recap"]
    assert recaps and {env["data"]["kind"] for env in recaps} == {"recap"}
    assert any(g == "match-SYN-1017-casual-es" for g, env in sender.sent if env["kind"] == "recap")


def test_player_tags_are_sent_once_per_crossing_in_every_language(moments, clock):
    store, overlays, sender = MemoryStore(), MemoryStore(), Sender()
    state = state_at(by_id(moments, CARD), players={"KES-09": {"name": "Kwame Kone", "top_speed_kmh": 34.1},
                                                    "ORR-04": {"name": "B", "distance_km": 8.0}})
    store.states["SYN-1017"] = state
    pub = Publisher(store, overlays, sender, SETTINGS)
    assert run(pub.run_once("SYN-1017")) == {"player_tags": 4}
    groups = sorted(g for g, _ in sender.sent)
    assert groups == [f"match-SYN-1017-player-KES-09-{lang}" for lang in ("en", "es", "fr", "hi")]
    data = sender.sent[0][1]["data"]
    assert sender.sent[0][1]["kind"] == "player_tag" and data["value"] == 34.1 and data["threshold"] == 33.0
    assert run(pub.run_once("SYN-1017")) == {} and len(sender.sent) == 4
