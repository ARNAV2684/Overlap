# fallbacks.py — Template lines
#
# Purpose: one approved template per trigger and mode, used when a model is off, slow, over budget or fails its checks
# Inputs:  a validated moment (facts and names only)
# Outputs: §5.1 lines {mode, lang, text, claims}; every number in the text is a claim of one fact, in order.
#          Internally each line also carries an `id`: `casual`, `analyst`, `club:<team_id>` (one per team) or
#          `player:<player_id>` (one per followed player in `player_ids`); `public()` drops it.
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
    if trig == "head_to_head":
        leader, rival = (player_name(moment, p) for p in e["player_ids"][:2])
        pairs = _h2h_pairs(f)
        if analyst:
            parts = [f"{fmt(p)} {word} to {fmt(r)}" for word, p, r in pairs]
            return _line(mode, f"{leader} is ahead of {rival}: {', '.join(parts)}.",
                         [_claim(x) for _, p, r in pairs for x in (p, r)])
        # The number the leader leads on most (relative to the rival), never a tie
        word, p, r = max(pairs, key=lambda x: (x[1]["value"] - x[2]["value"]) / max(x[2]["value"], 1))
        return _line(mode, f"{leader} is winning the battle with {rival}: {fmt(p)} {word} to {fmt(r)}.",
                     [_claim(p), _claim(r)])
    if trig == "connection":
        a, b = (player_name(moment, p) for p in e["player_ids"][:2])
        n, prog = f["pair_passes_last_15min"], f["pair_progressive_passes_last_15min"]
        text = f"{a} and {b} are linking up: {fmt(n)} passes to each other lately, {fmt(prog)} progressive."
        claims = [_claim(n), _claim(prog)]
        if analyst and f["pair_shot_moves_last_15min"]["value"]:
            moves = f["pair_shot_moves_last_15min"]
            text = text[:-1] + f", {fmt(moves)} in moves ending in a shot."
            claims.append(_claim(moves))
        return _line(mode, text, claims)
    if trig == "workhorse":
        name = player_name(moment, e["player_ids"][0]) if e["player_ids"] else None
        won, rec, pr = f["player_duels_won_match"], f["player_recoveries_match"], f["player_pressures_match"]
        claims = [_claim(won), _claim(rec), _claim(pr)]
        text = f"{name or team} is putting in the most work: {fmt(won)} duels won, {fmt(rec)} recoveries, {fmt(pr)} pressures"
        if analyst and "player_distance_km" in f:
            km = f["player_distance_km"]
            text += f", {fmt(km)} km covered"
            claims.append(_claim(km))
        return _line(mode, text + ".", claims)
    raise ValueError(f"no template for trigger {trig!r}")


# The words each head-to-head number is told with, in the order the stats engine sends them
H2H_WORDS = {"shots": "shots", "shots_on_target": "on target", "xg": "xG", "passes_completed": "completed passes",
             "progressive_passes": "progressive passes", "key_passes": "passes leading to a shot",
             "duels_won": "duels won", "interceptions": "interceptions", "recoveries": "recoveries"}


def _h2h_pairs(f: dict[str, dict]) -> list[tuple[str, dict, dict]]:
    """(words, the leader's fact, the rival's fact) for each number the pack compares."""
    return [(word, f[f"player_{m}_match"], f[f"rival_{m}_match"]) for m, word in H2H_WORDS.items()
            if f"player_{m}_match" in f and f"rival_{m}_match" in f]


def templates(moment: dict, modes: tuple[str, ...]) -> list[dict]:
    return [template(moment, m) for m in modes]


# --- line ids: one per audience text (contracts §10.6) ------------------------------------------------------------

def line_ids(moment: dict, modes: tuple[str, ...], max_players: int) -> list[str]:
    """The lines a moment needs: casual, analyst, a club line for each team, a player line for each of the first
    `max_players` players in `player_ids` that has a name in the context."""
    ids: list[str] = []
    for mode in modes:
        if mode in ("casual", "analyst"):
            ids.append(mode)
        elif mode == "club":
            ids += [f"club:{moment['context']['teams'][side]['team_id']}" for side in ("home", "away")]
        elif mode == "player":
            named = [p for p in moment["evidence"]["player_ids"] if player_name(moment, p)]
            ids += [f"player:{p}" for p in named[:max_players]]
    return ids


def mode_of(line_id: str) -> str:
    return line_id.split(":", 1)[0]


def target_of(line_id: str) -> str | None:
    return line_id.split(":", 1)[1] if ":" in line_id else None


FOCAL = ("goal", "milestone", "big_chance", "penalty", "red_card", "workhorse")   # player_ids[0] is the actor


def template_line(moment: dict, line_id: str) -> dict:
    """The approved template for one line id. Club lines repeat the plain facts for either side (no invented
    feelings); player lines centre on the player when the moment is theirs, otherwise name them before the facts."""
    mode, target = mode_of(line_id), target_of(line_id)
    if mode in ("casual", "analyst"):
        return {"id": line_id, **template(moment, mode)}
    if mode == "club":
        return {"id": line_id, **template(moment, "club")}
    e, f = moment["evidence"], fact_map(moment)
    name, team = player_name(moment, target), team_name(moment)
    if e["player_ids"] and target == e["player_ids"][0] and e["trigger"] in FOCAL:
        trig = e["trigger"]
        if trig == "goal":
            tg, og = f["team_goals_match"], f["opponent_goals_match"]
            return {"id": line_id, **_line("player", f"{name} scores for {team}. {fmt(tg)}–{fmt(og)}.",
                                           [_claim(tg), _claim(og)])}
        if trig == "milestone":
            g = f["player_goals_match"]
            return {"id": line_id, **_line("player", f"{name}: {ORDINALS.get(g['value'], str(g['value']))} goal of "
                                                     "the match.", [_claim(g)])}
        if trig == "big_chance":
            xg, dist = f["shot_xg"], f["shot_distance_m"]
            return {"id": line_id, **_line("player", f"Big chance for {name}: {fmt(xg)} xG from {fmt(dist)} m.",
                                           [_claim(xg), _claim(dist)])}
        if trig == "penalty":
            tg, og = f["team_goals_match"], f["opponent_goals_match"]
            return {"id": line_id, **_line("player", f"{name}'s penalty doesn't go in. Still {fmt(tg)}–{fmt(og)}.",
                                           [_claim(tg), _claim(og)])}
        if trig == "red_card":
            n = f["team_players_on_pitch"]
            return {"id": line_id, **_line("player", f"{name} is sent off. {team} are down to {fmt(n)}.",
                                           [_claim(n)])}
        if trig == "workhorse":
            won, rec = f["player_duels_won_match"], f["player_recoveries_match"]
            return {"id": line_id, **_line("player", f"{name} is putting in the most work: {fmt(won)} duels won and "
                                                     f"{fmt(rec)} recoveries.", [_claim(won), _claim(rec)])}
    if e["trigger"] in ("head_to_head", "connection") and target in e["player_ids"]:
        base = template(moment, "player")                 # the line already names this player
        return {"id": line_id, **_line("player", base["text"], base["claims"])}
    base = template(moment, "player")
    return {"id": line_id, **_line("player", f"{name}: {base['text']}", base["claims"])}


def template_lines(moment: dict, ids: list[str]) -> list[dict]:
    return [template_line(moment, i) for i in ids]


def public(line: dict) -> dict:
    """The §5.1 line as published: exactly {mode, lang, text, claims}."""
    return {"mode": line["mode"], "lang": line["lang"], "text": line["text"],
            "claims": [{"key": c["key"], "value": c["value"]} for c in line["claims"]]}
