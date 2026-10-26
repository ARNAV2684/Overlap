"""The stand-in's insights snapshot (infra/local/webpubsub_standin/standin/insights.py) over what the publisher
persists: the two newest live cards per group, the cursor, and the error statuses (CONTRACTS.md §10.4, §10.6)."""
import asyncio
import copy
import importlib.util
from pathlib import Path

import workflow as W
from config import Settings
from publisher import Publisher
from state import JobStore, MemoryStore
from translation import FakeTranslator

PATH = Path(__file__).resolve().parents[2] / "infra/local/webpubsub_standin/standin/insights.py"
spec = importlib.util.spec_from_file_location("standin_insights", PATH)
insights = importlib.util.module_from_spec(spec)
spec.loader.exec_module(insights)


class Sender:
    async def send(self, group, envelope):
        pass


def published(moments, clock, ids, playhead_of):
    store, overlays = MemoryStore(), MemoryStore()
    d = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=Settings(), translator=FakeTranslator())
    for m in moments:
        if m["id"] in ids:
            asyncio.run(W.process_moment(m, d))
    m = next(x for x in moments if x["id"] == playhead_of)
    state = {"phase": "live", "period": m["evidence"]["period"], "source": {"match_ms": m["evidence"]["match_ms"]}}
    store.states["SYN-1017"] = state
    asyncio.run(Publisher(store, overlays, Sender(), Settings()).run_once("SYN-1017"))
    docs = [d for (_, _), (d, _) in overlays.docs.items()]
    return state, docs


def test_groups_are_validated():
    assert insights.group_for("SYN-1017", {"mode": "casual", "lang": "es"}) == ("match-SYN-1017-casual-es", None)
    assert insights.group_for("SYN-1017", {"mode": "club", "lang": "fr", "club": "ORR"})[0] == \
        "match-SYN-1017-club-ORR-fr"
    assert insights.group_for("SYN-1017", {"mode": "player", "lang": "hi", "player": "KES-11"})[0] == \
        "match-SYN-1017-player-KES-11-hi"
    for bad in ({"mode": "fun", "lang": "en"}, {"mode": "casual", "lang": "de"}, {"mode": "club", "lang": "en"},
                {"mode": "player", "lang": "en", "player": "../x"}):
        assert insights.group_for("SYN-1017", bad)[1]
    assert insights.group_for("SYN-17", {"mode": "casual", "lang": "en"})[1] == "bad_match_id"


def test_a_late_joiner_gets_the_two_newest_live_cards(moments, clock):
    ids = ("MO-1017-0015", "MO-1017-0016", "MO-1017-0017")              # same half, a few minutes apart
    state, docs = published(moments, clock, ids, "MO-1017-0017")
    status, body = insights.build_insights("SYN-1017", "match-SYN-1017-casual-en", state, docs)
    assert status == 200 and body["group"] == "match-SYN-1017-casual-en"
    seqs = [e["seq"] for e in body["envelopes"]]
    assert seqs == sorted(seqs) and len(seqs) <= 2 and body["cursor"] >= seqs[-1]
    assert all(e["data"]["mode"] == "casual" and e["data"]["lang"] == "en" for e in body["envelopes"])
    later = {**state, "source": {"match_ms": state["source"]["match_ms"] + insights.LIVE_WINDOW_MS + 100_000}}
    status, body = insights.build_insights("SYN-1017", "match-SYN-1017-casual-en", later, docs)
    assert status == 200 and body["envelopes"] == [] and body["cursor"] > 0          # expired, cursor kept


def test_errors():
    assert insights.build_insights("SYN-9999", "g", None, [])[0] == 404
    assert insights.build_insights("SYN-1017", "g", None, [{"group": "g"}])[0] == 503
    status, body = insights.build_insights("SYN-1017", "g", {"phase": "live", "period": 1,
                                                             "source": {"match_ms": 1}}, [])
    assert status == 200 and body["envelopes"] == [] and body["cursor"] == 0


def test_a_damaged_document_is_counted_not_served(moments, clock):
    state, docs = published(moments, clock, ("MO-1017-0017",), "MO-1017-0017")
    bad = copy.deepcopy(next(d for d in docs if d.get("group") == "match-SYN-1017-casual-en"
                             and d.get("kind") == "audience_delivery"))
    bad["envelope"]["match_id"] = "SYN-0001"
    bad["id"] = "delivery:x"
    _, body = insights.build_insights("SYN-1017", "match-SYN-1017-casual-en", state, [*docs, bad])
    assert body["rejected"] == {"count": 1, "samples": ["delivery:x"]}
