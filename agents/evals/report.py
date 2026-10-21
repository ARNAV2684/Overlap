# report.py — The evaluation report
#
# Purpose: one report per review round from the bench: detection recall, storyline hits against controls, numeric
#          accuracy with template and suppression rates, fault-injection results, latency, and (when filled) the
#          gold-set score
# Inputs:  bench results (template bench, optional model bench), optional run_match reports, live match ids
# Outputs: report.md and summary.json
# Spec:    agents/specs/evaluation.md §1–§5
#
#   uv run python -m evals.report --bench <dir>/matches --model-bench <dir>/matches --out evals/results/round-1

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from pathlib import Path

from evals import fault_injection, latency, numeric_accuracy, recall


def storyline_rows(results: list[dict]) -> list[dict]:
    """Each storyline match against its control (same clubs and seed, no storyline): did a moment that shows the
    storyline fire for the storyline's team within its window?"""
    by_seed = {}
    for r in results:
        by_seed.setdefault((r["evaluator"]["seed"], json.dumps(r.get("teams"), sort_keys=True)), []).append(r)
    rows = []
    for group in by_seed.values():
        story = next((r for r in group if r["evaluator"]["storylines"]), None)
        control = next((r for r in group if not r["evaluator"]["storylines"]), None)
        if story is None:
            continue
        for s in story["evaluator"]["storylines"]:
            moments = [row["moment"] for row in story["moments"]]
            hit = recall.storyline_hits(s, moments, s["team_id"])
            ctrl = recall.storyline_hits(s, [row["moment"] for row in control["moments"]], s["team_id"]) \
                if control else None
            rows.append({"match_id": story["match_id"], "control_id": control["match_id"] if control else None,
                         **hit, "control_hit": ctrl["hit"] if ctrl else None})
    return rows


def build(bench: list[dict], model_bench: list[dict], runs: list[dict], live: list[dict]) -> dict:
    detection = recall.sum_detection([recall.detection(r["evaluator"]["events"], [x["moment"] for x in r["moments"]])
                                      for r in bench])
    stories = storyline_rows(bench)
    triggered = [s for s in stories if s["triggered"] and s["effect"]]
    summary = {
        "matches": len(bench), "moments": sum(len(r["moments"]) for r in bench),
        "detection": detection,
        "storylines": {"rows": stories, "triggered": len(triggered), "configured": len(stories),
                       "hit": sum(s["hit"] for s in triggered),
                       "control_hit": sum(bool(s["control_hit"]) for s in triggered)},
        "numeric_template_bench": numeric_accuracy.overall([numeric_accuracy.match_numbers(r) for r in bench]),
        "numeric_model_bench": numeric_accuracy.overall([numeric_accuracy.match_numbers(r) for r in model_bench])
        if model_bench else None,
        "faults": {k: v for k, v in fault_injection.run(bench).items() if k != "rows"},
        "fault_rows": fault_injection.run(bench)["rows"],
        "latency": {"template_bench": latency.bench(bench), "model_bench": latency.bench(model_bench)
                    if model_bench else None, "model_runs": latency.model_runs(runs) if runs else None,
                    "live": live},
        "model_runs": [{"match_id": r["match_id"], "lines": sum(r["lines"].values()),
                        "verified": sum(n for k, n in r["lines"].items() if k.endswith("verified")),
                        "wrong_numbers": r["wrong_numbers"]} for r in runs],
    }
    return summary


def markdown(s: dict) -> str:
    def pct(x):
        return "N/A" if x is None else f"{x * 100:.1f}%"
    out = ["# Evaluation report — round 1", "",
           (f"Bench: {s['matches']} generated matches ({s['moments']} moments): six storylines on two seeds each, and "
           "the same clubs and seeds without the storyline as controls. Stats engine replay → the seven agents → "
           "independent re-check. Answer keys were used only here, never by an agent."), "",
           "## Detection recall (independent labels from the event log)", "",
           "| Trigger | Eligible | Detected | Extra | Recall |", "|---|---|---|---|---|"]
    for trig, v in s["detection"].items():
        out.append(f"| {trig} | {v['eligible'] if v['eligible'] is not None else 'not labelled'} | {v['detected']} | "
                   f"{v['extra'] if v['extra'] is not None else '—'} | {pct(v['recall'])} |")
    st = s["storylines"]
    out += ["", ("Big chance needs the xG model and momentum and pressing need the engine's own metrics, so they have "
                "no independent label (recall N/A); the storyline comparison below covers them."), "",
            "## Storylines against controls", "",
            (f"A storyline counts when the generator measured its effect in the data; it is caught when a moment that "
            f"shows it fires for its team between its onset and its end (or full strength) plus the answer key's "
            f"allowance. Caught: **{st['hit']} of {st['triggered']}** storylines whose effect showed (of "
            f"{st['configured']} configured); the same window in the control match fired in {st['control_hit']} of "
            f"{st['triggered']}."), "",
            "| Match | Storyline | Team | Caught | First moment | Control | Control fired |", "|---|---|---|---|---|---|---|"]
    for r in st["rows"]:
        note = "" if r["triggered"] and r["effect"] else " (effect not shown in the data; not counted)"
        out.append(f"| {r['match_id']} | {r['storyline']}{note} | "
                   f"{r['team_id']} | {'yes' if r['hit'] else 'no'} | {r['first'] or '—'} | {r['control_id']} | "
                   f"{'yes' if r['control_hit'] else 'no'} |")
    for name, key in (("Templates (provider off), all matches", "numeric_template_bench"),
                      ("Local model (phi-4-mini), subset", "numeric_model_bench")):
        n = s[key]
        if not n:
            continue
        out += ["", f"## Numeric accuracy — {name}", "",
                (f"- Published lines: {n['published_lines']} (+ {n['recap_lines']} recap lines); **wrong numbers: "
                f"{n['wrong_numbers']}**"),
                (f"- Verified {pct(n['rates']['verified'])}, template {pct(n['rates']['template'])}; moments "
                f"suppressed {pct(n['rates']['suppressed_moments'])} ({n['suppressed']}); lines dropped for a "
                f"language: {n['dropped_lines']}")]
    if s["model_runs"]:
        out += ["", "## Local model runs on played matches (M4)", "", "| Match | Lines | Verified | Wrong |",
                "|---|---|---|---|"]
        out += [f"| {r['match_id']} | {r['lines']} | {r['verified']} | {r['wrong_numbers']} |" for r in s["model_runs"]]
    f = s["faults"]
    out += ["", "## Fault injection (code check)", "",
            f"{f['cases']} labelled lines on real moments from {f['matches']} matches.", "",
            "| Kind | Cases | Flagged | Code-checkable | Caught by code |", "|---|---|---|---|---|"]
    for kind in ("valid", "numeric", "meaning"):
        k = f[kind]
        out.append(f"| {kind} | {k['cases']} | {k['flagged']} | {k['code_checkable']} | {k['code_caught']} |")
    out += ["", (f"False rejections of valid lines: **{f['false_rejections']}**. Faults only the model meaning check "
                "can judge are listed below as code-blind."), "", "| Kind | Fault | Caught | Problem | Line |",
            "|---|---|---|---|---|"]
    out += [f"| {r['kind']} | {r['fault']}{' (code-blind)' if r['code_blind'] else ''} | "
            f"{'yes' if r['caught'] else 'no'} | {', '.join(r['problems']) or '—'} | {r['text']} |"
            for r in s["fault_rows"] if r["kind"] != "valid"]
    lat = s["latency"]
    out += ["", "## Latency", "", "| Path | n | p50 s | p95 s | max s |", "|---|---|---|---|---|"]
    rows = [("Bench, template moments", lat["template_bench"]["template_moments"])]
    if lat["model_bench"]:
        rows.append(("Bench, model moments (local)", lat["model_bench"]["model_moments"]))
    if lat["model_runs"]:
        rows.append(("Played matches, model moments (local)", lat["model_runs"]))
    rows += [(f"Live {x['match_id']}: moment written → card sent", x["moment_to_send_s"]) for x in lat["live"]]
    out += [f"| {name} | {v['n']} | {v['p50']} | {v['p95']} | {v['max']} |" for name, v in rows]
    out += ["", ("Live figures use Cosmos `_ts` (whole seconds); a send is service acceptance, not display. Local model "
                "latency is a laptop GPU and far above the 8 s target; the target applies to the Azure model (M7)."),
            ""]
    return "\n".join(out)


def _load(folder: Path | None) -> list[dict]:
    return [json.loads(p.read_text(encoding="utf-8")) for p in sorted(folder.glob("*.json"))] if folder else []


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="report")
    ap.add_argument("--bench", type=Path, required=True)
    ap.add_argument("--model-bench", type=Path)
    ap.add_argument("--runs", type=Path, nargs="*", default=[], help="run_match.py reports")
    ap.add_argument("--live", nargs="*", default=[], help="live match ids in the local Cosmos")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    runs = [json.loads(p.read_text(encoding="utf-8")) for p in args.runs]
    live = [asyncio.run(latency.live(m)) for m in args.live]
    summary = build(_load(args.bench), _load(args.model_bench), runs, live)
    args.out.mkdir(parents=True, exist_ok=True)
    (args.out / "summary.json").write_text(json.dumps(summary, indent=1, ensure_ascii=False), encoding="utf-8")
    (args.out / "report.md").write_text(markdown(summary), encoding="utf-8")
    print(args.out / "report.md")
    return 0


if __name__ == "__main__":
    sys.exit(main())
