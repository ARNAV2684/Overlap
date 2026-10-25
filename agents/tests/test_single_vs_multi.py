"""The single-agent comparison bench (D6, agents/specs/evaluation.md §6) with a scripted model: no network."""
import asyncio
import copy
import dataclasses
import re

from config import Settings
from evals import single_vs_multi as svm
from state import JobStore, MemoryStore
from tests.fakes import FakeContext, ScriptedModels, good
from translation import FakeTranslator
from workflow import Deps

SETTINGS = svm.bench_settings(Settings(provider="local", local_base_url="http://localhost:1", local_model="fake"),
                              svm.Path("."), 21)


def drifting(agent, payload):
    """A first draft that moves the analyst line's first number up by 100 (a value in no fact); a rewrite is honest."""
    reply = good(agent, payload)
    if agent == "narrator" and "lines" in payload:
        for ln in reply["lines"]:
            if ln["id"] == "analyst":
                ln["text"] = re.sub(r"\d+", lambda d: str(int(d.group()) + 100), ln["text"], count=1)
    return reply


def compare(moments, script):
    store = MemoryStore()
    for i, m in enumerate(moments):
        asyncio.run(store.create({**m, "_ts": i}))
    models = ScriptedModels(SETTINGS, script)
    deps = Deps(store=store, jobs=JobStore(store), settings=SETTINGS, translator=FakeTranslator(), models=models,
                context=lambda m: FakeContext(m))
    return asyncio.run(svm.compare(moments, deps, on_moment=lambda m: setattr(models, "moment", m))), models


def test_the_pipeline_rewrites_what_the_single_agent_publishes(moments):
    picked = [copy.deepcopy(m) for m in moments if m["id"] in ("MO-1017-0012", "MO-1017-0004")]
    rows, models = compare(picked, drifting)
    s = svm.summarise(rows, SETTINGS)
    assert s["compared"] == 2
    assert s["single"]["published"]["wrong_number"] == 2 and s["single"]["refused"] == 0
    assert s["single"]["published"]["unverified_number"] == 2 and s["single"]["published"]["absent"]
    assert s["full"]["first_draft"]["wrong_number"] == 2 and s["full"]["rewritten"] == 2
    assert s["full"]["published"]["wrong_number"] == 0 and s["full"]["published"]["any_problem"] == 0
    assert s["full"]["verified"] == s["full"]["published"]["lines"]
    single_payloads = [p for name, p in models.calls if name == "narrator" and "lines" in p
                       and p["interpretation"] is None]
    assert single_payloads and all(p["key_facts"] is None for p in single_payloads)   # no analyst context
    report = svm.markdown(s)
    assert "evidence) | **2**" in report and "Summary for docs/evaluation.md" in report
    assert s["examples"][0]["line"] == "analyst" and s["examples"][0]["full_verified"]


def test_moments_the_pipeline_did_not_give_the_model_are_not_compared(moments):
    no_model = dataclasses.replace(SETTINGS, provider="off")
    store = MemoryStore()
    m = copy.deepcopy(moments[0])
    asyncio.run(store.create({**m, "_ts": 0}))
    deps = Deps(store=store, jobs=JobStore(store), settings=no_model, translator=FakeTranslator())
    rows = asyncio.run(svm.compare([m], deps))
    s = svm.summarise(rows, no_model)
    assert s["compared"] == 0 and s["skipped"] in ({"no_model": 1}, {"suppressed": 1})


def test_problem_codes_are_sorted_into_kinds():
    assert svm.kind("wrong_value:shots_last_5min") == "unverified_number"
    assert svm.kind("spelled_number:two") == "unverified_number"
    assert svm.kind("unknown_name:Press") == "other" and svm.kind("cluster_inference") == "unsupported"
    assert svm.kind("red_card_reason") == "unsupported" and svm.kind("momentum_possession") == "unsupported"
    assert svm.kind("too_long") == "other" and svm.kind("claims_without_numbers") == "other"


def test_paid_provider_is_refused_without_the_flag(monkeypatch, tmp_path):
    monkeypatch.setenv("OVERLAP_MODEL_PROVIDER", "azure")
    monkeypatch.setenv("OVERLAP_AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("OVERLAP_AZURE_OPENAI_DEPLOYMENT", "x")
    assert svm.main(["--fixture", "--out", str(tmp_path)]) == 1 and not list(tmp_path.iterdir())


def test_a_true_number_tied_to_the_wrong_fact_is_unverified_not_wrong(moments):
    goal = next(m for m in moments if m["id"] == "MO-1017-0012")
    trailing = svm.judged("Orrinford Albion trail 0–3.", ["score_not_from_facts"], goal)
    assert not trailing["wrong_number"] and trailing["unverified_number"]
    invented = svm.judged("Kestlebury United lead 7–0.", ["text_differs:team_goals_match"], goal)
    assert invented["wrong_number"] and invented["absent"] == ["7"]


def test_saved_rows_are_judged_again(moments, tmp_path):
    picked = [copy.deepcopy(m) for m in moments if m["id"] in ("MO-1017-0012", "MO-1017-0004")]
    rows, _ = compare(picked, drifting)
    for r in rows:
        for ln in r["single"]["published"].values():
            ln.pop("absent"), ln.pop("wrong_number")
    again = svm.rejudge(rows, moments)
    assert svm.summarise(again, SETTINGS)["single"]["published"]["wrong_number"] == 2


def test_a_number_the_fact_labels_state_is_not_wrong(moments):
    press = next(m for m in moments if m["id"] == "MO-1017-0004")       # "... in the 10 minutes before that"
    line = svm.judged("Down from 1.07 in the previous 10 minutes to 0.55.", ["numbers_without_claims"], press)
    assert not line["wrong_number"] and line["unverified_number"]
