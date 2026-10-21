# numeric_accuracy.py — Numeric accuracy eval
#
# Purpose: every number on screen against the evidence, plus the rates that stop "suppress everything" from looking
#          accurate: published lines, wrong numbers (must be 0), verified, template, suppressed and dropped
# Inputs:  bench results (evals/bench.py): each moment's outbox and the independent re-check
# Outputs: counts and rates per match and overall
# Spec:    agents/specs/evaluation.md §2

from __future__ import annotations

from collections import Counter


def match_numbers(result: dict) -> dict:
    lines = Counter()
    wrong = 0
    status = Counter()
    suppressed = Counter()
    dropped = 0
    for row in result["moments"]:
        status[row["status"]] += 1
        if row["status"] == "suppressed":
            reason = row.get("reason") or ""
            suppressed["merged" if reason.startswith("merge_into") else reason.split(":")[0] or "other"] += 1
        wrong += len(row["wrong"])
        intent = row.get("intent")
        if not intent:
            continue
        dropped += len(intent.get("dropped", []))
        for a in intent["audiences"]:
            body = a["overlay"]
            lines["verified" if body["verified"] else "template" if body["fallback"] else "unverified"] += 1
    recap = result["recap"]
    recap_lines = len((recap.get("intent") or {}).get("audiences", []))
    wrong += len(recap["wrong"])
    return {"moments": len(result["moments"]), "status": dict(status), "suppressed": dict(suppressed),
            "lines": dict(lines), "recap_lines": recap_lines, "dropped_lines": dropped, "wrong_numbers": wrong}


def overall(per_match: list[dict]) -> dict:
    total = Counter()
    lines, status, suppressed = Counter(), Counter(), Counter()
    for m in per_match:
        total.update({k: m[k] for k in ("moments", "recap_lines", "dropped_lines", "wrong_numbers")})
        lines.update(m["lines"])
        status.update(m["status"])
        suppressed.update(m["suppressed"])
    published = sum(lines.values())
    return {**dict(total), "published_lines": published, "lines": dict(lines), "status": dict(status),
            "suppressed": dict(suppressed),
            "rates": {"verified": _rate(lines["verified"], published), "template": _rate(lines["template"], published),
                      "unverified": _rate(lines["unverified"], published),
                      "suppressed_moments": _rate(status["suppressed"], total["moments"]),
                      "wrong_numbers_per_line": _rate(total["wrong_numbers"], published)}}


def _rate(n: int, d: int) -> float | None:
    return round(n / d, 4) if d else None
