# fallbacks.py — Template lines
#
# Purpose: one approved template per trigger and mode, used when a model is off, slow, over budget or fails its checks
# Inputs:  a validated moment (facts and names only)
# Outputs: §5.1 lines {mode, lang, text, claims}; every number in the text is a claim of one fact, in order
# Spec:    agents/specs/workflow.md §4; agents/specs/fact-checking.md §1; stats/agents-guide.md §4 (wording)
#
# Templates are labelled when shown (`fallback = true`, `verified = false`). Values are written as stored, at their
# decimals. Wording follows the producer guide: no "possession" for momentum, no "tired" for pressing less.

from __future__ import annotations

ORDINALS = {1: "1st", 2: "2nd", 3: "3rd"}


def fact_map(moment: dict) -> dict[str, dict]:
    return {f["key"]: f for f in moment["evidence"]["facts"]}


def fmt(fact: dict) -> str:
    return f"{fact['value']:.{fact['decimals']}f}"


def team_name(moment: dict, team_id: str | None = None) -> str:
    team_id = team_id or moment["evidence"]["team_id"]
    for side in ("home", "away"):
        t = moment["context"]["teams"][side]
        if t["team_id"] == team_id:
            return t["name"]
    raise KeyError(team_id)


def player_name(moment: dict, player_id: str) -> str | None:
    for p in moment["context"].get("players") or []:
        if p["player_id"] == player_id:
            return p["name"]
    return None


def _line(mode: str, text: str, claims: list[dict]) -> dict:
    return {"mode": mode, "lang": "en", "text": text, "claims": claims}


def _claim(f: dict) -> dict:
    return {"key": f["key"], "value": f["value"]}


def template(moment: dict, mode: str) -> dict:
    """The template line for this moment and mode (`casual`, `analyst`, `player`, `club`)."""
    e, f = moment["evidence"], fact_map(moment)
    team = team_name(moment)
    trig = e["trigger"]
    analyst = mode == "analyst"
    if trig == "goal":
        tg, og = f["team_goals_match"], f["opponent_goals_match"]
        if analyst:
            xg, dist = f["shot_xg"], f["shot_distance_m"]
            return _line(mode, f"Goal for {team}: a {fmt(xg)} xG chance from {fmt(dist)} m. {fmt(tg)}–{fmt(og)}.",
                         [_claim(xg), _claim(dist), _claim(tg), _claim(og)])
        return _line(mode, f"{team} score. {fmt(tg)}–{fmt(og)}.", [_claim(tg), _claim(og)])
    if trig == "red_card":
        n = f["team_players_on_pitch"]
        return _line(mode, f"{team} are down to {fmt(n)}.", [_claim(n)])
    if trig == "penalty":
        tg, og = f["team_goals_match"], f["opponent_goals_match"]
        return _line(mode, f"Penalty missed by {team}. Still {fmt(tg)}–{fmt(og)}.", [_claim(tg), _claim(og)])
    if trig == "big_chance":
        xg, dist = f["shot_xg"], f["shot_distance_m"]
        return _line(mode, f"Big chance for {team}: {fmt(xg)} xG from {fmt(dist)} m.", [_claim(xg), _claim(dist)])
    if trig == "shot_cluster":
        n, d = f["shots_last_5min"], f["window_duration_min"]
        return _line(mode, f"{team} have taken {fmt(n)} shots in the last {fmt(d)} minutes.", [_claim(n), _claim(d)])
    if trig == "momentum_swing":
        now, before, d = (f["momentum_share_last_5min_pct"], f["momentum_share_previous_10min_pct"],
                          f["window_duration_min"])
        return _line(mode, f"{team} have taken over: {fmt(now)}% of the attacking actions in the last {fmt(d)} "
                           f"minutes, up from {fmt(before)}%.", [_claim(now), _claim(d), _claim(before)])
    if trig == "press_change":
        now, before = f["pressures_per_opp_pass_last_5min"], f["pressures_per_opp_pass_previous_10min"]
        harder = now["value"] > before["value"]
        verb, way = ("pressing harder", "up") if harder else ("pressing less", "down")
        return _line(mode, f"{team} are {verb}: {fmt(now)} pressures per opponent pass, {way} from {fmt(before)}.",
                     [_claim(now), _claim(before)])
    if trig == "milestone":
        g = f["player_goals_match"]
        name = player_name(moment, e["player_ids"][0]) if e["player_ids"] else None
        who = name or team
        return _line(mode, f"{who}: {ORDINALS.get(g['value'], str(g['value']))} goal of the match.", [_claim(g)])
    raise ValueError(f"no template for trigger {trig!r}")


def templates(moment: dict, modes: tuple[str, ...]) -> list[dict]:
    return [template(moment, m) for m in modes]
