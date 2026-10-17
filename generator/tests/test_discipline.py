# test_discipline.py — Fouls, cards, substitutions, offside, free kicks and penalties
#
# Purpose: check the discipline rules on whole matches and on hand-placed situations
# Inputs:  seeded Skyhaven vs Amberholt matches without tracking; small set-ups of the match state
# Outputs: pass / fail
# Spec:    generator/specs/set-pieces-and-discipline.md

from __future__ import annotations

import collections

import pytest

import config
import discipline
import engine
import pitch
import world

SEEDS = (1, 2, 3)


@pytest.fixture(scope="module")
def clubs():
    _, loaded = world.load_reference_clubs()
    return {c.team_id: c for c in loaded}


@pytest.fixture(scope="module")
def matches(clubs):
    return [engine.play(clubs, "SKH", "AMH", match_id=f"SYN-{s:04d}", seed=s, keep_frames=False) for s in SEEDS]


def test_all_event_types_appear(matches):
    seen = {e["type"] for m in matches for e in m.events}
    for t in ("Foul", "Card", "Substitution", "Offside", "Corner", "Save"):
        assert t in seen, t


def test_every_card_follows_its_foul(matches):
    for m in matches:
        for prev, e in zip(m.events, m.events[1:]):
            if e["type"] == "Card":
                assert prev["type"] == "Foul" and prev["player_id"] == e["player_id"]


def test_fouls_are_by_one_player_on_another_team(matches):
    for m in matches:
        for e in m.events:
            if e["type"] == "Foul":
                assert not e["fouled_player_id"].startswith(e["team_id"] + "-")


def test_second_yellow_only_after_a_yellow(matches):
    for m in matches:
        booked = set()
        for e in m.events:
            if e["type"] == "Card":
                if e["card"] == "second_yellow":
                    assert e["player_id"] in booked
                if e["card"] == "yellow":
                    assert e["player_id"] not in booked
                    booked.add(e["player_id"])


def test_at_most_five_substitutes_a_side(matches):
    for m in matches:
        subs = collections.Counter(e["team_id"] for e in m.events if e["type"] == "Substitution")
        assert all(n <= config.MAX_SUBS for n in subs.values())


def test_offside_gives_the_other_side_a_free_kick(matches):
    for m in matches:
        for i, e in enumerate(m.events):
            if e["type"] == "Offside":
                prev = m.events[i - 1]
                assert prev["type"] == "Pass" and prev["outcome"] == "fail" and prev["team_id"] == e["team_id"]
                nxt = next(x for x in m.events[i + 1:] if x["type"] in ("Pass", "PeriodEnd"))
                if nxt["type"] == "Pass":       # the half can end before the free kick is taken
                    assert nxt["team_id"] != e["team_id"]


def test_penalty_shots_use_the_penalty_xg_situation(matches):
    for m in matches:
        for e in m.events:
            if e["type"] == "Shot" and e["situation"] == "penalty":
                assert e["x"] == pytest.approx(100 - pitch.PENALTY_SPOT / pitch.LENGTH * 100, abs=1.5)


def _placed(clubs):
    """A match frozen at kickoff, with one attacker and one defender placed by hand."""
    m = engine.Match(clubs["SKH"], clubs["AMH"], match_id="SYN-0050", seed=50, kickoff_utc="2026-10-24T19:00:00Z")
    m._update_style()
    m._update_lines()
    attacker = next(b for b in m.on_pitch("home") if b.slot == "ST")
    defender = next(b for b in m.on_pitch("away") if b.slot == "CB")
    return m, attacker, defender


def test_a_foul_in_the_box_is_a_penalty(clubs):
    m, att, dfd = _placed(clubs)
    att.x, att.y = pitch.to_team(pitch.LENGTH - 8, pitch.GOAL_Y, m.east("home"))
    dfd.x, dfd.y = att.x, att.y + 1
    discipline.commit_foul(m, dfd, att)
    assert m.restart.kind == "penalty" and m.restart.side == "home"
    assert m.restart_taker.player.shirt == clubs["SKH"].set_pieces["penalties"][0]


def test_a_foul_outside_the_box_is_a_free_kick_or_advantage(clubs):
    m, att, dfd = _placed(clubs)
    att.x, att.y = pitch.to_team(40, pitch.GOAL_Y, m.east("home"))
    dfd.x, dfd.y = att.x, att.y + 1
    discipline.commit_foul(m, dfd, att)
    assert m.restart is not None and m.restart.kind == "free_kick" and m.restart.side == "home"


def test_a_red_card_removes_the_player_and_drops_the_team_deeper(clubs):
    m, _, dfd = _placed(clubs)
    before = m.style("away")["press_height"]
    discipline.send_off(m, dfd)
    m._update_style()
    assert not dfd.on and len(m.on_pitch("away")) == 10
    assert m.style("away")["press_height"] == pytest.approx(max(before - 0.15, 0.0))


def test_a_sent_off_keeper_is_replaced_in_goal(clubs):
    m, _, _ = _placed(clubs)
    gk = m.keeper("away")
    discipline.send_off(m, gk)
    keeper = m.keeper("away")
    assert keeper is not None and keeper is not gk and len(m.on_pitch("away")) == 10
