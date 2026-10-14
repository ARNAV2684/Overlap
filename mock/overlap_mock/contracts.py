"""Validator for CONTRACTS.md v0 shapes (§2 setup, §3 event, §4 tracking, §7 envelope) and the generator invariants.

Strict on purpose: consumers reject unknown fields, so this does too.
"""

from __future__ import annotations

import re

ID_MATCH = re.compile(r"^SYN-\d{4}$")
ID_TEAM = re.compile(r"^[A-Z]{3}$")
ID_PLAYER = re.compile(r"^[A-Z]{3}-\d{2}$")
ID_EVENT = re.compile(r"^SYN-\d{4}-\d{5}$")
CLOCK = re.compile(r"^\d{1,3}(\+\d{1,2})?:\d{2}$")
HEX = re.compile(r"^#[0-9A-Fa-f]{6}$")

EVENT_TYPES = {"Pass", "Carry", "TakeOn", "Shot", "Save", "Tackle", "Interception", "Clearance", "Aerial",
               "Pressure", "BallRecovery", "Foul", "Card", "Substitution", "Offside", "Corner", "PeriodStart",
               "PeriodEnd"}
EVENT_FIELDS = {
    "event_id", "match_id", "seq", "possession_id", "period", "period_ms", "match_ms", "clock", "team_id",
    "player_id", "type", "x", "y", "end_x", "end_y", "outcome", "body_part", "under_pressure", "qualifiers",
    "receiver_id", "shot_outcome", "situation", "shot_speed_kmh", "goal_mouth_y", "goal_mouth_z", "assisted_by",
    "key_pass_event_id", "fouled_player_id", "card", "player_on_id", "ball_speed_kmh", "target_player_id",
}
SHOT_OUTCOMES = {"goal", "saved", "missed", "blocked", "woodwork"}
SITUATIONS = {"open_play", "counter", "corner", "free_kick", "penalty", "throw_in"}
BODY_PARTS = {"left_foot", "right_foot", "head", "other"}
CARDS = {"yellow", "second_yellow", "red"}
SETUP_FIELDS = {"match_id", "seed", "competition", "season_id", "venue", "kickoff_utc", "storylines", "teams"}
TEAM_FIELDS = {"team_id", "name", "colours", "formation", "style", "lineup", "bench"}
PLAYER_FIELDS = {"player_id", "name", "pos", "shirt", "attr"}
ATTR_KEYS = {"pace", "passing", "dribbling", "finishing", "tackling", "stamina"}
FRAME_FIELDS = {"match_id", "period", "period_ms", "match_ms", "ball", "players"}
ENVELOPE_KINDS = {"event", "positions", "stats", "overlay", "player_tag", "recap", "status"}


class ContractError(AssertionError):
    pass


def _check(cond: bool, msg: str):
    if not cond:
        raise ContractError(msg)


def _coord(v, what: str):
    _check(isinstance(v, (int, float)) and 0 <= v <= 100, f"{what} out of 0–100: {v!r}")


def validate_setup(s: dict) -> None:
    _check(set(s) <= SETUP_FIELDS and SETUP_FIELDS <= set(s), f"setup fields: {sorted(set(s) ^ SETUP_FIELDS)}")
    _check(bool(ID_MATCH.match(s["match_id"])), "setup match_id format")
    _check(re.match(r"^S\d+$", s["season_id"]) is not None, "season_id format")
    _check(set(s["venue"]) == {"name", "city"}, "venue fields")
    ids: set[str] = set()
    for side in ("home", "away"):
        t = s["teams"][side]
        _check(set(t) == TEAM_FIELDS, f"{side} team fields: {sorted(set(t) ^ TEAM_FIELDS)}")
        _check(bool(ID_TEAM.match(t["team_id"])), "team_id format")
        _check(HEX.match(t["colours"]["primary"]) and HEX.match(t["colours"]["secondary"]), "colours")
        _check(set(t["style"]) == {"press_intensity", "directness", "width"}, "style keys")
        _check(all(0 <= v <= 1 for v in t["style"].values()), "style values 0–1")
        _check(len(t["lineup"]) == 11, f"{side} lineup must be exactly 11")
        _check(t["lineup"][0]["pos"] == "GK", f"{side} lineup must start with the goalkeeper")
        for p in t["lineup"] + t["bench"]:
            _check(set(p) == PLAYER_FIELDS, f"player fields {p.get('player_id')}")
            _check(bool(ID_PLAYER.match(p["player_id"])), f"player_id format {p['player_id']}")
            _check(p["player_id"] == f"{t['team_id']}-{p['shirt']:02d}", f"player_id/shirt mismatch {p['player_id']}")
            _check(set(p["attr"]) == ATTR_KEYS, f"attr keys {p['player_id']}")
            _check(all(1 <= v <= 99 for v in p["attr"].values()), f"ratings 1–99 {p['player_id']}")
            _check(p["player_id"] not in ids, f"duplicate player {p['player_id']}")
            ids.add(p["player_id"])


def validate_event(e: dict, team_ids: set[str]) -> None:
    extra = set(e) - EVENT_FIELDS
    _check(not extra, f"{e.get('event_id')}: unknown fields {sorted(extra)}")
    for k in ("event_id", "match_id", "seq", "possession_id", "period", "period_ms", "match_ms", "clock", "type"):
        _check(k in e, f"{e.get('event_id')}: missing {k}")
    _check(bool(ID_EVENT.match(e["event_id"])), f"event_id format {e['event_id']}")
    _check(e["event_id"] == f"{e['match_id']}-{e['seq']:05d}", f"event_id/seq mismatch {e['event_id']}")
    _check(e["type"] in EVENT_TYPES, f"unknown type {e['type']}")
    _check(bool(CLOCK.match(e["clock"])), f"clock format {e['clock']}")
    _check(e["period"] in (1, 2, 3, 4, 5), "period")
    if e["type"] not in ("PeriodStart", "PeriodEnd"):
        _check("team_id" in e and "player_id" in e, f"{e['event_id']}: needs team_id and player_id")
        _check(e["team_id"] in team_ids, f"{e['event_id']}: unknown team {e['team_id']}")
        _check(e["player_id"].startswith(e["team_id"] + "-"), f"{e['event_id']}: player not on team")
    for k in ("x", "y", "end_x", "end_y"):
        if k in e:
            _coord(e[k], f"{e['event_id']}.{k}")
    t = e["type"]
    if t == "Pass" and e.get("outcome") == "success":
        _check("receiver_id" in e, f"{e['event_id']}: successful pass needs receiver_id")
        _check(e["receiver_id"] != e["player_id"], f"{e['event_id']}: receiver is the passer")
        _check(e["receiver_id"].startswith(e["team_id"] + "-"), f"{e['event_id']}: receiver on other team")
    if t == "Shot":
        _check(e.get("shot_outcome") in SHOT_OUTCOMES, f"{e['event_id']}: shot_outcome")
        _check(e.get("situation") in SITUATIONS, f"{e['event_id']}: situation")
        _check("outcome" not in e, f"{e['event_id']}: shots use shot_outcome, not outcome")
        _check(("assisted_by" in e) == ("key_pass_event_id" in e), f"{e['event_id']}: assist fields come as a pair")
    else:
        _check("shot_outcome" not in e, f"{e['event_id']}: shot_outcome only on shots")
    if t == "Foul":
        _check("fouled_player_id" in e and not e["fouled_player_id"].startswith(e["team_id"] + "-"),
               f"{e['event_id']}: foul needs fouled_player_id on the other team")
    if t == "Card":
        _check(e.get("card") in CARDS, f"{e['event_id']}: card")
    if t == "Substitution":
        _check(e.get("player_on_id", "").startswith(e["team_id"] + "-"), f"{e['event_id']}: player_on_id")
    if t == "Pressure":
        _check("target_player_id" in e, f"{e['event_id']}: pressure needs target_player_id")
    if "body_part" in e:
        _check(e["body_part"] in BODY_PARTS, f"{e['event_id']}: body_part")
    if "outcome" in e:
        _check(e["outcome"] in ("success", "fail"), f"{e['event_id']}: outcome")


def validate_frame(f: dict) -> None:
    _check(set(f) == FRAME_FIELDS, f"frame fields {sorted(set(f) ^ FRAME_FIELDS)}")
    _check(set(f["ball"]) == {"x", "y", "z", "speed_kmh"}, "ball fields")
    _coord(f["ball"]["x"], "ball.x")
    _coord(f["ball"]["y"], "ball.y")
    for p in f["players"]:
        _check(set(p) == {"player_id", "x", "y", "speed_kmh", "dist_m"}, "frame player fields")
        _coord(p["x"], f"{p['player_id']}.x")
        _coord(p["y"], f"{p['player_id']}.y")
        _check(0 <= p["speed_kmh"] <= 37.5, f"{p['player_id']} speed {p['speed_kmh']} km/h at {f['match_ms']}")


def validate_envelope(env: dict) -> None:
    _check(set(env) == {"seq", "kind", "match_id", "match_ms", "clock", "data"}, f"envelope fields {sorted(env)}")
    _check(env["kind"] in ENVELOPE_KINDS, f"envelope kind {env['kind']}")


def validate_match(result) -> dict:
    """Validates a whole engine result and returns summary stats. Raises ContractError on the first problem."""
    setup, events, frames = result.setup, result.events, result.frames
    validate_setup(setup)
    teams = setup["teams"]
    team_ids = {teams["home"]["team_id"], teams["away"]["team_id"]}
    side_of = {teams[s]["team_id"]: s for s in ("home", "away")}
    squad = {p["player_id"] for s in ("home", "away") for p in teams[s]["lineup"] + teams[s]["bench"]}
    on_pitch = {p["player_id"] for s in ("home", "away") for p in teams[s]["lineup"]}
    used_bench: set[str] = set()
    sent_off: set[str] = set()
    goals = {"home": 0, "away": 0}
    last_seq, last_ms = 0, -1
    ended = False
    period_ends = 0
    by_id: dict[str, dict] = {}
    for e in events:
        validate_event(e, team_ids)
        _check(e["match_id"] == setup["match_id"], "match_id differs from setup")
        _check(e["seq"] == last_seq + 1, f"seq not strictly +1 at {e['event_id']}")
        _check(e["match_ms"] >= last_ms, f"match_ms went backwards at {e['event_id']}")
        _check(not ended, f"event after full time: {e['event_id']}")
        last_seq, last_ms = e["seq"], e["match_ms"]
        by_id[e["event_id"]] = e
        if e["type"] == "PeriodEnd":
            period_ends += 1
            ended = period_ends == 2
            continue
        if e["type"] == "PeriodStart":
            continue
        pid = e["player_id"]
        _check(pid in squad, f"{e['event_id']}: unknown player {pid}")
        _check(pid not in sent_off, f"{e['event_id']}: {pid} acts after a red card")
        _check(pid in on_pitch, f"{e['event_id']}: {pid} is not on the pitch")
        for k in ("receiver_id", "target_player_id", "fouled_player_id"):
            if k in e:
                _check(e[k] in on_pitch and e[k] not in sent_off, f"{e['event_id']}: {k} {e[k]} not on the pitch")
        if e["type"] == "Shot":
            if e["shot_outcome"] == "goal":
                goals[side_of[e["team_id"]]] += 1
            if "key_pass_event_id" in e:
                kp = by_id.get(e["key_pass_event_id"])
                _check(kp is not None and kp["type"] == "Pass" and kp.get("receiver_id") == pid
                       and kp["player_id"] == e["assisted_by"] and "key_pass" in kp.get("qualifiers", []),
                       f"{e['event_id']}: key pass link is wrong")
        if e["type"] == "Card" and e["card"] in ("red", "second_yellow"):
            sent_off.add(pid)
            on_pitch.discard(pid)
        if e["type"] == "Substitution":
            on = e["player_on_id"]
            _check(on in squad and on not in on_pitch and on not in used_bench and on not in sent_off,
                   f"{e['event_id']}: bad substitute {on}")
            on_pitch.discard(pid)
            on_pitch.add(on)
            used_bench.add(on)
    _check(ended, "match has no final PeriodEnd")
    _check(goals == result.score, f"score {result.score} != goal shots {goals}")

    prev = None
    for f in frames:
        validate_frame(f)
        _check(f["match_id"] == setup["match_id"], "frame match_id")
        if prev is not None:
            _check(f["match_ms"] > prev["match_ms"], "frames not increasing")
            if f["period"] == prev["period"]:
                _check(f["period_ms"] - prev["period_ms"] == 200, "frames must be 5 Hz")
        ids = [p["player_id"] for p in f["players"]]
        _check(len(ids) == len(set(ids)), "duplicate player in frame")
        prev = f

    shots = [e for e in events if e["type"] == "Shot"]
    passes = [e for e in events if e["type"] == "Pass"]
    completed = sum(1 for e in passes if e.get("outcome") == "success")
    starters = {p["player_id"] for p in frames[0]["players"]}
    dists = sorted(p["dist_m"] for p in frames[-1]["players"] if p["player_id"] in starters)
    top = max(p["speed_kmh"] for f in frames for p in f["players"])
    return {
        "match_id": setup["match_id"],
        "score": f"{teams['home']['team_id']} {result.score['home']}–{result.score['away']} {teams['away']['team_id']}",
        "events": len(events),
        "frames": len(frames),
        "duration": events[-1]["clock"],
        "passes": len(passes),
        "pass_completion_pct": round(100 * completed / max(1, len(passes)), 1),
        "shots": len(shots),
        "fouls": sum(1 for e in events if e["type"] == "Foul"),
        "cards": [f"{e['player_id']} {e['card']}" for e in events if e["type"] == "Card"],
        "subs": sum(1 for e in events if e["type"] == "Substitution"),
        "possessions": events[-1]["possession_id"],
        "types": sorted({e["type"] for e in events}),
        "median_dist_km_full_match": round(dists[len(dists) // 2] / 1000, 2),
        "top_speed_kmh": top,
    }
