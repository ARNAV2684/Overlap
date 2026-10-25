# single_vs_multi.py — One agent against the seven (D6)
#
# Purpose: run the same moments (a) through the full pipeline (spotter → analyst over MCP → narrator → fact-checker
#          with rewrites → translator → director) and (b) as a single agent: the narrator alone, with no analyst
#          context, no fact-checker and no rewrites, publishing what it writes; then judge every line both would
#          publish with the same independent code check
# Inputs:  the stats engine's fixture match SYN-1017 (moments and MCP fixture files), or recorded bench matches
# Outputs: <out>/summary.json, <out>/report.md, <out>/moments.json (every line, for audit)
# Spec:    agents/specs/evaluation.md §6
#
#   The deployed model (Azure OpenAI in Foundry, gpt-5-mini; billed, so it needs --allow-paid; az login locally):
#   OVERLAP_MODEL_PROVIDER=azure OVERLAP_AZURE_OPENAI_ENDPOINT=<endpoint> OVERLAP_AZURE_OPENAI_DEPLOYMENT=gpt-5-mini \
#   OVERLAP_REASONING_EFFORT=minimal OVERLAP_MODEL_TIMEOUT_S=6 \
#   uv run python -m evals.single_vs_multi --fixture --allow-paid --out evals/results/single-vs-multi-azure
#
#   A local model, free and repeatable (Foundry Local or any OpenAI-compatible server on this machine):
#   OVERLAP_MODEL_PROVIDER=local OVERLAP_LOCAL_MODEL_URL=http://127.0.0.1:<port>/v1 OVERLAP_LOCAL_MODEL=<id> \
#   OVERLAP_MODEL_TIMEOUT_S=120 OVERLAP_MOMENT_DEADLINE_S=900 \
#   uv run python -m evals.single_vs_multi --fixture --out evals/results/single-vs-multi-local
#
# Azure calls are refused unless --allow-paid is given; `off` is a dry run where both arms write nothing. Timeouts and
# the deadline come from the environment, so an Azure run uses the deployed values. English only, because the single agent writes English only; the
# translator is measured separately (evals/hindi_numbers.py). Both arms use the same model, the same narrator prompt
# and the same two-batch split, and run on the same moments: those the full pipeline admitted with the model. The
# judge is the deterministic code check (fact_checker.numeric_check, as run_match.recheck uses on outboxes): numbers
# against the evidence and the wording rules it can see. Meaning faults only a model can judge are not counted for
# either arm, so the single agent's figures are a floor.

from __future__ import annotations

import argparse
import asyncio
import dataclasses
import json
import sys
import tempfile
import time
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import narrator
import prompts
from config import Settings
from evals.latency import stats
from fact_checker import ALL_TRIGGERS_DONT, DONT, normalise, numbers, numeric_check
from fallbacks import fact_map, line_ids
from run_match import load_fixture, recheck
from runtime import Deps, agent_deps
from state import MemoryStore
from workflow import process_moment

UNVERIFIED_NUMBER = ("wrong_value", "text_differs", "unknown_fact", "numbers_without_claims", "score_not_from_facts",
                     "down_to_wrong", "too_precise", "unit_missing", "unit_wrong", "ordinal_wrong", "number_form",
                     "spelled_number")
UNSUPPORTED = ("penalty_wording", "press_direction", "momentum_direction",
               *sorted({code for rules in DONT.values() for _, _, code in rules} | {c for _, _, c in ALL_TRIGGERS_DONT}))


def kind(code: str) -> str:
    """unverified_number (the check can't tie a number to its fact at its value, order, unit and precision),
    unsupported (the do/don't wording rules, penalty and direction wording) or other (length, markup, internal ids,
    claims that show no number, and the name rule, which also refuses an ordinary capitalised opener like "Press")."""
    head = code.split(":", 1)[0]
    return "unverified_number" if head in UNVERIFIED_NUMBER else "unsupported" if head in UNSUPPORTED else "other"


def absent_numbers(text: str, moment: dict) -> list[str]:
    """Numbers in the text that the moment's evidence never states, neither as a fact's value nor in a fact's label
    (the window lengths live there: "in the 10 minutes before that"): wrong whatever they meant to say. A lower bound
    on wrong numbers (a right value in the wrong place is not caught here; the code check catches it)."""
    facts = fact_map(moment).values()
    values = {float(f["value"]) for f in facts} | {
        float(t["text"]) for f in facts for t in numbers(normalise(f.get("label") or "", "en"))[0]}
    return [t["text"] for t in numbers(normalise(text, "en"))[0] if float(t["text"]) not in values]


def judged(text: str, problems: list[str], moment: dict) -> dict:
    kinds, absent = {kind(p) for p in problems}, absent_numbers(text, moment)
    return {"text": text, "problems": problems, "absent": absent, "wrong_number": bool(absent),
            "unverified_number": "unverified_number" in kinds, "unsupported": "unsupported" in kinds,
            "other": "other" in kinds}


@dataclass
class SingleAgent:
    """What the narrator's drafting step needs from a run: the moment and one model call. No job, no stages."""
    moment: dict
    models: Any
    settings: Settings
    calls: list[dict] = field(default_factory=list)

    async def ask(self, agent: str, payload: dict, schema: Any) -> Any:
        from models import ModelFailed
        clock = getattr(self.models, "clock", time.time)
        try:
            result = await self.models.ask(agent, prompts.instructions(agent), payload, schema,
                                           match_id=self.moment["match_id"],
                                           moment_id=f"single:{self.moment['moment_id']}",
                                           deadline_utc=clock() + self.settings.moment_deadline_s)
        except ModelFailed as e:
            self.calls.append({"agent": agent, "ok": False, "reason": e.reason})
            raise
        self.calls.append({"agent": agent, "ok": True})
        return result


def _rewritten(rounds: list[dict]) -> tuple[int, int, int]:
    """Lines sent back to the narrator, lines the meaning check failed, lines the code check failed (all attempts)."""
    rewrites = meaning_fail = code_fail = 0
    for k, r in enumerate(rounds):
        numeric = r.get("numeric") or {}
        meaning = r.get("meaning") if isinstance(r.get("meaning"), dict) else {}
        bad_code = {i for i, p in numeric.items() if p}
        bad_meaning = {i for i in numeric if i in meaning and not meaning[i]["pass"]}
        code_fail += len(bad_code)
        meaning_fail += len(bad_meaning)
        if k < len(rounds) - 1:
            rewrites += len(bad_code | bad_meaning)
    return rewrites, meaning_fail, code_fail


async def full_arm(m: dict, deps: Deps) -> dict:
    start = time.perf_counter()
    result = await process_moment(m, deps)
    seconds = time.perf_counter() - start
    job = (await deps.store.read(m["match_id"], f"job:{m['id']}"))[0]
    out = job.get("stage_outputs", {})
    row = {"status": result["status"], "reason": result.get("reason"), "seconds": round(seconds, 3),
           "model": bool((out.get("spotter") or {}).get("model")),
           "calls": sum(len(v.get("calls", [])) for v in out.values() if isinstance(v, dict))}
    if result["status"] != "delivery_pending":
        return row
    analyst, drafted, checked = out["analyst"], out["narrator"], out["fact_checker"]
    first = (checked.get("rounds") or [{}])[0].get("numeric") or {}
    rewrites, meaning_fail, code_fail = _rewritten(checked.get("rounds") or [])
    intent = (await deps.store.read(m["match_id"], f"outbox:{m['id']}"))[0]["intent"]
    wrong = {w["text"]: w["problems"] for w in recheck(intent, m)}
    status = checked["status"]
    row.update(
        context=analyst.get("context"), tools=[t["tool"] for t in analyst.get("tools", []) if t["status"] == "ok"],
        interpretation=analyst.get("interpretation"),
        written=len(drafted.get("model_ids", [])),
        first_draft={i: judged(next(ln["text"] for ln in drafted["lines"] if ln["id"] == i), first.get(i, []), m)
                     for i in drafted.get("model_ids", [])},
        rewritten=rewrites, meaning_rejected=meaning_fail, code_rejected=code_fail,
        verified=sum(st["verified"] for st in status.values()),
        template=sum(st["fallback"] and "dropped" not in st for st in status.values()),
        dropped=sum("dropped" in st for st in status.values()),
        published={_line_id(a): judged(a["line"]["text"], wrong.get(a["line"]["text"], []), m)
                   | {"verified": a["overlay"]["verified"]} for a in intent["audiences"] if a["lang"] == "en"})
    return row


def _line_id(audience: dict) -> str:
    target = audience.get("club") or audience.get("player")
    return f"{audience['mode']}:{target}" if target else audience["mode"]


async def single_arm(m: dict, deps: Deps) -> dict:
    agent = SingleAgent(m, deps.models, deps.settings)
    ids = line_ids(m, deps.settings.modes, deps.settings.max_player_lines)
    start = time.perf_counter()
    got = await narrator.draft(agent, ids, None, None)
    seconds = time.perf_counter() - start
    return {"seconds": round(seconds, 3), "calls": len(agent.calls), "requested": len(ids), "written": len(got),
            "published": {i: judged(ln["text"], numeric_check(ln, m), m) for i, ln in got.items()}}


async def compare(moments: list[dict], deps: Deps, *, on_moment: Callable[[dict], None] | None = None) -> list[dict]:
    rows = []
    for m in moments:
        if on_moment:
            on_moment(m)
        full = await full_arm(m, deps)
        row = {"moment_id": m["id"], "trigger": m["evidence"]["trigger"], "full": full}
        if full["status"] == "delivery_pending" and full["model"]:
            row["single"] = await single_arm(m, deps)
        rows.append(row)
        s = row.get("single")
        print(f"{m['id']} {row['trigger']:<15} full {full['status']:<16} {full['seconds']:6.1f}s"
              + (f" | single {s['seconds']:6.1f}s wrote {s['written']}/{s['requested']}" if s else ""), flush=True)
    return rows


def _lines(rows: list[dict], arm: str, key: str) -> list[dict]:
    return [ln for r in rows if "single" in r for ln in (r[arm].get(key) or {}).values()]


def _count(lines: list[dict]) -> dict:
    return {"lines": len(lines), "wrong_number": sum(ln["wrong_number"] for ln in lines),
            "unverified_number": sum(ln["unverified_number"] for ln in lines),
            "unsupported": sum(ln["unsupported"] for ln in lines), "other": sum(ln["other"] for ln in lines),
            "any_problem": sum(bool(ln["problems"]) for ln in lines),
            "absent": dict(Counter(n for ln in lines for n in ln["absent"]).most_common(12)),
            "codes": dict(Counter(p.split(":")[0] for ln in lines for p in ln["problems"]).most_common(12))}


def rejudge(rows: list[dict], moments: list[dict]) -> list[dict]:
    """Saved rows (moments.json) judged again from their texts and stored problems, for a report from an old run."""
    by_id = {m["id"]: m for m in moments}
    for r in rows:
        m = by_id[r["moment_id"]]
        for arm, key in (("single", "published"), ("full", "published"), ("full", "first_draft")):
            lines = (r.get(arm) or {}).get(key) or {}
            for i, ln in lines.items():
                lines[i] = {**ln, **judged(ln["text"], ln["problems"], m)}
    return rows


def summarise(rows: list[dict], settings: Settings) -> dict:
    compared = [r for r in rows if "single" in r]
    single, full = [r["single"] for r in compared], [r["full"] for r in compared]
    s_pub, f_pub, f_first = _lines(rows, "single", "published"), _lines(rows, "full", "published"), _lines(
        rows, "full", "first_draft")
    examples = []
    bad = [(r, i, ln) for r in compared for i, ln in r["single"]["published"].items() if ln["problems"]]
    for r, i, ln in sorted(bad, key=lambda x: (not x[2]["wrong_number"], not x[2]["unsupported"]))[:10]:
        examples.append({"moment_id": r["moment_id"], "trigger": r["trigger"], "line": i, "single": ln["text"],
                         "absent": ln["absent"], "problems": ln["problems"],
                         "full": (r["full"]["published"].get(i) or {}).get("text"),
                         "full_verified": (r["full"]["published"].get(i) or {}).get("verified")})
    return {
        "provider": settings.provider, "model": settings.model_name, "languages": list(settings.languages),
        "request_timeout_s": settings.request_timeout_s, "moment_deadline_s": settings.moment_deadline_s,
        "reasoning_effort": settings.reasoning_effort if settings.provider == "azure" else None,
        "moments": len(rows), "compared": len(compared),
        "skipped": dict(Counter(r["full"]["status"] if r["full"]["status"] != "delivery_pending" else "no_model"
                                for r in rows if "single" not in r)),
        "single": {"requested": sum(x["requested"] for x in single), "written": sum(x["written"] for x in single),
                   "published": _count(s_pub), "refused": 0, "rewritten": 0,
                   "calls_per_moment": round(sum(x["calls"] for x in single) / len(single), 2) if single else None,
                   "latency_s": stats([x["seconds"] for x in single])},
        "full": {"written": sum(x["written"] for x in full), "first_draft": _count(f_first),
                 "code_rejected": sum(x["code_rejected"] for x in full),
                 "meaning_rejected": sum(x["meaning_rejected"] for x in full),
                 "rewritten": sum(x["rewritten"] for x in full), "verified": sum(x["verified"] for x in full),
                 "template": sum(x["template"] for x in full), "dropped": sum(x["dropped"] for x in full),
                 "published": _count(f_pub),
                 "context_ok": sum(x["context"] == "ok" for x in full),
                 "interpretations": sum(bool(x["interpretation"]) for x in full),
                 "calls_per_moment": round(sum(x["calls"] for x in full) / len(full), 2) if full else None,
                 "latency_s": stats([x["seconds"] for x in full])},
        "examples": examples}


def markdown(s: dict) -> str:
    def pct(n, d):
        return "N/A" if not d else f"{n / d * 100:.1f}%"
    one, full = s["single"], s["full"]
    sp, fp, ff = one["published"], full["published"], full["first_draft"]
    lat_1, lat_7 = one["latency_s"], full["latency_s"]
    azure = s["provider"] == "azure"
    where = "the deployed Azure model" if azure else "a local model on a laptop GPU"
    setup = (f"reasoning `{s['reasoning_effort']}`, " if azure else "") + (
        f"{s['request_timeout_s']} s per call, {s['moment_deadline_s']} s per moment")
    out = ["# Single agent against the seven (D6)", "",
           (f"{s['compared']} moments of the fixture match SYN-1017 (of {s['moments']}; skipped: "
            f"{s['skipped'] or 'none'}), model `{s['model']}` ({s['provider']}; {setup}), English. "
            "**Single agent:** the narrator alone — same model, prompt and two-batch split, no analyst context, no "
            "fact-checker, no rewrites, publishes what it writes. **Seven agents:** the full pipeline as deployed. "
            "Every published line is judged against the moment's evidence by the same deterministic code check."), "",
           "| Measure | Single agent | Seven agents |", "|---|---|---|",
           f"| Lines published | {sp['lines']} (of {one['requested']} asked) | {fp['lines']} |",
           (f"| Lines with a wrong number (a value found nowhere in the evidence) | **{sp['wrong_number']}** "
            f"({pct(sp['wrong_number'], sp['lines'])}) | **{fp['wrong_number']}** |"),
           (f"| Lines with an unverified number (not tied to its fact at its value, order, unit and precision) | "
            f"{sp['unverified_number']} ({pct(sp['unverified_number'], sp['lines'])}) | {fp['unverified_number']} |"),
           (f"| Lines with an unsupported claim (wording rules) | **{sp['unsupported']}** "
            f"({pct(sp['unsupported'], sp['lines'])}) | **{fp['unsupported']}** |"),
           (f"| Lines the fact-checker's code check would refuse | {sp['any_problem']} "
            f"({pct(sp['any_problem'], sp['lines'])}) | {fp['any_problem']} |"),
           (f"| Lines refused or rewritten | 0 (nothing checks) | {full['rewritten']} rewritten, "
            f"{full['template']} replaced by the checked stat line, {full['dropped']} dropped |"),
           f"| Published lines written by the model and verified | — | {full['verified']} |",
           f"| Model calls per moment | {one['calls_per_moment']} | {full['calls_per_moment']} |",
           f"| Latency per moment p50 / p95 (s) | {lat_1['p50']} / {lat_1['p95']} | {lat_7['p50']} / {lat_7['p95']} |",
           "", "## Inside the pipeline", "",
           (f"- The narrator's first draft, written *with* the analyst's interpretation (MCP context read for "
            f"{full['context_ok']} moments, an interpretation for {full['interpretations']}): {ff['lines']} lines, "
            f"{ff['wrong_number']} with a wrong number, {ff['unverified_number']} with an unverified number, "
            f"{ff['unsupported']} with an unsupported claim."),
           "- Wrong values the single agent published: " + (", ".join(f"`{k}` ×{v}" for k, v in sp["absent"].items())
                                                           or "none"),
           (f"- Fact-checker, over all attempts: {full['code_rejected']} code-check failures, "
            f"{full['meaning_rejected']} meaning-check failures; {full['rewritten']} lines sent back for a rewrite."),
           "- Problem codes, single agent: " + (", ".join(f"`{k}` {v}" for k, v in sp["codes"].items()) or "none"),
           "- Problem codes, seven agents (published): " + (", ".join(f"`{k}` {v}" for k, v in fp["codes"].items())
                                                           or "none"), "",
           "## Examples (single agent's line, then what the pipeline published for the same audience)", ""]
    for e in s["examples"]:
        wrong = f"not in the evidence: {', '.join(e['absent'])}; " if e["absent"] else ""
        out.append(f"- **{e['moment_id']} {e['trigger']} · {e['line']}** — single: “{e['single']}” "
                   f"({wrong}`{', '.join(e['problems'])}`); seven agents "
                   f"({'verified' if e['full_verified'] else 'stat line'}): “{e['full']}”")
    if not s["examples"]:
        out.append("- none")
    out += ["", "## What this does and does not show", "",
            ("The judge is code, not a model. A *wrong number* has a value that is no fact's value in the moment, so "
             "it is wrong whatever it meant (a lower bound: a right value in the wrong place is not counted there). "
             "An *unverified number* is one the fact-checker could not tie to its fact: it may be true, such as a "
             "score told from the trailing side (0–2) or a claim attached to the wrong fact, but nothing checked it, "
             "and the pipeline never publishes one. *Unsupported claims* are the wording rules the code can see "
             "(a red card's reason, a penalty called scored, pressure read into a shot cluster, possession in a "
             "momentum line, the rest of the do/don't table). The name rule (every capitalised word must be a name "
             "in the match) is counted only under refused, because it also catches ordinary openers such as "
             "\"Press\" or \"Pressing\". Meaning only a reader can judge is not counted for either arm, so "
             "the single agent's figures are a floor. "
             + ("Latency is measured from this machine to the Azure model (Sweden Central), so it includes the "
                "network; the deployed agents run in the same region as the model." if azure else
                "Latency is a laptop GPU running a small local model, not the Azure model; compare the two columns "
                "with each other, not with the 8 s target.")), "",
            "## Summary for docs/evaluation.md", "",
            (f"On {s['compared']} moments run both ways with {where} (`{s['model']}`), a single narrator agent "
             f"published {sp['lines']} lines: {sp['wrong_number']} with a number found nowhere in the evidence, "
             f"{sp['unsupported']} with an unsupported claim, and {sp['any_problem']} that the fact-checker's code "
             f"check would have refused. The seven-agent pipeline published {fp['lines']} lines with "
             f"{fp['wrong_number']}, {fp['unsupported']} and {fp['any_problem']}; {full['verified']} were the "
             f"model's own lines verified by the fact-checker. The fact-checker sent {full['rewritten']} lines back for a rewrite and "
             f"replaced {full['template']} with the checked stat line, at {full['calls_per_moment']} model calls "
             f"per moment instead of {one['calls_per_moment']} (p50 {lat_7['p50']} s against {lat_1['p50']} s per "
             f"moment)."), ""]
    return "\n".join(out)


def bench_moments(folder: Path, cache: Path) -> tuple[list[dict], dict, Path]:
    """A recorded bench match through the stats engine (evals/bench.py), with its MCP fixture files."""
    from evals.bench import final_state, replay
    moments, totals = replay(folder, cache / folder.name)
    state = final_state(folder.name, totals)
    fixtures = cache / folder.name / "mcp"
    (fixtures / "match_state" / folder.name).mkdir(parents=True, exist_ok=True)
    for m in moments:
        (fixtures / f"{m['id']}.json").write_text(json.dumps(m), encoding="utf-8")
    (fixtures / "match_state" / folder.name / "state.json").write_text(json.dumps(state), encoding="utf-8")
    return moments, state, fixtures


def bench_settings(settings: Settings, fixtures: Path, moments: int) -> Settings:
    """Every admitted moment gets the model in both arms, and a slow model never trips the budget or the breaker."""
    return dataclasses.replace(
        settings, languages=("en",), skip_stale=False, spotter_rank=False, high_priority_reserve=0,
        max_model_jobs_per_match=moments + 1, max_calls_per_match=100 * (moments + 1),
        max_tokens_per_match=10 ** 9, model_breaker_failures=10 ** 6, mcp_source="fixture",
        mcp_fixture_dir=str(fixtures))


async def run_match(moments: list[dict], state: dict | None, settings: Settings) -> list[dict]:
    store = MemoryStore()
    for i, m in enumerate(moments):
        await store.create({**m, "_ts": i})
    if state is not None:
        store.states[moments[0]["match_id"]] = state
    deps = agent_deps(store, settings)
    try:
        return await compare(moments, deps)
    finally:
        await deps.models.close()


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="single_vs_multi")
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--fixture", action="store_true", help="the stats engine's fixture match SYN-1017")
    src.add_argument("--matches", type=Path, help="folder of recorded bench matches (needs stats/.venv)")
    src.add_argument("--from-rows", type=Path, help="rebuild the report from a saved moments.json (fixture match)")
    ap.add_argument("--only", nargs="*", help="only these match ids (with --matches)")
    ap.add_argument("--limit", type=int, help="first N moments per match")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--allow-paid", action="store_true", help="allow calls to the Azure model (billed)")
    args = ap.parse_args(argv)
    settings = Settings.from_env()
    if settings.provider == "azure" and not args.allow_paid:
        print("refusing: OVERLAP_MODEL_PROVIDER=azure is billed; pass --allow-paid, or use local (or off)")
        return 1
    matches = []
    if args.from_rows:
        directory = Path(tempfile.mkdtemp(prefix="overlap-fixture-"))
        moments, _ = load_fixture(directory)
        rows = rejudge(json.loads(args.from_rows.read_text(encoding="utf-8")), moments)
        return _write(args.out, rows, bench_settings(settings, Path("."), 0))
    if args.fixture:
        directory = Path(tempfile.mkdtemp(prefix="overlap-fixture-"))
        moments, state = load_fixture(directory)
        matches.append((moments, state, directory))
    else:
        cache = args.out / "replay"
        for folder in sorted(p for p in args.matches.iterdir() if (p / "summary.json").exists()
                             and (not args.only or p.name in args.only)):
            matches.append(bench_moments(folder, cache))
    rows = []
    for moments, state, fixtures in matches:
        moments = moments[:args.limit] if args.limit else moments
        rows += asyncio.run(run_match(moments, state, bench_settings(settings, fixtures, len(moments))))
    return _write(args.out, rows, bench_settings(settings, Path("."), 0))


def _write(out: Path, rows: list[dict], settings: Settings) -> int:
    summary = summarise(rows, settings)
    out.mkdir(parents=True, exist_ok=True)
    (out / "moments.json").write_text(json.dumps(rows, indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    (out / "report.md").write_text(markdown(summary), encoding="utf-8")
    print(out / "report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
