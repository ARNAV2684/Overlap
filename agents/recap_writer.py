# recap_writer.py — Recap writer
#
# Purpose: at full time, write a short recap per mode from the match's moments and the final match_state; checked
#          and translated like any line
# Inputs:  the final match_state (§4.2) and every `kind = "moment"` document of the match, in id order
# Outputs: a recap "moment" (id RC-<match>, a fact pack built by code) and its lines {id, mode, lang, text, claims}
# Spec:    agents/specs/agents.md §7; CONTRACTS.md §10.6 (Recap)
#
# Citable numbers are only the recap pack's facts: final team totals from match_state and each scorer's goals. The
# moments are named in words (what happened, to whom); their clocks and storyline answer keys never reach the model.

from __future__ import annotations

from fallbacks import fmt, mode_of, target_of
from models import ModelFailed
from narrator import Lines, _accept, requested
from runtime import RunState

TOTALS = (("goals", None, 0), ("shots", None, 0), ("shots_on_target", None, 0), ("xg", "xG", 2),
          ("possession_pct", "%", 0), ("red_cards", None, 0))
LABEL = {"goals": "goals", "shots": "shots", "shots_on_target": "shots on target", "xg": "expected goals",
         "possession_pct": "possession share", "red_cards": "red cards"}


def recap_id(match_id: str) -> str:
    return "RC-" + match_id[4:]


def recap_moment(state: dict, moments: list[dict]) -> dict:
    """The recap's fact pack and context, shaped like a moment so the checks and the director treat it the same."""
    match_id = state["match_id"]
    first = moments[0] if moments else None
    teams = first["context"]["teams"] if first else {
        side: {"team_id": state["totals"][side]["team_id"], "name": state["totals"][side]["team_id"]}
        for side in ("home", "away")}
    facts = []
    for side in ("home", "away"):
        totals = state["totals"][side]
        for key, unit, decimals in TOTALS:
            value = totals.get(key)
            if not isinstance(value, int | float) or isinstance(value, bool):
                continue                                         # a missing value is left out, never zero
            value = round(float(value), decimals) if decimals else int(value)
            facts.append({"key": f"{side}_{key}", "value": value, "decimals": decimals,
                          **({"unit": unit} if unit else {}), "label": f"{teams[side]['name']} {LABEL[key]}"})
    players, scorers = [], []
    for pid, p in sorted((state.get("players") or {}).items()):
        goals = p.get("goals")
        if isinstance(goals, int) and goals > 0:
            scorers.append(pid)
            players.append({"player_id": pid, "name": p["name"], "pos": p["pos"]})
            facts.append({"key": f"goals:{pid}", "value": goals, "decimals": 0, "label": f"{p['name']} goals"})
    return {"id": recap_id(match_id), "moment_id": recap_id(match_id), "match_id": match_id, "kind": "recap",
            "schema_version": 1, "evidence_version": 1,
            "evidence": {"moment_id": recap_id(match_id), "match_id": match_id, "trigger": "recap",
                         "period": state.get("period", 2), "match_ms": state["source"]["match_ms"],
                         "clock": state.get("clock", ""), "team_id": teams["home"]["team_id"],
                         "player_ids": scorers, "event_ids": [],
                         "window": {"from_ms": 0, "to_ms": state["source"]["match_ms"]}, "facts": facts},
            "source": dict(state["source"]),
            "context": {"phase": "full_time", "teams": teams, "players": players},
            "story": [_story(m) for m in moments]}


def _story(m: dict) -> dict:
    """A moment in words for the recap: trigger, team and player names; no clock, no numbers."""
    e, ctx = m["evidence"], m["context"]
    team = next(ctx["teams"][s]["name"] for s in ("home", "away") if ctx["teams"][s]["team_id"] == e["team_id"])
    names = {p["player_id"]: p["name"] for p in ctx.get("players") or []}
    who = names.get(e["player_ids"][0]) if e["player_ids"] else None
    return {"what": e["trigger"], "team": team, **({"player": who} if who else {}), "period": e["period"]}


def recap_line_ids(recap: dict, modes: tuple[str, ...], max_players: int) -> list[str]:
    ids = [m for m in ("casual", "analyst") if m in modes]
    if "club" in modes:
        ids += [f"club:{recap['context']['teams'][s]['team_id']}" for s in ("home", "away")]
    if "player" in modes:
        ids += [f"player:{p}" for p in recap["evidence"]["player_ids"][:max(max_players, 0) or None]]
    return ids


def _f(recap: dict, key: str) -> dict | None:
    return next((f for f in recap["evidence"]["facts"] if f["key"] == key), None)


def recap_template(recap: dict, line_id: str) -> dict:
    """Approved recap templates: the final score, plus shots and xG for the analyst; a scorer's goals."""
    teams = recap["context"]["teams"]
    home, away = teams["home"]["name"], teams["away"]["name"]
    hg, ag = _f(recap, "home_goals"), _f(recap, "away_goals")
    mode, target = mode_of(line_id), target_of(line_id)

    def line(text: str, facts: list[dict]) -> dict:
        return {"id": line_id, "mode": mode, "lang": "en", "text": text,
                "claims": [{"key": f["key"], "value": f["value"]} for f in facts]}

    score = f"Full time: {home} {fmt(hg)}–{fmt(ag)} {away}."
    if mode == "analyst":
        hs, as_, hx, ax = (_f(recap, k) for k in ("home_shots", "away_shots", "home_xg", "away_xg"))
        if None not in (hs, as_, hx, ax):
            return line(f"{score} Shots: {fmt(hs)} for {home}, {fmt(as_)} for {away}. xG: {fmt(hx)} and "
                        f"{fmt(ax)}.", [hg, ag, hs, as_, hx, ax])
    if mode == "player":
        g = _f(recap, f"goals:{target}")
        name = next(p["name"] for p in recap["context"]["players"] if p["player_id"] == target)
        return line(f"Goals for {name}: {fmt(g)}. {score}", [g, hg, ag])
    return line(score, [hg, ag])


async def run(run: RunState) -> dict:
    """The recap writer stage: one model call for every recap line; templates for anything missing."""
    recap, s = run.moment, run.deps.settings
    ids = recap_line_ids(recap, s.modes, s.max_player_lines)
    templates = [recap_template(recap, i) for i in ids]
    if not run.deps.models.on:
        return {"lines": templates, "fallback": True, "model_ids": []}
    from fact_checker import evidence_view
    payload = {"recap": evidence_view(recap), "story": recap.get("story", []), "lines": requested(recap, ids)}
    try:
        got = _accept(await run.ask("recap_writer", payload, Lines), ids)
    except ModelFailed:
        return {"lines": templates, "fallback": True, "model_ids": []}
    return {"lines": [got.get(i) or t for i, t in zip(ids, templates, strict=True)], "fallback": not got,
            "model_ids": [i for i in ids if i in got]}
