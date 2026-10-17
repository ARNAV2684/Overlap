# discipline.py — Discipline
#
# Purpose: fouls (with advantage), yellow and red cards, substitutions and offside
# Inputs:  the match state, the defender and carrier in a duel, the pass being played
# Outputs: Foul, Card, Substitution and Offside events; free kicks and penalties to restart from
# Spec:    generator/specs/set-pieces-and-discipline.md §2-§5

from __future__ import annotations

import math

import config
import pitch
from state import Body

FOUL_BASE = {"tackle": 0.20, "aerial": 0.08, "take_on": 0.18}


class MatchAbandoned(RuntimeError):
    """A side fell below seven players (laws of the game)."""


# --- fouls (§2) --------------------------------------------------------------------------------------------------


def from_behind(defender: Body, carrier: Body) -> bool:
    """The defender comes from behind the carrier's direction of travel."""
    sp = carrier.speed
    if sp < 1.0:
        return False
    ux, uy = carrier.vx / sp, carrier.vy / sp
    return (defender.x - carrier.x) * ux + (defender.y - carrier.y) * uy < -0.3


def foul_chance(m, defender: Body, carrier: Body, kind: str) -> float:
    p = FOUL_BASE[kind] * (1 + (65 - defender.attr("tackling")) / 100)
    p *= 1 + 0.3 * (1 - defender.fatigue()) / config.TIRED_MAX_LOSS
    if from_behind(defender, carrier):
        p *= config.FOUL_FROM_BEHIND
    if m.in_counter(carrier.side):
        p *= config.FOUL_TACTICAL
    diff = m.score[defender.side] - m.score[carrier.side]
    if diff < 0 and m.minute() >= 70:
        p *= 1.2
    if defender.role in ("stopper", "ball_winner"):
        p *= 1.3
    if m.wet:
        p *= 1.1
    if defender.side == "home":
        p *= 1 - config.HOME_FOUL_LENIENCY * m.crowd_fill
    if pitch.in_own_box(*m.tpos(defender)):
        p *= config.FOUL_IN_OWN_BOX
    p *= m.director.multiplier(m, defender.side, "foul_rate")      # storylines.md §2
    return min(p, 0.6)


def clear_chance(m, defender: Body, carrier: Body) -> bool:
    """Denying an obvious goal-scoring opportunity: the carrier is within 20 m of goal, central, and no other
    outfield defender is between him and the goal."""
    cx, cy = m.tpos(carrier)
    if pitch.goal_distance(cx, cy) > 20 or abs(cy - pitch.GOAL_Y) > 12:
        return False
    east = m.east(carrier.side)
    return not any(pitch.to_team(o.x, o.y, east)[0] > cx for o in m.on_pitch(defender.side)
                   if o is not defender and not o.is_gk)


def card_for(m, defender: Body, carrier: Body, rng) -> str | None:
    """Yellow, straight red or none for a foul (§3). A storyline's card_rate scales every card chance."""
    rate = m.director.multiplier(m, defender.side, "card_rate")
    if clear_chance(m, defender, carrier):
        return "red" if rng.random() < min(config.CARD_DOGSO_RED * rate, 0.95) else "yellow"
    behind = from_behind(defender, carrier)
    if behind and rng.random() < config.CARD_BEHIND_RED * rate:
        return "red"
    if m.in_counter(carrier.side):
        p = config.CARD_TACTICAL_YELLOW
    elif behind:
        p = config.CARD_BEHIND_YELLOW
    else:
        if rng.random() < config.CARD_ORDINARY_RED * rate:
            return "red"
        p = config.CARD_ORDINARY_YELLOW
    return "yellow" if rng.random() < min(p * rate, 0.95) else None


def commit_foul(m, offender: Body, victim: Body) -> None:
    """One Foul by the offender; then a card, and a penalty, free kick or advantage."""
    rng = m.rng["discipline"]
    at = (victim.x, victim.y)
    if m.carrying and m.carrier is victim:
        m.end_carry(victim)
    m.emit("Foul", offender, fouled_player_id=victim.pid)
    card = card_for(m, offender, victim, rng)
    if card == "yellow" and offender.pid in m.yellows:
        card = "second_yellow"
    if card:
        m.emit("Card", offender, card=card)
        m.stoppage_ms += int(rng.uniform(*config.DEAD_TIME_S["card"]) * 1000)
        if card == "yellow":
            m.yellows.add(offender.pid)
        else:
            send_off(m, offender)
    side = victim.side
    vx, _ = m.tpos(victim)
    if pitch.in_box(*m.tpos(victim)):
        spot = pitch.to_team(pitch.LENGTH - pitch.PENALTY_SPOT, pitch.GOAL_Y, m.east(side))
        dead = rng.uniform(*config.DEAD_TIME_S["penalty"])
        m.stoppage_ms += int(dead * 1000)
        m.schedule_restart("penalty", side, spot[0], spot[1], dead)
        return
    if not card and vx > pitch.LENGTH * 0.6 and rng.random() < config.ADVANTAGE_SHARE and victim.on:
        m.give_ball(victim)                     # advantage: the foul stands, play goes on
        return
    near_goal = vx > pitch.LENGTH - 30
    dead = rng.uniform(*config.DEAD_TIME_S["free_kick_near" if near_goal else "free_kick"])
    m.schedule_restart("free_kick", side, at[0], at[1], dead)


def send_off(m, b: Body) -> None:
    """The player leaves; the team reshapes and drops deeper (§3)."""
    side = b.side
    b.on = False
    m.reds[side] += 1
    if m.carrier is b:
        m.carrier = None
    if m.pressers and b in m.pressers:
        m.pressers.remove(b)
    team = m.on_pitch(side)
    if len(team) < 7:
        raise MatchAbandoned(f"{m.match_id}: {m.team_id[side]} below seven players (seed {m.seed})")
    if b.is_gk:
        _replace_keeper(m, side, b)
        return
    if b.slot not in ("ST", "GK"):
        cover = [o for o in team if o.slot not in ("ST", "GK")]
        if cover:
            from movement import ANCHORS
            mover = max(cover, key=lambda o: (ANCHORS[m.formation[side]][o.slot_index][0], -o.slot_index))
            if ANCHORS[m.formation[side]][mover.slot_index][0] > ANCHORS[m.formation[side]][b.slot_index][0]:
                mover.slot_index, mover.slot = b.slot_index, b.slot


def _replace_keeper(m, side: str, keeper: Body) -> None:
    """A sent-off keeper: a substitute keeper comes on for an outfield player if a substitution is left;
    otherwise an outfield player goes in goal."""
    from movement import ANCHORS
    outfield = [o for o in m.on_pitch(side) if not o.is_gk]
    out = max(outfield, key=lambda o: (ANCHORS[m.formation[side]][o.slot_index][0], -o.slot_index))
    spare = [p for p in m.bench[side] if p.pos == "GK" and p.shirt not in m.used_bench[side]]
    if spare and m.subs_used[side] < config.MAX_SUBS:
        new = m.substitute(out, spare[0])
        new.slot, new.slot_index = "GK", keeper.slot_index
        new.x, new.y = keeper.x, keeper.y
        return
    stand_in = min(outfield, key=lambda o: (-o.attr("aerial"), o.slot_index))
    stand_in.slot, stand_in.slot_index = "GK", keeper.slot_index


# --- substitutions (§4) ------------------------------------------------------------------------------------------


def plan_windows(rng) -> list[tuple[float, int]]:
    """(minute, how many) for the three stoppages a side may use."""
    return [(rng.uniform(55, 65), 2), (rng.uniform(68, 78), 2), (rng.uniform(80, 87), 1)]


def _off_order(m, side: str) -> list[Body]:
    team = [b for b in m.on_pitch(side) if not b.is_gk]
    diff = m.score[side] - m.score[m.other(side)]
    minute = m.minute()

    def priority(b: Body) -> tuple:
        tired = b.stamina < 0.4
        booked_risk = b.pid in m.yellows and b.slot not in ("ST", "LW", "RW", "AM") and abs(diff) <= 1 and minute >= 60
        tactical = (diff < 0 and minute >= 70 and b.slot in ("CB", "LB", "RB", "LWB", "RWB", "DM")) or \
            (diff > 0 and minute >= 75 and b.slot in ("ST", "LW", "RW", "AM"))
        return (not tired, not booked_risk, not tactical, b.player.overall * b.stamina, b.slot_index)

    return sorted(team, key=priority)


def _best_on(m, side: str, slot: str, want_forward: bool, want_defender: bool) -> Body | None:
    pool = [p for p in m.bench[side] if p.shirt not in m.used_bench[side]]
    if want_forward:
        fwd = [p for p in pool if p.pos in ("ST", "LW", "RW", "AM")]
        pool = fwd or pool
    elif want_defender:
        dfd = [p for p in pool if p.pos in ("CB", "LB", "RB", "DM", "CM")]
        pool = dfd or pool
    fits = [p for p in pool if p.plays(slot) and p.pos != "GK"] or [p for p in pool if p.pos != "GK"]
    return max(fits, key=lambda p: (p.overall, -p.shirt), default=None)


def maybe_substitute(m) -> None:
    """At a dead ball: make the substitutions whose window has come (at most 5 in 3 windows)."""
    minute = m.minute()
    for side in ("home", "away"):
        plan = m.sub_windows[side]
        if not plan or minute < plan[0][0] or m.subs_used[side] >= config.MAX_SUBS:
            continue
        _, count = plan.pop(0)
        diff = m.score[side] - m.score[m.other(side)]
        made = 0
        for off in _off_order(m, side):
            if made >= count or m.subs_used[side] >= config.MAX_SUBS:
                break
            want_fwd = diff < 0 and minute >= 70 and off.slot in ("CB", "LB", "RB", "LWB", "RWB", "DM")
            want_def = diff > 0 and minute >= 75 and off.slot in ("ST", "LW", "RW", "AM")
            on = _best_on(m, side, off.slot, want_fwd, want_def)
            if on is None:
                break
            m.substitute(off, on)
            made += 1
        if made:
            m.stoppage_ms += int(m.rng["discipline"].uniform(*config.DEAD_TIME_S["substitution"]) * 1000)


# --- offside (§5) ------------------------------------------------------------------------------------------------


def offside(m, passer: Body, receiver: Body, action: str, rng) -> bool:
    """A runner played in behind may have mistimed his run against the line (§5)."""
    if action not in ("through_ball", "long_pass") or receiver.is_gk:
        return False
    rx = pitch.team_pct(receiver.x, receiver.y, m.east(receiver.side))[0]
    bx = pitch.team_pct(m.ball_x, m.ball_y, m.east(receiver.side))[0]
    line = m.offside_line[receiver.side]
    if rx < 50 or rx < bx or rx < line - 6:
        return False
    def_line = m.style(m.other(receiver.side))["line_height"]
    p = config.OFFSIDE_BASE + config.OFFSIDE_LINE_HEIGHT * def_line
    p -= 0.1 * (receiver.attr("positioning") - 70) / 30
    if receiver.role in ("pressing_forward", "poacher"):
        p *= 1.3
    if rx > line:
        p += 0.4
    return rng.random() < min(max(p, 0.0), 0.9)


def offside_spot(m, receiver: Body) -> tuple[float, float]:
    return receiver.x, receiver.y


def distance(a: Body, b: Body) -> float:
    return math.hypot(a.x - b.x, a.y - b.y)
