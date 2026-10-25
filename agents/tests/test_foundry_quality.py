"""The Azure AI Evaluation run over published lines (agents/specs/observability.md §3), with fake evaluators: the
sample, the evaluator inputs, the dry run and the output format. No model call."""
import asyncio
import copy
import json

import workflow as W
from config import Settings
from evals import foundry_quality as Q
from state import JobStore, MemoryStore
from tests.fakes import FakeContext, ScriptedModels, fail
from translation import FakeTranslator

MODEL = Settings(provider="local", local_base_url="http://localhost:1", local_model="fake")
IDS = ("MO-1017-0013", "MO-1017-0001", "MO-1017-0005")


def published(moments, clock, script=None):
    """A store with these moments run through the agents, and bench-style rows (moment, intent)."""
    store = MemoryStore()
    rows = []
    for mid in IDS:
        m = copy.deepcopy(next(x for x in moments if x["id"] == mid))
        asyncio.run(store.create({**m, "_ts": len(rows)}))
        models = ScriptedModels(MODEL, script) if script else ScriptedModels(MODEL)
        models.moment = m
        deps = W.Deps(store=store, jobs=JobStore(store, clock=clock), settings=MODEL, translator=FakeTranslator(),
                      models=models, context=lambda x: FakeContext(x))
        asyncio.run(W.process_moment(m, deps))
        found = asyncio.run(store.read("SYN-1017", f"outbox:{mid}"))
        rows.append({"moment": m, "intent": found[0]["intent"] if found else None})
    return store, rows


def results_folder(tmp_path, rows):
    folder = tmp_path / "matches"
    folder.mkdir()
    (folder / "SYN-1017.json").write_text(json.dumps({"match_id": "SYN-1017", "moments": rows}), encoding="utf-8")
    return folder


def fake_evaluators(calls):
    def make(name, score):
        def evaluate(**kw):
            calls.append((name, sorted(kw)))
            if score is None:
                raise RuntimeError("judge unavailable")
            return {name: score, f"{name}_result": "pass" if score >= 3 else "fail", f"{name}_threshold": 3,
                    f"{name}_reason": f"{name} looks fine"}
        return evaluate
    return {"groundedness": make("groundedness", 5.0), "relevance": make("relevance", 2.0),
            "fluency": make("fluency", None)}


def test_only_english_model_lines_are_sampled_unless_templates_are_asked_for(moments, clock):
    _, rows = published(moments, clock)
    m, intent = rows[0]["moment"], rows[0]["intent"]
    lines = Q.lines_of(m, intent, include_templates=False)
    english = [a for a in intent["audiences"] if a["lang"] == "en"]
    assert len(lines) == len(english) and all(r["kind"] == "model" for r in lines)
    assert {r["response"] for r in lines} == {a["line"]["text"] for a in english}
    _, template_rows = published(moments, clock, script=lambda agent, payload: fail("timeout"))
    t_moment, t_intent = template_rows[0]["moment"], template_rows[0]["intent"]
    assert Q.lines_of(t_moment, t_intent, include_templates=False) == []
    assert {r["kind"] for r in Q.lines_of(t_moment, t_intent, include_templates=True)} == {"template"}


def test_the_evaluator_reads_the_evidence_and_the_task(moments, clock):
    _, rows = published(moments, clock)
    m = rows[0]["moment"]
    ctx = Q.context(m)
    for f in m["evidence"]["facts"]:
        assert f"{f['label']}: {f['value']}" in ctx
    assert m["evidence"]["clock"] in ctx and "Kestlebury" in ctx
    first = m["context"]["players"][0]
    team = next(t["name"] for t in m["context"]["teams"].values() if first["player_id"].startswith(t["team_id"]))
    assert f"{first['name']} ({first['pos']}, {team})" in ctx
    q = Q.query(m, "analyst")
    assert "shot cluster" in q and "analytics-minded" in q and "only the facts given" in q
    player = m["context"]["players"][-1]
    assert f"a fan following {player['name']}, about {player['name']}'s part" in Q.query(m, "player",
                                                                                         player["player_id"])
    other = next(t for t in m["context"]["teams"].values() if t["team_id"] != m["evidence"]["team_id"])
    assert f"a fan of {other['name']} about" in Q.query(m, "club", other["team_id"])


def test_the_sample_spreads_across_triggers():
    rows = [{"sample_id": f"MO-{t}-{i}", "trigger": t, "mode": "casual"} for t in ("goal", "press_change")
            for i in range(10)]
    got = Q.sample(rows, 4)
    assert len(got) == 4 and {r["trigger"] for r in got} == {"goal", "press_change"}


def test_a_judge_reply_without_a_score_is_an_error_not_a_number():
    row = {"sample_id": "MO-1|g", "match_id": "SYN-1", "moment_id": "MO-1", "trigger": "goal", "mode": "casual",
           "kind": "model", "response": "A line.", "query": "q", "context": "c"}
    evaluators = {"fluency": lambda **kw: {"fluency": float("nan"), "fluency_result": "unknown",
                                           "fluency_reason": "cut off"}}
    got = Q.score_one(row, evaluators)
    assert got["fluency"]["score"] is None and got["fluency"]["result"] == "error"
    summary = Q.summarise([got], "test", "fake", ["fluency"])
    assert summary["by_metric"]["fluency"]["errors"] == 1 and summary["by_metric"]["fluency"]["mean"] is None
    json.dumps(summary, allow_nan=False)                          # strict JSON: no NaN anywhere


def test_model_lines_come_first_and_templates_fill_the_rest():
    rows = [{"sample_id": f"MO-{k}-{i}", "trigger": "goal", "mode": "casual", "kind": k}
            for k in ("model", "template") for i in range(5)]
    assert [r["kind"] for r in Q.sample(rows, 7)].count("model") == 5
    assert {r["kind"] for r in Q.sample(rows, 3)} == {"model"}


def test_a_dry_run_writes_the_sample_and_calls_nothing(moments, clock, tmp_path, capsys):
    _, rows = published(moments, clock)
    calls: list = []
    out = tmp_path / "out"
    assert Q.main(["--results", str(results_folder(tmp_path, rows)), "--out", str(out)],
                  evaluators=fake_evaluators(calls)) == 0
    assert calls == [] and not (out / "rows.jsonl").exists()
    sample = [json.loads(x) for x in (out / "input.jsonl").read_text(encoding="utf-8").splitlines()]
    assert sample and set(sample[0]) == {"sample_id", "match_id", "moment_id", "trigger", "mode", "kind",
                                         "response", "query", "context"}
    assert "dry run" in capsys.readouterr().out


def test_a_run_scores_every_line_and_writes_the_report(moments, clock, tmp_path):
    _, rows = published(moments, clock)
    calls: list = []
    out = tmp_path / "out"
    assert Q.main(["--results", str(results_folder(tmp_path, rows)), "--out", str(out), "--run", "--sample", "5"],
                  evaluators=fake_evaluators(calls)) == 0
    scored = [json.loads(x) for x in (out / "rows.jsonl").read_text(encoding="utf-8").splitlines()]
    assert len(scored) == 5
    assert ("groundedness", ["context", "query", "response"]) in calls
    assert ("relevance", ["query", "response"]) in calls and ("fluency", ["response"]) in calls
    r = scored[0]
    assert r["groundedness"]["score"] == 5.0 and r["groundedness"]["result"] == "pass"
    assert r["relevance"]["result"] == "fail"
    assert r["fluency"] == {"score": None, "result": "error", "reason": "RuntimeError"}
    summary = json.loads((out / "summary.json").read_text(encoding="utf-8"))
    assert summary["lines"] == 5
    assert summary["by_metric"]["groundedness"] == {"n": 5, "mean": 5.0, "pass_rate": 1.0, "errors": 0,
                                                    "not_applicable": 0, "threshold": 3}
    assert summary["by_metric"]["relevance"]["pass_rate"] == 0.0
    assert summary["by_metric"]["fluency"]["errors"] == 5 and summary["by_metric"]["fluency"]["mean"] is None
    assert set(summary["by_kind"]) == {"model"} and summary["by_kind"]["model"]["n"] == 5
    assert set(summary) >= {"created_utc", "source", "judge_model", "evaluators", "by_trigger", "by_mode"}
    report = (out / "report.md").read_text(encoding="utf-8")
    assert "| groundedness | 5 | 5.0 | 100.0% | 0 |" in report and "## By trigger" in report


def test_lines_can_come_from_cosmos_outboxes(moments, clock):
    store, rows = published(moments, clock)
    got = asyncio.run(Q.from_cosmos(["SYN-1017"], include_templates=False, store=store))
    expected = [r for row in rows for r in Q.lines_of(row["moment"], row["intent"], include_templates=False)]
    assert sorted(x["sample_id"] for x in got) == sorted(x["sample_id"] for x in expected) and got
