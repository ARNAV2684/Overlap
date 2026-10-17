# movement.py — Movement model
#
# Purpose: move every player and the ball each 200 ms step, and record 5 Hz tracking frames
# Inputs:  the match state (positions, ball, possession, style, roles)
# Outputs: new positions and velocities; tracking frames (CONTRACTS.md §4)
# Spec:    generator/specs/movement.md
#
# The engine calls this every step, so the positions it decides from are the positions that go out as tracking.

from __future__ import annotations

import math
import random

import config
import pitch
from state import Body

# movement.md §1: each slot's mid-block anchor, team frame 0-100, in world.FORMATIONS slot order.
ANCHORS: dict[str, tuple[tuple[float, float], ...]] = {
    "4-3-3": ((5, 50), (30, 85), (25, 62), (25, 38), (30, 15), (42, 50), (52, 68), (52, 32), (70, 85), (78, 50),
              (70, 15)),
    "4-2-3-1": ((5, 50), (30, 85), (25, 62), (25, 38), (30, 15), (42, 62), (42, 38), (64, 85), (64, 50), (64, 15),
                (78, 50)),
    "4-4-2": ((5, 50), (30, 85), (25, 62), (25, 38), (30, 15), (55, 85), (48, 60), (48, 40), (55, 15), (75, 60),
              (75, 40)),
    "4-1-4-1": ((5, 50), (30, 85), (25, 62), (25, 38), (30, 15), (40, 50), (56, 85), (54, 64), (54, 36), (56, 15),
                (76, 50)),
    "3-4-3": ((5, 50), (24, 72), (22, 50), (24, 28), (48, 90), (48, 60), (48, 40), (48, 10), (70, 80), (78, 50),
              (70, 20)),
    "5-3-2": ((5, 50), (36, 92), (22, 68), (20, 50), (22, 32), (36, 8), (48, 70), (46, 50), (48, 30), (74, 60),
              (74, 40)),
    "5-4-1": ((5, 50), (32, 92), (20, 68), (18, 50), (20, 32), (32, 8), (46, 80), (42, 60), (42, 40), (46, 20),
              (68, 50)),
}


def _clip(v: float, lo: float, hi: float) -> float:
    return min(max(v, lo), hi)


def shape_target(m, b: Body) -> tuple[float, float]:
    """Where a player not involved with the ball wants to be, in pitch-frame metres (movement.md §1)."""
    side = b.side
    east = m.east(side)
    ax, ay = ANCHORS[m.formation[side]][b.slot_index]
    bx, by = pitch.team_pct(m.ball_x, m.ball_y, east)
    st = m.style(side)
    wing = 1 if ay > 50 else -1
    if m.poss_side == side and m.ball_live:
        x = ax + 0.45 * (bx - 50) + 12 * st["line_height"]
        y = 50 + (ay - 50) * (0.8 + 0.4 * st["width"]) + 0.25 * (by - 50)
        role = b.role
        ball_my_side = (by - 50) * wing > 0
        if role == "inverted_fullback":
            x, y = ax + 14 + 0.45 * (bx - 50), 50 + 15 * wing
        elif role in ("overlapping_fullback", "wing_back") and ball_my_side:
            x, y = x + 15, 50 + 45 * wing
        elif role == "box_to_box" and bx > 66 and abs(by - 50) > 25:
            x, y = 88, 50 - 8 * wing
        elif role == "inverted_winger" and bx > 60:
            y = 50 + 20 * wing
        elif role == "wide_winger":
            y = 50 + 45 * wing
        elif role == "poacher":
            x, y = m.offside_line[side] - 1.5, 50 + 6 * (1 if by > 50 else -1)
        elif role == "target_man":
            y = 50 + 0.15 * (by - 50)
        if b.slot != "GK":
            x = min(x, max(m.offside_line[side], bx) - 0.5)     # don't stand offside
    else:
        line = max(18 + 22 * st["line_height"] + 0.25 * (bx - 50), 8)
        x = line + (ax - 25) * 0.85
        y = 50 + (ay - 50) * 0.75 + 0.30 * (by - 50)
    if b.slot == "GK":
        if m.poss_side == side and m.ball_live and bx > 50:
            x = 15 / 1.05 if b.role == "sweeper_keeper" else 5 / 1.05
        else:
            x = 4 + 0.04 * max(bx - 20, 0)
        y = 50 + 0.15 * (by - 50)
    x, y = _clip(x, 1, 99), _clip(y, 2, 98)
    return pitch.to_team(*pitch.from_pct(x, y), east)


def step_body(b: Body, tx: float, ty: float, sprint: bool, rng: random.Random, heat: float) -> None:
    """One 200 ms step toward (tx, ty), within the player's speed and acceleration limits (movement.md §2)."""
    dt = config.STEP_MS / 1000
    tx += rng.uniform(-config.WOBBLE_M, config.WOBBLE_M)
    ty += rng.uniform(-config.WOBBLE_M, config.WOBBLE_M)
    dx, dy = tx - b.x, ty - b.y
    gap = math.hypot(dx, dy)
    fat = b.fatigue()
    vmax = b.top_speed * fat
    want = vmax if sprint else config.JOG_SHARE * vmax
    want = min(want, gap / config.ARRIVE_S)
    dvx = (dx / gap * want if gap > 1e-6 else 0.0) - b.vx
    dvy = (dy / gap * want if gap > 1e-6 else 0.0) - b.vy
    speeding_up = want > b.speed
    cap = (b.accel * fat if speeding_up else config.DECEL_MAX) * dt
    dv = math.hypot(dvx, dvy)
    if dv > cap:
        dvx, dvy = dvx / dv * cap, dvy / dv * cap
    b.vx += dvx
    b.vy += dvy
    sp = b.speed
    if sp > vmax:
        b.vx, b.vy = b.vx / sp * vmax, b.vy / sp * vmax
        sp = vmax
    nx, ny = pitch.clamp(b.x + b.vx * dt, b.y + b.vy * dt)
    b.dist += math.hypot(nx - b.x, ny - b.y)
    b.x, b.y = nx, ny
    b.top_seen = max(b.top_seen, sp)
    drain = config.STAMINA_DRAIN_BASE + config.STAMINA_DRAIN_RUN * (sp / 7.0) ** 3
    drain *= (0.6 + 0.8 * (1 - b.attr("stamina") / 99)) * heat
    b.stamina = max(b.stamina - drain, 0.0)


def held_ball(b: Body, east: bool) -> tuple[float, float]:
    """A held ball sits just ahead of the carrier, in his direction of travel (or toward goal when standing)."""
    sp = b.speed
    if sp > 0.3:
        ux, uy = b.vx / sp, b.vy / sp
    else:
        ux, uy = (1.0, 0.0) if east else (-1.0, 0.0)
    return pitch.clamp(b.x + ux * config.BALL_HELD_AHEAD_M, b.y + uy * config.BALL_HELD_AHEAD_M)


def frame(m) -> dict:
    """One tracking frame (CONTRACTS.md §4): ball, then home players, then away, each in slot order."""
    bx, by = pitch.pct(m.ball_x, m.ball_y)
    players = []
    for side in ("home", "away"):
        for b in m.on_pitch(side):
            px, py = pitch.pct(b.x, b.y)
            players.append({"player_id": b.pid, "x": px, "y": py, "speed_kmh": round(b.speed * 3.6, 1),
                            "dist_m": round(b.dist, 1)})
    return {
        "match_id": m.match_id, "period": m.period, "period_ms": m.period_ms, "match_ms": m.match_ms,
        "ball": {"x": bx, "y": by, "z": round(m.ball_z, 2), "speed_kmh": round(m.ball_speed * 3.6, 1)},
        "players": players,
    }
