# set_pieces.py — Restarts
#
# Purpose: kickoffs, throw-ins, goal kicks and corners: who takes them, where everyone stands, what the taker does
# Inputs:  the restart (kind, side, spot) and the match state
# Outputs: players' targets while the ball is dead; the restart's events and the ball's flight
# Spec:    generator/specs/set-pieces-and-discipline.md §1
#
# Free kicks and penalties follow fouls (discipline.py); an offside gives an indirect free kick.

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
    if r.kind in ("corner", "free_kick", "penalty"):
        lists = {"corner": "corners", "free_kick": "free_kicks", "penalty": "penalties"}
        listed = [b for s in m.club[r.side].set_pieces[lists[r.kind]] for b in team if b.player.shirt == s]
        if listed:
            return listed[0]
        outfield = [b for b in team if not b.is_gk]
        if r.kind == "penalty":
            return max(outfield, key=lambda b: (b.attr("finishing") + b.attr("composure"), -b.slot_index))
        if r.kind == "free_kick":
            near = min(outfield, key=lambda b: (abs(b.x - r.x) + abs(b.y - r.y), b.slot_index))
            best = max(outfield, key=lambda b: (b.attr("passing"), -b.slot_index))
            return best if abs(best.x - r.x) + abs(best.y - r.y) < 40 else near
        return max(outfield, key=lambda b: (b.attr("passing"), -b.slot_index))
    if r.kind == "free_kick_indirect":
        outfield = [b for b in team if not b.is_gk] or team
        return min(outfield, key=lambda b: (abs(b.x - r.x) + abs(b.y - r.y), b.slot_index))
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
    if r.kind == "penalty":
        if b.is_gk and b.side != r.side:
            return pitch.to_team(pitch.LENGTH - 0.3, pitch.GOAL_Y, m.east(r.side))
        if b.is_gk:
            return None
        spread = (b.slot_index - 5) * 2.2 + (1.0 if b.side == r.side else -1.0)
        return pitch.to_team(pitch.LENGTH - pitch.BOX_DEPTH - 2.0, pitch.GOAL_Y + spread, m.east(r.side))
    if r.kind == "free_kick" and b.side != r.side and not b.is_gk:
        tx, ty = pitch.to_team(r.x, r.y, m.east(r.side))
        if pitch.goal_distance(tx, ty) <= 30:
            wall = sorted((o for o in m.on_pitch(b.side) if not o.is_gk),
                          key=lambda o: (abs(o.x - r.x) + abs(o.y - r.y), o.slot_index))[:3]
            if b in wall:
                gx, gy = pitch.LENGTH - tx, pitch.GOAL_Y - ty
                d = max((gx * gx + gy * gy) ** 0.5, 1.0)
                i = wall.index(b) - 1
                wx, wy = tx + gx / d * 9.15 - gy / d * 0.7 * i, ty + gy / d * 9.15 + gx / d * 0.7 * i
                return pitch.to_team(wx, wy, m.east(r.side))
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
