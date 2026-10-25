# fault_injection.py — Fault injection eval
#
# Purpose: a labelled set of at least 30 lines on real bench moments — valid lines, numeric/schema faults and
#          meaning/context faults — and how many the code check catches, plus false rejections of valid lines
# Inputs:  bench results (real moments from at least three matches)
# Outputs: per case: kind, fault, caught; catch rate per kind; false rejections
# Spec:    agents/specs/evaluation.md §2; agents/specs/fact-checking.md §3
#
# Faults the code can't judge (a plausible but unsupported tactical claim) are kept in the set and reported as
# "model check only", so the code's catch rate is not overstated.

from __future__ import annotations

import copy

from fact_checker import core, numeric_check
from fallbacks import fact_map, team_name, template_line


def _first(moments: list[dict], trigger: str) -> dict | None:
    return next((m for m in moments if m["evidence"]["trigger"] == trigger), None)


def _mutate(line: dict, text: str | None = None, claims: list | None = None) -> dict:
    out = copy.deepcopy(line)
    if text is not None:
        out["text"] = text
    if claims is not None:
        out["claims"] = claims
    return out


def cases(results: list[dict]) -> list[dict]:
    """Build the labelled set from real moments of the bench (valid, numeric, meaning)."""
    by_match = [[r["moment"] for r in res["moments"]] for res in results]
    valid, numeric, meaning = [], [], []
    for moments in by_match:
        for m in moments:
            wanted = m["evidence"]["trigger"] in ("goal", "shot_cluster", "red_card", "press_change",
                                                  "momentum_swing", "big_chance")
            repeat = any(v["moment"]["match_id"] == m["match_id"] and v["moment"]["evidence"]["trigger"] ==
                         m["evidence"]["trigger"] for v in valid)
            if len(valid) < 12 and wanted and not repeat:
                valid.append({"kind": "valid", "fault": "template", "moment": m,
                              "line": core(template_line(m, "analyst"))})
    pool = [m for ms in by_match for m in ms]
    goal, cluster, red = _first(pool, "goal"), _first(pool, "shot_cluster"), _first(pool, "red_card")
    swing, press = _first(pool, "momentum_swing"), _first(pool, "press_change")
    big = _first(pool, "big_chance")

    def add(bucket, fault, moment, text=None, claims=None, mode="analyst"):
        if moment is not None:
            base = core(template_line(moment, mode))
            bucket.append({"kind": "numeric" if bucket is numeric else "meaning", "fault": fault, "moment": moment,
                           "line": _mutate(base, text, claims)})

    if goal:
        f = fact_map(goal)
        tg, og = f["team_goals_match"]["value"], f["opponent_goals_match"]["value"]
        team = team_name(goal)
        add(numeric, "wrong_value", goal, claims=[{**c, "value": c["value"] + 1} if i == 0 else c for i, c in
                                                  enumerate(core(template_line(goal, "analyst"))["claims"])])
        add(numeric, "score_swapped", goal, text=f"{team} score. {og}–{tg}.", claims=[
            {"key": "opponent_goals_match", "value": og}, {"key": "team_goals_match", "value": tg}], mode="casual")
        add(numeric, "xg_as_percent", goal, text=f"Goal for {team}: a {round(f['shot_xg']['value'] * 100)}% chance.",
            claims=[{"key": "shot_xg", "value": round(f["shot_xg"]["value"] * 100)}])
        add(meaning, "penalty_wording", goal, text=f"{team} score from the spot. {tg}–{og}.",
            claims=[{"key": "team_goals_match", "value": tg}, {"key": "opponent_goals_match", "value": og}],
            mode="casual")
        add(meaning, "hat_trick_claim", goal, text=f"A hat-trick for {team}! {tg}–{og}.",
            claims=[{"key": "team_goals_match", "value": tg}, {"key": "opponent_goals_match", "value": og}],
            mode="casual")
    if cluster:
        team = team_name(cluster)
        n = fact_map(cluster)["shots_last_5min"]["value"]
        add(numeric, "missing_claim", cluster, text=f"{team} have taken {n} shots in the last 5 minutes.",
            claims=[{"key": "shots_last_5min", "value": n}], mode="casual")
        add(numeric, "number_word", cluster, text=f"{team} have taken three shots in the last 5 minutes.",
            claims=[{"key": "window_duration_min", "value": 5}], mode="casual")
        add(numeric, "context_number", cluster, text=f"{team} have taken {n} shots in the last 5 minutes, 14 today.",
            claims=[{"key": "shots_last_5min", "value": n}, {"key": "window_duration_min", "value": 5}],
            mode="casual")
        add(numeric, "duplicate_claim", cluster, claims=[
            {"key": "shots_last_5min", "value": n}, {"key": "shots_last_5min", "value": n}], mode="casual")
        add(numeric, "unknown_fact", cluster, claims=[
            {"key": "shots_last_5min", "value": n}, {"key": "shots_last_10min", "value": 5}], mode="casual")
        add(meaning, "cluster_dominance", cluster, text=f"{team} dominate: {n} shots in the last 5 minutes.",
            claims=[{"key": "shots_last_5min", "value": n}, {"key": "window_duration_min", "value": 5}],
            mode="casual")
        add(meaning, "other_club", cluster, text=f"Harbourside City have taken {n} shots in the last 5 minutes.",
            claims=[{"key": "shots_last_5min", "value": n}, {"key": "window_duration_min", "value": 5}],
            mode="casual")
        add(meaning, "unsupported_tactic", cluster,
            text=f"{team} changed their shape and have taken {n} shots in the last 5 minutes.",
            claims=[{"key": "shots_last_5min", "value": n}, {"key": "window_duration_min", "value": 5}],
            mode="casual")
    if red:
        team = team_name(red)
        n = fact_map(red)["team_players_on_pitch"]["value"]
        add(numeric, "down_to_wrong", red, text=f"{team} are down to {n - 1}.",
            claims=[{"key": "team_players_on_pitch", "value": n - 1}], mode="casual")
        add(meaning, "card_reason", red, text=f"{team} are down to {n} after a second yellow.",
            claims=[{"key": "team_players_on_pitch", "value": n}], mode="casual")
    if swing:
        # the analyst line carries the numbers these faults tamper with (casual says it in words)
        line = core(template_line(swing, "analyst"))
        add(meaning, "possession", swing, text=line["text"].replace("attacking actions", "possession"),
            claims=line["claims"], mode="analyst")
        add(numeric, "percent_dropped", swing, text=line["text"].replace("%", "", 1), claims=line["claims"],
            mode="analyst")
    if press:
        line = core(template_line(press, "analyst"))
        flipped = line["text"].replace("harder", "TMP").replace("less", "harder").replace("TMP", "less")
        add(meaning, "press_direction", press, text=flipped.replace("up from", "TMP").replace(
            "down from", "up from").replace("TMP", "down from"), claims=line["claims"], mode="analyst")
        add(meaning, "press_intent", press, text=line["text"].replace(" are ", " look tired and are ", 1),
            claims=line["claims"], mode="analyst")
    if big:
        line = core(template_line(big, "casual"))
        add(meaning, "xg_verdict", big, text=line["text"].rstrip(".") + ". He should have scored.",
            claims=line["claims"], mode="casual")
        add(numeric, "too_precise", big, text=line["text"].replace(" m.", ".0 m."), claims=line["claims"],
            mode="casual")
    return valid + numeric + meaning


CODE_BLIND = {"unsupported_tactic"}                  # plausible claims only the model meaning check can judge


def run(results: list[dict]) -> dict:
    rows = []
    for c in cases(results):
        problems = numeric_check(c["line"], c["moment"])
        rows.append({"kind": c["kind"], "fault": c["fault"], "match_id": c["moment"]["match_id"],
                     "moment_id": c["moment"]["moment_id"], "text": c["line"]["text"], "caught": bool(problems),
                     "problems": problems[:3], "code_blind": c["fault"] in CODE_BLIND})
    out = {"cases": len(rows), "matches": len({r["match_id"] for r in rows}), "rows": rows}
    for kind in ("valid", "numeric", "meaning"):
        sel = [r for r in rows if r["kind"] == kind]
        code_sel = [r for r in sel if not r["code_blind"]]
        out[kind] = {"cases": len(sel), "flagged": sum(r["caught"] for r in sel),
                     "code_checkable": len(code_sel), "code_caught": sum(r["caught"] for r in code_sel)}
    out["false_rejections"] = out["valid"]["flagged"]
    return out
