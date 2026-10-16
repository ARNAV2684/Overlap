# decisions.py — On-ball decisions
#
# Purpose: choose what the player on the ball does next, and the target of a pass
# Inputs:  the carrier, every other player, the ball, both sides' match style, pressure, conditions
# Outputs: an action and its target
# Spec:    generator/specs/actions.md §1-§2
#
# weight = base(zone, action) × attributes × role × team style × pressure × conditions; one weighted pick.

from __future__ import annotations

import math
import random
from dataclasses import dataclass

import config
import pitch
from state import Body


@dataclass
class Choice:
    action: str
    target: Body | None = None      # receiver for passes
    point: tuple[float, float] | None = None   # team-frame metres the ball (or the carrier) goes to


def zone(tx_pct: float, ty_pct: float) -> str:
    own, mid, final = config.ZONE_X
    if tx_pct < own:
        return "own"
    if tx_pct < mid:
        return "middle"
    if tx_pct < final:
        return "final_wide" if ty_pct < config.WIDE_Y or ty_pct > 100 - config.WIDE_Y else "final_central"
    return "box"


def _attr_factor(action: str, b: Body) -> float:
    a = b.attr
    if action == "take_on":
        return (a("dribbling") / 70) ** 2
    if action in ("through_ball", "switch"):
        return (a("vision") / 70) ** 2
    if action == "long_pass":
        return a("passing") / 70
    if action == "carry":
        return (a("dribbling") + a("acceleration")) / 140
    if action == "clearance":
        return 1.5 - a("composure") / 140
    return 1.0


def _style_factor(action: str, st: dict, in_counter: bool) -> float:
    f = 1.0
    if action in ("long_pass", "through_ball"):
        f *= 0.5 + st["directness"]
    if action == "short_pass":
        f *= 1.5 - st["directness"]
    if action in ("cross", "switch"):
        f *= 0.5 + st["width"]
    if in_counter:
        if action in ("through_ball", "long_pass", "carry"):
            f *= 1 + st["counter_attack"]
        if action == "hold":
            f *= 1 - st["counter_attack"]
    return f


def _role_factor(action: str, b: Body, tx_pct: float, ty_pct: float) -> float:
    f = config.ROLE_WEIGHTS.get(b.role, {}).get(action, 1.0)
    in_box = tx_pct >= config.ZONE_X[2]
    if action == "shot":
        if b.role == "poacher":
            f *= 1.4 if in_box else 0.5
        elif b.role == "box_to_box" and in_box:
            f *= 1.2
        elif b.role == "inverted_winger" and (18 <= ty_pct <= 35 or 65 <= ty_pct <= 82):
            f *= 1.4
    return f


def pass_candidates(m, carrier: Body, action: str) -> list[tuple[Body, tuple[float, float], float]]:
    """(receiver, target point in team-frame metres, score) for every teammate this pass could go to."""
    east = m.east(carrier.side)
    cx, cy = pitch.to_team(carrier.x, carrier.y, east)
    opps = [pitch.to_team(o.x, o.y, east) for o in m.on_pitch(m.other(carrier.side))]
    line_x = pitch.from_pct(m.offside_line[carrier.side], 0)[0]
    out = []
    for r in m.on_pitch(carrier.side):
        if r is carrier:
            continue
        rx, ry = pitch.to_team(r.x, r.y, east)
        tx, ty = rx, ry
        if action == "through_ball":
            if rx < cx + 3 or r.is_gk:
                continue
            tx, ty = min(max(rx + 9, line_x + 3), pitch.LENGTH - 6), ry
        elif action == "cross":
            if not pitch.in_box(rx, ry):
                continue
            ty = ry + (pitch.GOAL_Y - ry) * 0.2
        elif action == "cutback":
            if not (pitch.LENGTH - 20 <= rx <= pitch.LENGTH - 8 and abs(ry - pitch.GOAL_Y) < 12):
                continue
        length = math.hypot(tx - cx, ty - cy)
        if action == "short_pass" and (length > config.LONG_PASS_M or length < 4):
            continue
        if action == "long_pass" and (length <= config.LONG_PASS_M or tx < cx - 5):
            continue
        if action == "switch" and abs(ty - cy) <= config.SWITCH_DY_M:
            continue
        if r.is_gk and (action != "short_pass" or cx > 40):
            continue
        open_m = min((math.hypot(ox - tx, oy - ty) for ox, oy in opps), default=20.0)
        lane = min((pitch.segment_distance(cx, cy, tx, ty, ox, oy)[0] for ox, oy in opps), default=10.0)
        progress = (tx - cx) / 30
        score = min(open_m, 10) / 10 + min(lane, 5) / 5 * (0.4 if action in config.LOFTED else 1.0) + progress
        if action == "cross":
            score += r.attr("aerial") / 99 + (0.5 if r.role == "target_man" else 0.0)
        if action == "cutback" and r.slot in ("CM", "AM", "DM"):
            score += 0.3
        if carrier.role == "deep_playmaker" and action in ("long_pass", "through_ball"):
            score += (tx - cx) / 40
        out.append((r, (tx, ty), score))
    return out


def pick_target(rng: random.Random, carrier: Body, cands: list) -> tuple[Body, tuple[float, float]]:
    """Softmax over pass scores; better vision picks the best option more often (actions.md §2)."""
    temp = 0.6 - 0.4 * (carrier.attr("vision") - 40) / 59
    temp = min(max(temp, 0.15), 0.6)
    top = max(c[2] for c in cands)
    weights = [math.exp((c[2] - top) / temp) for c in cands]
    r, point, _ = rng.choices(cands, weights=weights, k=1)[0]
    return r, point


def carry_point(m, carrier: Body, rng: random.Random) -> tuple[float, float]:
    east = m.east(carrier.side)
    cx, cy = pitch.to_team(carrier.x, carrier.y, east)
    ahead = rng.uniform(6, 15)
    inside = 0.0
    if carrier.role == "inverted_winger":
        inside = (pitch.GOAL_Y - cy) * 0.35
    return min(cx + ahead, pitch.LENGTH - 3), min(max(cy + inside + rng.uniform(-4, 4), 2), pitch.WIDTH - 2)


def choose(m, carrier: Body, rng: random.Random) -> Choice:
    """The carrier's next action (actions.md §2)."""
    side = carrier.side
    east = m.east(side)
    cx, cy = pitch.to_team(carrier.x, carrier.y, east)
    px, py = pitch.pct(cx, cy)
    st = m.style(side)
    pressured = m.under_pressure(carrier)
    in_counter = m.in_counter(side)
    if carrier.is_gk:
        cands = {a: pass_candidates(m, carrier, a) for a in ("short_pass", "long_pass")}
        w_short = (0.3 + st["build_up_short"] * 1.4) if cands["short_pass"] else 0.0
        w_long = (1.7 - st["build_up_short"] * 1.4) if cands["long_pass"] else 0.0
        w_short *= config.ROLE_WEIGHTS.get(carrier.role, {}).get("short_pass", 1.0)
        w_long *= config.ROLE_WEIGHTS.get(carrier.role, {}).get("long_pass", 1.0)
        if w_short + w_long == 0:
            return Choice("hold")
        action = rng.choices(["short_pass", "long_pass"], weights=[w_short, w_long], k=1)[0]
        r, point = pick_target(rng, carrier, cands[action])
        return Choice(action, r, point)

    base = config.BASE_WEIGHTS[zone(px, py)]
    weights: dict[str, float] = {}
    cand_cache: dict[str, list] = {}
    for action in config.ACTIONS:
        w = base.get(action, 0.0)
        if action == "shot":
            if px < config.ZONE_X[1]:
                continue
            value = m.shot_xg(carrier, open_play=True)
            if value < config.MIN_SHOT_XG:
                continue
            w = config.SHOT_APPETITE * value / (0.10 + value) + base.get("shot", 0.0)
            w *= carrier.attr("finishing") / 70
            if pitch.goal_distance(cx, cy) > 20:
                w *= carrier.attr("finishing") / 70
            w *= m.shot_appetite(side)
        if w <= 0:
            continue
        if action in ("short_pass", "long_pass", "through_ball", "cross", "cutback", "switch"):
            cands = pass_candidates(m, carrier, action)
            if not cands:
                continue
            cand_cache[action] = cands
        if action == "take_on" and m.nearest_opponent_dist(carrier) > 3.5:
            continue
        w *= _attr_factor(action, carrier) * _role_factor(action, carrier, px, py)
        w *= _style_factor(action, st, in_counter)
        if pressured:
            if action in ("through_ball", "carry") or (action == "take_on" and px < 50):
                w *= 0.6
            if action in ("short_pass", "clearance", "hold"):
                w *= 1.3
        if m.windy and action in ("long_pass", "switch", "cross"):
            w *= config.WIND_LONG_WEIGHT
        weights[action] = w
    if not weights:
        return Choice("hold")
    names = list(weights)
    action = rng.choices(names, weights=[weights[a] for a in names], k=1)[0]
    if action in cand_cache:
        r, point = pick_target(rng, carrier, cand_cache[action])
        return Choice(action, r, point)
    if action == "carry":
        return Choice("carry", point=carry_point(m, carrier, rng))
    return Choice(action)
