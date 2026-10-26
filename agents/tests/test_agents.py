"""The seven agents with a scripted model and a fake MCP (AC-04a, AC-04b). No model, network or subprocess."""
import asyncio
import copy
import json

import pytest

import workflow as W
from config import Settings
from director import player_tag_crossings
from fact_checker import core, numeric_check
from models import Budget
from publisher import LIVE_WINDOW_MS
from state import JobStore, MemoryStore
from tests.fakes import FakeContext, ScriptedModels, fail, good
from translation import FakeTranslator, TranslationError

SETTINGS = Settings(provider="local", local_base_url="http://localhost:1", local_model="fake")


def run(coro):
    return asyncio.run(coro)


def by_id(moments, i):
    return copy.deepcopy(next(m for m in moments if m["id"] == i))


def deps(store, clock, script=good, replies=None, opened=None, settings=SETTINGS, translator=None):
    models = ScriptedModels(settings, script)
    return W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=settings,
                  translator=translator or FakeTranslator(), models=models,
                  context=lambda m: FakeContext(m, replies, opened))


def process(moment, d):
    d.models.moment = moment
    return run(W.process_moment(moment, d))


def outbox(store, moment_id):
    doc, _ = run(store.read("SYN-1017", f"outbox:{moment_id}"))
    return doc["intent"]


def job(store, moment_id):
    return run(store.read("SYN-1017", f"job:{moment_id}"))[0]


def agents_called(d):
    return [name for name, _ in d.models.calls]


# --- the whole chain ----------------------------------------------------------------------------------------------

def test_a_good_model_verifies_every_line_in_every_language(moments, clock):
    store, cluster = MemoryStore(), by_id(moments, "MO-1017-0013")
    d = deps(store, clock)
    result = process(cluster, d)
    assert result["status"] == "delivery_pending" and result["verified"] is True and result["fallback"] is False
    assert agents_called(d) == ["spotter", "analyst", "narrator", "narrator", "fact_checker", "translator", "translator",
                                "translator"]
    intent = outbox(store, "MO-1017-0013")
    ids = {(a["mode"], a.get("club") or a.get("player"), a["lang"]) for a in intent["audiences"]}
    assert len(ids) == 7 * 4                       # casual, analyst, 2 clubs, 3 players × en es hi fr
    for a in intent["audiences"]:
        body = a["overlay"]
        assert body["verified"] and not body["fallback"] and body["overlay_id"] == "OV-1017-0013"
        assert body["modes"] == {a["mode"]: {a["lang"]: a["line"]["text"]}}
        assert set(a["line"]) == {"mode", "lang", "text", "claims"}
    calls = job(store, "MO-1017-0013")["stage_outputs"]["narrator"]["calls"]
    assert calls[0]["agent"] == "narrator" and calls[0]["ok"] and len(calls[0]["prompt"]) == 12


def test_every_real_moment_publishes_only_checked_numbers(moments, clock):
    """A careless model (wrong values, extra numbers) never gets a wrong number into an outbox."""
    def careless(agent, payload):
        reply = good(agent, payload)
        if agent == "narrator":
            for i, ln in enumerate(reply["lines"]):
                if i % 2 == 0 and ln["claims"]:
                    ln["claims"][0]["value"] += 1                          # wrong value
                elif i % 3 == 0:
                    ln["text"] += " With 99 more to come."                 # an uncovered number
        return reply
    store = MemoryStore()
    d = deps(store, clock, careless)
    for m in moments:
        run(store.create(m))
    for m in moments:
        d.models.moment = m
        clock.t += 1
        run(W.process_moment(m, d))
    published = 0
    for m in moments:
        found = run(store.read("SYN-1017", f"outbox:{m['id']}"))
        if not found:
            continue
        for a in found[0]["intent"]["audiences"]:
            line = {"id": a["mode"], **a["line"]}
            assert numeric_check(line, m, english=None if a["lang"] == "en" else _english(found, a)) == []
            published += 1
    assert published > 100


def _english(found, a):
    key = a.get("club") or a.get("player")
    en = next(x for x in found[0]["intent"]["audiences"] if x["mode"] == a["mode"] and x["lang"] == "en"
              and (x.get("club") or x.get("player")) == key)
    return {"id": a["mode"], **en["line"]}


# --- spotter ------------------------------------------------------------------------------------------------------

def test_spotter_merges_moments_of_the_same_event(moments, clock):
    store = MemoryStore()
    goal, cluster = by_id(moments, "MO-1017-0012"), by_id(moments, "MO-1017-0013")
    assert goal["evidence"]["event_ids"][-1] == cluster["evidence"]["event_ids"][-1]
    run(store.create(goal))
    run(store.create(cluster))
    d = deps(store, clock)
    assert process(cluster, d)["status"] == "suppressed"
    assert job(store, "MO-1017-0013")["terminal_reason"] == "merge_into:MO-1017-0012"
    assert process(goal, d)["status"] == "delivery_pending"
    spot = job(store, "MO-1017-0012")["stage_outputs"]["spotter"]
    assert spot["merged"] == ["MO-1017-0013"] and spot["priority"] == "high"
    analyst_payload = next(p for n, p in d.models.calls if n == "analyst" and p["moment"]["trigger"] == "goal")
    assert analyst_payload["same_event_moments"][0]["trigger"] == "shot_cluster"


def test_high_priority_is_never_ranked_and_normal_ones_can_be_suppressed(moments, clock):
    def picky(agent, payload):
        return {"decision": "suppress", "reason": "small change"} if agent == "spotter" else good(agent, payload)
    store = MemoryStore()
    d = deps(store, clock, picky)
    assert process(by_id(moments, "MO-1017-0014"), d)["status"] == "delivery_pending"      # red card
    assert "spotter" not in agents_called(d)
    assert process(by_id(moments, "MO-1017-0004"), d)["status"] == "suppressed"            # press change
    assert job(store, "MO-1017-0004")["terminal_reason"] == "ranked:small change"


def test_spotter_admits_when_ranking_fails(moments, clock):
    d = deps(MemoryStore(), clock, lambda a, p: fail() if a == "spotter" else good(a, p))
    assert process(by_id(moments, "MO-1017-0004"), d)["status"] == "delivery_pending"


def test_comparison_moments_are_thinned_when_the_budget_is_tight(moments, clock):
    store = MemoryStore()
    d = deps(store, clock)
    for i in range(6):                                                     # half the model-job slots used
        d.models.gate.budget.claim_model_job("SYN-1017", f"X-{i}", high=True, max_jobs=12, reserve=3)
    first, second = by_id(moments, "MO-1017-0010"), by_id(moments, "MO-1017-0011")   # KES, minutes apart
    assert second["evidence"]["match_ms"] - first["evidence"]["match_ms"] < 600_000
    assert process(first, d)["status"] == "delivery_pending"
    assert process(second, d)["status"] == "suppressed"
    assert job(store, "MO-1017-0011")["terminal_reason"] == "thinned"


def test_normal_moments_leave_slots_for_high_ones():
    b = Budget.from_settings(SETTINGS)
    got = [b.claim_model_job("M", f"N-{i}", high=False, max_jobs=12, reserve=3) for i in range(12)]
    assert got.count(True) == 9
    assert b.claim_model_job("M", "H-1", high=True, max_jobs=12, reserve=3)
    assert b.claim_model_job("M", "N-0", high=False, max_jobs=12, reserve=3)          # idempotent


def test_without_a_model_slot_the_card_uses_templates(moments, clock):
    store = MemoryStore()
    d = deps(store, clock)
    for i in range(12):
        d.models.gate.budget.claim_model_job("SYN-1017", f"X-{i}", high=True, max_jobs=12, reserve=3)
    result = process(by_id(moments, "MO-1017-0014"), d)
    assert result["status"] == "delivery_pending" and result["fallback"] and not result["verified"]
    assert agents_called(d) == []


# --- analyst and MCP ----------------------------------------------------------------------------------------------

def test_analyst_reads_the_tools_for_its_trigger_and_drops_later_numbers(moments, clock):
    opened = []
    d = deps(MemoryStore(), clock, replies={"get_live_state": "after_moment"}, opened=opened)
    process(by_id(moments, "MO-1017-0004"), d)                             # press change
    assert opened[0].called == ["get_match_state", "get_live_state", "get_team_pressing", "compare_periods"]
    payload = next(p for n, p in d.models.calls if n == "analyst")
    assert set(payload["context"]) == {"get_team_pressing", "compare_periods"}


def test_denied_scope_rejects_the_job(moments, clock):
    store = MemoryStore()
    d = deps(store, clock, replies={"get_match_state": "denied"})
    assert process(by_id(moments, "MO-1017-0013"), d)["status"] == "rejected"
    assert job(store, "MO-1017-0013")["terminal_reason"].startswith("mcp:")
    assert run(store.read("SYN-1017", "outbox:MO-1017-0013")) is None


def test_another_moments_context_rejects_the_job(moments, clock):
    cluster = by_id(moments, "MO-1017-0013")
    other = copy.deepcopy(cluster["context"])
    other["teams"]["home"]["name"] = "Somebody Else"
    d = deps(MemoryStore(), clock, replies={"get_match_state": other})
    assert process(cluster, d)["status"] == "rejected"


def test_unavailable_context_uses_templates(moments, clock):
    d = deps(MemoryStore(), clock, replies={"get_match_state": "unavailable"})
    result = process(by_id(moments, "MO-1017-0013"), d)
    assert result["status"] == "delivery_pending" and result["fallback"] and not result["verified"]
    assert "narrator" not in agents_called(d)


def test_an_interpretation_with_numbers_is_refused(moments, clock):
    def numeric(agent, payload):
        if agent == "analyst":
            return {"interpretation": "They had 3 shots.", "key_facts": ["shots_last_5min"]}
        return good(agent, payload)
    store = MemoryStore()
    d = deps(store, clock, numeric)
    process(by_id(moments, "MO-1017-0013"), d)
    analysis = job(store, "MO-1017-0013")["stage_outputs"]["analyst"]
    assert analysis["interpretation"] is None and analysis["reason"] == "invalid_output"


# --- narrator, fact-checker, rewrites -----------------------------------------------------------------------------

def test_a_wrong_line_is_rewritten_once_and_then_verified(moments, clock):
    attempts = {"n": 0}

    def once_wrong(agent, payload):
        reply = good(agent, payload)
        if agent == "narrator" and "lines" in payload:
            attempts["n"] += 1
            if attempts["n"] == 1:
                reply["lines"][0]["claims"][0]["value"] = 99
        return reply
    store = MemoryStore()
    d = deps(store, clock, once_wrong)
    assert process(by_id(moments, "MO-1017-0013"), d)["verified"] is True
    checked = job(store, "MO-1017-0013")["stage_outputs"]["fact_checker"]
    assert checked["rounds"][0]["numeric"]["casual"] and checked["status"]["casual"]["verified"]
    rewrite = [p for n, p in d.models.calls if n == "narrator" and "rewrite" in p]
    assert [r["id"] for r in rewrite[0]["rewrite"]] == ["casual"]
    assert "wrong_value:shots_last_5min" in rewrite[0]["rewrite"][0]["reasons"]


def test_after_two_failed_rewrites_the_template_is_used(moments, clock):
    def stubborn(agent, payload):
        reply = good(agent, payload)
        if agent == "narrator":
            for ln in reply["lines"]:
                if ln["id"] == "analyst":
                    ln["text"] += " They dominate."
        return reply
    store = MemoryStore()
    d = deps(store, clock, stubborn)
    process(by_id(moments, "MO-1017-0013"), d)
    checked = job(store, "MO-1017-0013")["stage_outputs"]["fact_checker"]
    assert len(checked["rounds"]) == 3
    assert checked["status"]["analyst"] == {"verified": False, "fallback": True}
    assert checked["status"]["casual"] == {"verified": True, "fallback": False}


def test_a_meaning_failure_goes_back_to_the_narrator(moments, clock):
    def judge(agent, payload):
        if agent == "fact_checker" and not any(n == "narrator" and "rewrite" in p for n, p in d.models.calls):
            return {"pass": False, "interpretation_supported": True,
                    "lines": [{"id": ln["id"], "pass": ln["id"] != "casual", "reasons": ["predicts a goal"] if
                               ln["id"] == "casual" else []} for ln in payload["lines"]]}
        return good(agent, payload)
    store = MemoryStore()
    d = deps(store, clock, judge)
    process(by_id(moments, "MO-1017-0013"), d)
    rewrite = next(p for n, p in d.models.calls if n == "narrator" and "rewrite" in p)
    assert rewrite["rewrite"][0]["reasons"] == ["meaning:predicts a goal"]
    assert job(store, "MO-1017-0013")["stage_outputs"]["fact_checker"]["status"]["casual"]["verified"]


@pytest.mark.parametrize("bad_verdict", [
    lambda p: fail("timeout"),
    lambda p: {"pass": True, "interpretation_supported": True, "lines": []},                     # missing lines
    lambda p: {"pass": True, "interpretation_supported": True,
               "lines": [{"id": ln["id"], "pass": False, "reasons": []} for ln in p["lines"]]},    # inconsistent
])
def test_no_usable_meaning_verdict_means_templates(moments, clock, bad_verdict):
    d = deps(MemoryStore(), clock, lambda a, p: bad_verdict(p) if a == "fact_checker" else good(a, p))
    result = process(by_id(moments, "MO-1017-0013"), d)
    assert result["fallback"] and not result["verified"]


@pytest.mark.parametrize("broken", ["timeout", "budget", "invalid", "deadline"])
def test_any_narrator_failure_falls_back_for_that_step_only(moments, clock, broken):
    def script(agent, payload):
        if agent == "narrator":
            return {"lines": "not a list"} if broken == "invalid" else fail(broken)
        return good(agent, payload)
    store = MemoryStore()
    d = deps(store, clock, script)
    result = process(by_id(moments, "MO-1017-0013"), d)
    assert result["status"] == "delivery_pending" and result["fallback"]
    outputs = job(store, "MO-1017-0013")["stage_outputs"]
    assert outputs["analyst"]["interpretation"]                             # earlier steps keep their output
    assert outputs["narrator"]["fallback"] is True


# --- translator ---------------------------------------------------------------------------------------------------

class BrokenFor(FakeTranslator):
    def __init__(self, lang):
        self.lang = lang

    async def translate(self, texts, to, keep=None):
        if to == self.lang:
            raise TranslationError("down")
        return await super().translate(texts, to, keep)


def test_a_failed_language_is_dropped_but_english_stays(moments, clock):
    store = MemoryStore()
    d = deps(store, clock, translator=BrokenFor("hi"))
    process(by_id(moments, "MO-1017-0013"), d)
    intent = outbox(store, "MO-1017-0013")
    assert {a["lang"] for a in intent["audiences"]} == {"en", "es", "fr"}
    assert {x["lang"] for x in intent["dropped"]} == {"hi"}


def test_a_failed_language_check_gets_the_translated_template(moments, clock):
    def strict(agent, payload):
        if agent == "translator" and payload["lang"] == "fr":
            return {"pass": False, "lines": [{"id": ln["id"], "pass": False, "reasons": ["meaning changed"]}
                                             for ln in payload["lines"]]}
        return good(agent, payload)
    store = MemoryStore()
    d = deps(store, clock, strict)
    process(by_id(moments, "MO-1017-0013"), d)
    fr = [a["overlay"] for a in outbox(store, "MO-1017-0013")["audiences"] if a["lang"] == "fr"]
    es = [a["overlay"] for a in outbox(store, "MO-1017-0013")["audiences"] if a["lang"] == "es"]
    assert fr and all(o["fallback"] and not o["verified"] for o in fr)
    assert es and all(o["verified"] for o in es)


# --- director -----------------------------------------------------------------------------------------------------

def test_director_visuals_and_groups(moments, clock):
    store = MemoryStore()
    d = deps(store, clock)
    process(by_id(moments, "MO-1017-0003"), d)                             # momentum swing: team only
    swing = outbox(store, "MO-1017-0003")
    assert swing["visual"]["component"] == "momentum_tide" and swing["visual"]["highlight"] == {"team_id": "KES"}
    process(by_id(moments, "MO-1017-0004"), d)
    press = outbox(store, "MO-1017-0004")
    assert press["visual"]["component"] == "pressing_zones" and "event_id" in press["visual"]["highlight"]
    groups = {a["group"] for a in press["audiences"]}
    assert {"match-SYN-1017-casual-es", "match-SYN-1017-club-ORR-fr"} <= groups
    assert all(not (a["overlay"]["verified"] and a["overlay"]["fallback"]) for a in press["audiences"])


def test_milestone_carries_a_player_tag(moments, clock):
    goal = by_id(moments, "MO-1017-0002")
    milestone = copy.deepcopy(goal)
    e = milestone["evidence"]
    e["trigger"], e["moment_id"] = "milestone", "MO-1017-0099"
    milestone["id"] = milestone["moment_id"] = "MO-1017-0099"
    e["facts"] = [{"key": "player_goals_match", "value": 2, "decimals": 0, "label": "goals this match"},
                  {"key": "shot_xg", "value": 0.49, "unit": "xG", "decimals": 2, "label": "xG"}]
    e["player_ids"] = e["player_ids"][:1]
    milestone["context"]["players"] = milestone["context"]["players"][:1]
    store = MemoryStore()
    process(milestone, deps(store, clock))
    body = outbox(store, "MO-1017-0099")["audiences"][0]["overlay"]
    assert body["player_tags"] == [{"player_id": e["player_ids"][0],
                                    "label": milestone["context"]["players"][0]["name"]}]
    assert body["visual"]["highlight"]["player_id"] == e["player_ids"][0]


def test_player_tags_fire_once_per_threshold():
    state = {"players": {"KES-09": {"name": "A", "top_speed_kmh": 34.2, "distance_km": 9.1},
                         "ORR-04": {"name": "B", "top_speed_kmh": 30.0, "distance_km": 10.4},
                         "ORR-05": {"name": "C"}}}                          # no tracking: no tag, never zero
    tags = player_tag_crossings(state, set(), SETTINGS)
    assert [(t["player_id"], t["metric"]) for t in tags] == [("KES-09", "top_speed_kmh"), ("ORR-04", "distance_km")]
    assert player_tag_crossings(state, {("KES-09", "top_speed_kmh"), ("ORR-04", "distance_km")}, SETTINGS) == []


# --- recap --------------------------------------------------------------------------------------------------------

def final_state():
    from pathlib import Path
    path = Path(__file__).resolve().parents[2] / "mcp_server/tests/data/tools/match_state/SYN-1017/state.json"
    state = json.loads(path.read_text(encoding="utf-8"))
    state["phase"] = "full_time"
    return state


def test_recap_runs_once_at_full_time(moments, clock):
    store = MemoryStore()
    for m in moments:
        run(store.create(m))
    d = deps(store, clock)
    store.states["SYN-1017"] = {**final_state(), "phase": "live"}
    assert run(W.process_recap("SYN-1017", d))["status"] == "not_full_time"
    store.states["SYN-1017"] = final_state()
    from recap_writer import recap_moment
    d.models.moment = recap_moment(final_state(), sorted(moments, key=lambda m: m["id"]))
    result = run(W.process_recap("SYN-1017", d))
    assert result["status"] == "delivery_pending" and result["verified"]
    assert run(W.process_recap("SYN-1017", d))["status"] in ("skipped", "delivery_pending")
    intent = run(store.read("SYN-1017", "outbox:RC-1017"))[0]["intent"]
    assert intent["kind"] == "recap" and intent["recap_id"] == "RC-1017"
    casual = next(a for a in intent["audiences"] if a["group"] == "match-SYN-1017-casual-en")
    assert casual["recap"]["lines"][0]["text"].startswith("Full time: Kestlebury United 3–0 Orrinford Albion")
    story = next(p for n, p in d.models.calls if n == "recap_writer")["story"]
    assert len(story) == 21 and all("clock" not in s for s in story)


def test_recap_templates_pass_the_check(moments):
    from recap_writer import recap_line_ids, recap_moment, recap_template
    recap = recap_moment(final_state(), moments)
    ids = recap_line_ids(recap, ("casual", "analyst", "player", "club"), 3)
    assert ids[:2] == ["casual", "analyst"] and any(i.startswith("player:") for i in ids)
    for i in ids:
        assert numeric_check(core(recap_template(recap, i)), recap) == [], i


def test_the_independent_recheck_accepts_template_translations_of_verified_lines(moments, clock):
    """English stays the model's verified line while French falls back to its translated template: both correct."""
    from run_match import recheck

    def strict(agent, payload):
        if agent == "translator" and payload["lang"] == "fr":
            return {"pass": False, "lines": [{"id": ln["id"], "pass": False, "reasons": ["meaning changed"]}
                                             for ln in payload["lines"]]}
        return good(agent, payload)

    def worded(agent, payload):
        reply = strict(agent, payload)
        if agent == "narrator":
            for ln in reply["lines"]:
                ln["text"] = ln["text"].replace("in quick succession", "in a short spell")  # model wording, same facts
        return reply
    store, cluster = MemoryStore(), by_id(moments, "MO-1017-0019")
    process(cluster, deps(store, clock, worded))
    intent = outbox(store, "MO-1017-0019")
    en = next(a for a in intent["audiences"] if a["group"] == "match-SYN-1017-casual-en")
    fr = next(a for a in intent["audiences"] if a["group"] == "match-SYN-1017-casual-fr")
    assert en["overlay"]["verified"] and "in a short spell" in en["line"]["text"]
    assert fr["overlay"]["fallback"] and "quick succession" in fr["line"]["text"]
    assert recheck(intent, cluster) == []
    fr["line"]["text"] = fr["line"]["text"].replace(" 3 ", " 4 ")                    # a real wrong number
    assert recheck(intent, cluster)


def test_an_optional_tool_that_reads_inconsistently_is_skipped_not_fatal(moments, clock):
    from context import ContextRejected
    store = MemoryStore()
    d = deps(store, clock, replies={"get_live_state": ContextRejected("get_live_state:context_mismatch")})
    assert process(by_id(moments, "MO-1017-0013"), d)["status"] == "delivery_pending"
    tools = job(store, "MO-1017-0013")["stage_outputs"]["analyst"]["tools"]
    assert {"tool": "get_live_state", "status": "inconsistent"} in tools


def test_an_optional_tool_outside_scope_still_rejects(moments, clock):
    from context import ContextRejected
    d = deps(MemoryStore(), clock, replies={"get_live_state": ContextRejected("get_live_state:outside_scope")})
    assert process(by_id(moments, "MO-1017-0013"), d)["status"] == "rejected"


def test_a_moment_the_match_has_moved_past_is_suppressed_before_any_model_call(moments, clock):
    store = MemoryStore()
    cluster = by_id(moments, "MO-1017-0013")
    store.states["SYN-1017"] = {"phase": "live", "period": 2,
                                "source": {"event_seq": 9, "match_ms": cluster["evidence"]["match_ms"] + LIVE_WINDOW_MS + 100_000}}
    d = deps(store, clock)
    assert process(cluster, d)["status"] == "suppressed"
    assert job(store, "MO-1017-0013")["terminal_reason"] == "stale" and d.models.calls == []


def test_replays_can_turn_the_stale_check_off(moments, clock):
    import dataclasses
    store = MemoryStore()
    store.states["SYN-1017"] = {"phase": "full_time", "period": 2, "source": {"event_seq": 9, "match_ms": 6_000_000}}
    d = deps(store, clock, settings=dataclasses.replace(SETTINGS, skip_stale=False))
    assert process(by_id(moments, "MO-1017-0013"), d)["status"] == "delivery_pending"


def test_the_recap_job_gets_its_own_deadline(moments, clock):
    # Shown once at full time, the recap is not raced against the match: 60 s, where a moment gets 15 (25 on Azure)
    store = MemoryStore()
    jobs = JobStore(store, deadline_s=15, recap_deadline_s=60, clock=clock)
    moment = by_id(moments, "MO-1017-0013")
    recap = {**moment, "id": "RC-1017", "moment_id": "RC-1017", "kind": "recap"}
    now = clock()
    asyncio.run(jobs.claim(moment, "w"))
    asyncio.run(jobs.claim(recap, "w"))
    assert job(store, "MO-1017-0013")["deadline_utc"] - now == 15
    assert job(store, "RC-1017")["deadline_utc"] - now == 60
