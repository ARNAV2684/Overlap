# set_pieces.py — Restarts
#
# Purpose: kickoffs, throw-ins, goal kicks and corners: who takes them, where everyone stands, what the taker does
# Inputs:  the restart (kind, side, spot) and the match state
# Outputs: players' targets while the ball is dead; the restart's events and the ball's flight
# Spec:    generator/specs/set-pieces-and-discipline.md §1
#
# Free kicks and penalties come with fouls (discipline.py, milestone M4).

from __future__ import annotations

import pitch
from state import Body, Restart


def taker(m, r: Restart) -> Body:
    team = m.on_pitch(r.side)
    east = m.east(r.side)
    if r.kind == "goal_kick":
        return next(b for b in team if b.is_gk)
    if r.kind == "kickoff":
        forwards = [b for b in team if b.slot in ("ST", "AM")] or [b for b in team if not b.is_gk]
        return min(forwards, key=lambda b: (-pitch.to_team(b.x, b.y, east)[0], b.slot_index))
    if r.kind == "corner":
        listed = [b for s in m.club[r.side].set_pieces["corners"] for b in team if b.player.shirt == s]
        if listed:
            return listed[0]
        outfield = [b for b in team if not b.is_gk]
        return max(outfield, key=lambda b: (b.attr("passing"), -b.slot_index))
    # throw-in: nearest full-back, wing-back or wide player
    wide = [b for b in team if b.slot in ("LB", "RB", "LWB", "RWB", "LM", "RM", "LW", "RW")] or \
        [b for b in team if not b.is_gk]
    return min(wide, key=lambda b: (abs(b.x - r.x) + abs(b.y - r.y), b.slot_index))


def corner_attackers(m, side: str) -> list[Body]:
    """The five best headers go into the box; a target man first."""
    outfield = [b for b in m.on_pitch(side) if not b.is_gk]
    return sorted(outfield, key=lambda b: (-(b.attr("aerial") + (15 if b.role == "target_man" else 0)),
                                           b.slot_index))[:5]


def dead_ball_target(m, r: Restart, b: Body) -> tuple[float, float] | None:
    """Where a player stands while waiting for this restart; None means his normal shape."""
    east = m.east(b.side)
    if r.kind == "kickoff":
        if b is m.restart_taker:
            return pitch.LENGTH / 2, pitch.GOAL_Y
        tx, ty = pitch.to_team(*m.shape_of(b), east)
        return pitch.to_team(min(tx, pitch.LENGTH / 2 - 2.0), ty, east)
    if b is m.restart_taker:
        return r.x, r.y
    if r.kind == "corner":
        attacking = b.side == r.side
        if attacking and b in m.corner_box:
            i = m.corner_box.index(b)
            spots = ((pitch.LENGTH - 6, pitch.GOAL_Y - 3), (pitch.LENGTH - 6, pitch.GOAL_Y + 3),
                     (pitch.LENGTH - 10, pitch.GOAL_Y), (pitch.LENGTH - 12, pitch.GOAL_Y - 6),
                     (pitch.LENGTH - 12, pitch.GOAL_Y + 6))
            return pitch.to_team(*spots[i], east)
        if not attacking and not b.is_gk:
            marks = m.corner_box
            if b.slot_index - 1 < len(marks):
                tx, ty = pitch.to_team(marks[b.slot_index - 1].x, marks[b.slot_index - 1].y, east)
                return pitch.to_team(max(tx - 1.0, 1.0), ty, east)
            return pitch.to_team(5.0, pitch.GOAL_Y + (b.slot_index % 3 - 1) * 8, east)
    return None


def kickoff_spot() -> tuple[float, float]:
    return pitch.LENGTH / 2, pitch.GOAL_Y
