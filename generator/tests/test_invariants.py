# test_invariants.py — Generator invariants
#
# Purpose: check the CONTRACTS.md §3 invariants and the §2-§4 shapes on whole matches
# Inputs:  seeded Calverholme vs Dunmarrow matches (OVERLAP_SEEDS=N plays N seeds; default 3 to keep CI quick),
#          plus one match between two league clubs
# Outputs: pass / fail
# Spec:    generator/specs/engine.md §8

from __future__ import annotations

import os

import pytest

import engine
import world

SEEDS = range(1, int(os.environ.get("OVERLAP_SEEDS", "3")) + 1)

EVENT_FIELDS = {
    "event_id", "match_id", "seq", "possession_id", "period", "period_ms", "match_ms", "clock", "team_id",
    "player_id", "type", "x", "y", "end_x", "end_y", "outcome", "body_part", "under_pressure", "qualifiers",
    "receiver_id", "shot_outcome", "situation", "shot_speed_kmh", "goal_mouth_y", "goal_mouth_z", "assisted_by",
    "key_pass_event_id", "fouled_player_id", "card", "player_on_id", "ball_speed_kmh", "target_player_id",
}
EVENT_TYPES = {"Pass", "Carry", "TakeOn", "Shot", "Save", "Tackle", "Interception", "Clearance", "Aerial",
               "Pressure", "BallRecovery", "Foul", "Card", "Substitution", "Offside", "Corner", "PeriodStart",
               "PeriodEnd"}
SHOT_OUTCOMES = {"goal", "saved", "missed", "blocked", "woodwork"}
SITUATIONS = {"open_play", "counter", "corner", "free_kick", "penalty", "throw_in"}
BODY_PARTS = {"left_foot", "right_foot", "head", "other"}


@pytest.fixture(scope="module")
def matches():
    _, loaded = world.load_league()
    clubs = {c.team_id: c for c in loaded}
    reference = [engine.play(clubs, "CAL", "DTN", match_id=f"SYN-{s:04d}", seed=s) for s in SEEDS]
    return reference + [engine.play(clubs, "KES", "WEX", match_id="SYN-0100", seed=100)]   # two generated squads


def test_event_shapes(matches):
    for m in matches:
        teams = {m.setup["teams"][s]["team_id"] for s in ("home", "away")}
        for e in m.events:
            assert set(e) <= EVENT_FIELDS, e
            assert e["type"] in EVENT_TYPES
            assert e["event_id"] == f"{e['match_id']}-{e['seq']:05d}"
            for k in ("x", "y", "end_x", "end_y"):
                if k in e:
                    assert 0 <= e[k] <= 100, (k, e)
            if e["type"] not in ("PeriodStart", "PeriodEnd"):
                assert e["team_id"] in teams and e["player_id"].startswith(e["team_id"] + "-")
            if e["type"] == "Shot":
                assert e["shot_outcome"] in SHOT_OUTCOMES and e["situation"] in SITUATIONS
                assert ("assisted_by" in e) == ("key_pass_event_id" in e)
                assert "outcome" not in e
            else:
                assert "shot_outcome" not in e
            if "body_part" in e:
                assert e["body_part"] in BODY_PARTS
            if "outcome" in e:
                assert e["outcome"] in ("success", "fail")
            if e["type"] == "Pressure":
                assert "target_player_id" in e


def test_order_time_and_full_time(matches):
    for m in matches:
        seqs = [e["seq"] for e in m.events]
        assert seqs == list(range(1, len(seqs) + 1))
        times = [e["match_ms"] for e in m.events]
        assert times == sorted(times)
        ends = [i for i, e in enumerate(m.events) if e["type"] == "PeriodEnd"]
        assert len(ends) == 2 and ends[-1] == len(m.events) - 1, "nothing after full time"


def test_score_equals_goal_shots(matches):
    for m in matches:
        side = {m.setup["teams"][s]["team_id"]: s for s in ("home", "away")}
        goals = {"home": 0, "away": 0}
        for e in m.events:
            if e["type"] == "Shot" and e["shot_outcome"] == "goal":
                goals[side[e["team_id"]]] += 1
        assert goals == m.score


def test_only_players_on_the_pitch_act(matches):
    """Passes go to a team-mate on the pitch; nobody acts after a red card or after being substituted off."""
    for m in matches:
        on = {p["player_id"] for s in ("home", "away") for p in m.setup["teams"][s]["lineup"]}
        bench = {p["player_id"] for s in ("home", "away") for p in m.setup["teams"][s]["bench"]}
        for e in m.events:
            if "player_id" in e:
                assert e["player_id"] in on, e
            for k in ("receiver_id", "target_player_id", "fouled_player_id"):
                if k in e:
                    assert e[k] in on, (k, e)
            if e["type"] == "Pass" and e["outcome"] == "success":
                assert e["receiver_id"] != e["player_id"]
                assert e["receiver_id"].startswith(e["team_id"] + "-")
            if e["type"] == "Card" and e["card"] in ("red", "second_yellow"):
                on.discard(e["player_id"])
            if e["type"] == "Substitution":
                assert e["player_on_id"] in bench and e["player_on_id"] not in on
                bench.discard(e["player_on_id"])
                on.discard(e["player_id"])
                on.add(e["player_on_id"])


def test_key_pass_links_are_exact(matches):
    for m in matches:
        by_id = {e["event_id"]: e for e in m.events}
        for e in m.events:
            if e["type"] == "Shot" and "key_pass_event_id" in e:
                kp = by_id[e["key_pass_event_id"]]
                assert kp["type"] == "Pass" and kp["outcome"] == "success"
                assert kp["receiver_id"] == e["player_id"] and kp["player_id"] == e["assisted_by"]
                assert "key_pass" in kp["qualifiers"]


def test_tracking_frames(matches):
    for m in matches:
        prev = None
        for f in m.frames:
            assert set(f) == {"match_id", "period", "period_ms", "match_ms", "ball", "players"}
            assert set(f["ball"]) == {"x", "y", "z", "speed_kmh"}
            assert 0 <= f["ball"]["x"] <= 100 and 0 <= f["ball"]["y"] <= 100
            ids = [p["player_id"] for p in f["players"]]
            assert len(ids) == len(set(ids)) and 14 <= len(ids) <= 22
            for p in f["players"]:
                assert 0 <= p["x"] <= 100 and 0 <= p["y"] <= 100
                assert 0 <= p["speed_kmh"] <= 37.5
            if prev is not None:
                assert f["match_ms"] > prev["match_ms"]
                if f["period"] == prev["period"]:
                    assert f["period_ms"] - prev["period_ms"] == 200
            prev = f


def test_events_and_tracking_agree(matches):
    """An event's coordinates are the actor's tracked position at that step (engine.md §8, movement.md §3)."""
    for m in matches[:1]:
        frames = {f["match_ms"]: f for f in m.frames}
        for e in m.events:
            if e["type"] not in ("Pressure", "Tackle", "Interception", "BallRecovery") or e["match_ms"] not in frames:
                continue
            f = frames[e["match_ms"]]
            p = next(p for p in f["players"] if p["player_id"] == e["player_id"])
            home_east = e["period"] == 1
            east = (e["team_id"] == m.setup["teams"]["home"]["team_id"]) == home_east
            px, py = (p["x"], p["y"]) if east else (100 - p["x"], 100 - p["y"])
            assert abs(px - e["x"]) <= 1.5 and abs(py - e["y"]) <= 1.5, e
