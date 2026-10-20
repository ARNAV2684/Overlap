# review_sheet.py — Azeem's review sheet (human in the loop)
#
# Purpose: one row per moment per agent for a football review: what the spotter decided, the analyst's reading, the
#          narrator's lines per mode, the director's visual, the recap — with blank columns for his verdict, reason
#          and a 1–5 score
# Inputs:  bench results (and model-run results when a model was on)
# Outputs: one CSV per agent (UTF-8 with BOM so Excel opens it), about 40–50 rows each, spread across triggers
# Spec:    agents/specs/evaluation.md §5
#
#   uv run python -m evals.review_sheet --results <bench>/matches --out evals/review/round-1
#
# Answer keys never appear on the sheet (the reviewer judges lines blind to them).

from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import defaultdict
from pathlib import Path

from director import VISUAL
from fallbacks import mode_of, target_of

ROWS_PER_AGENT = 48
COLUMNS = ["row_id", "agent", "match_id", "moment_id", "clock", "trigger", "team", "facts", "names", "mode", "for",
           "item", "verified", "verdict", "reason", "score_1_5"]
VERDICTS = {"spotter": "keep / drop", "analyst": "accept / reject", "narrator": "accept / reject",
            "director": "accept / reject", "recap_writer": "accept / reject"}


def _facts(m: dict) -> str:
    return "; ".join(f"{f['label']}: {f['value']}{' ' + f['unit'] if f.get('unit') else ''}"
                     for f in m["evidence"]["facts"])


def _team(m: dict) -> str:
    ctx = m["context"]["teams"]
    return next(ctx[s]["name"] for s in ("home", "away") if ctx[s]["team_id"] == m["evidence"]["team_id"])


def _names(m: dict, target: str | None = None) -> str:
    names = {p["player_id"]: p["name"] for p in m["context"].get("players") or []}
    teams = {m["context"]["teams"][s]["team_id"]: m["context"]["teams"][s]["name"] for s in ("home", "away")}
    return names.get(target) or teams.get(target) or ""


def _spread(rows: list[dict], n: int) -> list[dict]:
    """Up to n rows, taking from each trigger in turn so rare triggers are reviewed too."""
    by_trigger: dict[str, list[dict]] = defaultdict(list)
    for r in rows:
        by_trigger[r["trigger"]].append(r)
    out: list[dict] = []
    while len(out) < n and any(by_trigger.values()):
        for trig in sorted(by_trigger):
            if by_trigger[trig] and len(out) < n:
                out.append(by_trigger[trig].pop(0))
    return out


def build(results: list[dict]) -> dict[str, list[dict]]:
    per_agent: dict[str, list[dict]] = defaultdict(list)
    for res in results:
        for row in res["moments"]:
            m, st = row["moment"], row["stages"]
            base = {"match_id": m["match_id"], "moment_id": m["moment_id"], "clock": m["evidence"]["clock"],
                    "trigger": m["evidence"]["trigger"], "team": _team(m), "facts": _facts(m)}
            spot = st.get("spotter") or {}
            per_agent["spotter"].append({**base, "item": f"{spot.get('decision')} ({spot.get('reason')})"})
            analysis = (st.get("analyst") or {}).get("interpretation")
            if analysis:
                per_agent["analyst"].append({**base, "item": analysis})
            checked = st.get("fact_checker") or {}
            for line in checked.get("lines", []):
                if line["lang"] != "en":
                    continue
                mode, target = mode_of(line["id"]), target_of(line["id"])
                status = checked["status"].get(line["id"], {})
                per_agent["narrator"].append({**base, "mode": mode, "for": _names(m, target), "item": line["text"],
                                              "verified": "yes" if status.get("verified") else "template"})
            if row.get("intent"):
                vis = row["intent"]["visual"]
                per_agent["director"].append({**base, "item": f"{vis['component']} · highlight {vis['highlight']}"})
        recap = (res.get("recap") or {}).get("intent")
        if recap:
            for a in recap["audiences"]:
                if a["lang"] == "en":
                    per_agent["recap_writer"].append({
                        "match_id": res["match_id"], "moment_id": recap["recap_id"], "clock": "full time",
                        "trigger": "recap", "team": "", "facts": "", "mode": a["mode"],
                        "for": a.get("club") or a.get("player") or "", "item": a["line"]["text"],
                        "verified": "yes" if a["recap"]["verified"] else "template"})
    sheets = {}
    for agent, rows in per_agent.items():
        if agent == "director":                          # one row per trigger is enough to judge a fixed rule
            first: dict[str, dict] = {}
            for r in rows:
                first.setdefault(r["trigger"], r)
            rows = [first[t] for t in sorted(first) if t in VISUAL]
        chosen = _spread(rows, ROWS_PER_AGENT)
        sheets[agent] = [{"row_id": f"{agent}-{i:03d}", "agent": agent, "names": "", "mode": "", "for": "",
                          "verified": "", **r, "verdict": "", "reason": "", "score_1_5": ""}
                         for i, r in enumerate(chosen, 1)]
    return sheets


def write(sheets: dict[str, list[dict]], out: Path) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = []
    for agent, rows in sheets.items():
        path = out / f"{agent}.csv"
        with path.open("w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=COLUMNS, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)
        paths.append(path)
    (out / "README.md").write_text(_instructions(sheets), encoding="utf-8")
    return paths


def _instructions(sheets: dict[str, list[dict]]) -> str:
    lines = ["# Review round 1 — instructions", "",
             ("One file per agent. For each row fill `verdict`, a short `reason` and `score_1_5` (5 = exactly what a "
              "good broadcaster would say). Judge the line against the facts and names in the row only."), "",
             "| File | Rows | Verdict |", "|---|---|---|"]
    lines += [f"| `{a}.csv` | {len(rows)} | {VERDICTS[a]} |" for a, rows in sorted(sheets.items())]
    lines += ["", ("`verified = template` marks a labelled fallback line (no model wording). Round 1 runs on the "
                   "local model or templates (plumbing); round 2 repeats this on the Azure model."), ""]
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="review_sheet")
    ap.add_argument("--results", type=Path, required=True, help="folder of bench results (one JSON per match)")
    ap.add_argument("--out", type=Path, required=True)
    args = ap.parse_args(argv)
    results = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(args.results.glob("*.json"))]
    for path in write(build(results), args.out):
        print(path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
