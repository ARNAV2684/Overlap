# gold.py — The gold set from Azeem's review
#
# Purpose: turn a filled review sheet into a gold set (moment, expected decision or acceptable wording, reason), and
#          re-score any later run against it, so every prompt or model change is checked against his judgement
# Inputs:  filled review CSVs (evals/review_sheet.py); bench results of the run to score
# Outputs: gold.json; a score: spotter agreement, accepted lines still produced, rejected lines produced again
# Spec:    agents/specs/evaluation.md §5
#
#   uv run python -m evals.gold import --sheets evals/review/round-1 --out evals/gold/round-1.json
#   uv run python -m evals.gold score --gold evals/gold/round-1.json --results <bench>/matches

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

KEEP, DROP, ACCEPT, REJECT = "keep", "drop", "accept", "reject"


def import_sheets(folder: Path) -> dict:
    """Rows with a verdict become gold items; blank rows are skipped and counted."""
    items, skipped = [], 0
    for path in sorted(folder.glob("*.csv")):
        with path.open(encoding="utf-8-sig", newline="") as f:
            for row in csv.DictReader(f):
                verdict = (row.get("verdict") or "").strip().lower()
                if verdict not in (KEEP, DROP, ACCEPT, REJECT):
                    skipped += 1
                    continue
                score = (row.get("score_1_5") or "").strip()
                items.append({"agent": row["agent"], "match_id": row["match_id"], "moment_id": row["moment_id"],
                              "trigger": row["trigger"], "mode": row.get("mode") or None,
                              "item": row["item"], "verdict": verdict, "reason": (row.get("reason") or "").strip(),
                              "score": int(score) if score.isdigit() and 1 <= int(score) <= 5 else None})
    return {"items": items, "skipped_rows": skipped}


def score(gold: dict, results: list[dict]) -> dict:
    """Agreement of a run with the gold set. Spotter: same keep/drop. Lines: accepted wording still produced is not
    required (wording may improve), but a rejected line must not be produced again."""
    spotter, produced = {}, set()
    for res in results:
        for row in res["moments"]:
            spot = (row["stages"].get("spotter") or {}).get("decision") or ""
            spotter[row["moment"]["moment_id"]] = KEEP if spot == "admit" else DROP
            for line in (row["stages"].get("fact_checker") or {}).get("lines", []):
                produced.add((row["moment"]["moment_id"], line["text"]))
        recap = (res.get("recap") or {}).get("intent")
        for a in (recap or {}).get("audiences", []):
            produced.add((recap["recap_id"], a["line"]["text"]))
    spot_items = [g for g in gold["items"] if g["agent"] == "spotter" and g["moment_id"] in spotter]
    agree = sum(spotter[g["moment_id"]] == g["verdict"] for g in spot_items)
    rejected = [g for g in gold["items"] if g["verdict"] == REJECT]
    repeated = [g for g in rejected if (g["moment_id"], g["item"]) in produced]
    scores = sorted(g["score"] for g in gold["items"] if g["score"] is not None)
    return {"spotter_items": len(spot_items), "spotter_agreement": round(agree / len(spot_items), 3)
            if spot_items else None,
            "rejected_lines": len(rejected), "rejected_lines_produced_again": len(repeated),
            "accepted_lines": sum(g["verdict"] == ACCEPT for g in gold["items"]),
            "median_score": scores[len(scores) // 2] if scores else None,
            "repeated": [{"moment_id": g["moment_id"], "item": g["item"], "reason": g["reason"]} for g in repeated]}


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(prog="gold")
    sub = ap.add_subparsers(dest="command", required=True)
    im = sub.add_parser("import")
    im.add_argument("--sheets", type=Path, required=True)
    im.add_argument("--out", type=Path, required=True)
    sc = sub.add_parser("score")
    sc.add_argument("--gold", type=Path, required=True)
    sc.add_argument("--results", type=Path, required=True)
    args = ap.parse_args(argv)
    if args.command == "import":
        gold = import_sheets(args.sheets)
        args.out.parent.mkdir(parents=True, exist_ok=True)
        args.out.write_text(json.dumps(gold, indent=1, ensure_ascii=False), encoding="utf-8")
        print(f"{len(gold['items'])} gold items, {gold['skipped_rows']} rows without a verdict")
        return 0
    gold = json.loads(args.gold.read_text(encoding="utf-8"))
    results = [json.loads(p.read_text(encoding="utf-8")) for p in sorted(args.results.glob("*.json"))]
    print(json.dumps(score(gold, results), indent=1, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    sys.exit(main())
