# outcomes.py — Action outcomes
#
# Purpose: decide whether an action works, and what happens next; the shot model (xG) and shot results
# Inputs:  the players involved, positions, pressure, conditions
# Outputs: success or failure, interception and loose-ball points, shot outcomes
# Spec:    generator/specs/actions.md §3-§5
#
# Positions passed in are team-frame metres for the acting side unless a name says otherwise.

from __future__ import annotations

import math
import random

import config
import pitch
from state import Body


def logistic(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def logit(p: float) -> float:
    p = min(max(p, 1e-6), 1 - 1e-6)
    return math.log(p / (1 - p))


def skill(rating: float) -> float:
    return (rating - 70) / config.SKILL_LOGIT_PER


# --- Which foot (actions.md §3) ----------------------------------------------------------------------------------


def uses_weak_foot(b: Body, rng: random.Random, share: float = config.WEAK_FOOT_PASS_SHARE) -> bool:
    return b.player.preferred_foot != "both" and rng.random() < share


def body_part(b: Body, weak: bool) -> str:
    foot = b.player.preferred_foot
    if foot == "both":
        return "right_foot"
    strong = "left_foot" if foot == "left" else "right_foot"
    return ("right_foot" if strong == "left_foot" else "left_foot") if weak else strong


def weak_penalty(b: Body, per_point: float) -> float:
    return (5 - b.player.weak_foot) * per_point


# --- Passing -----------------------------------------------------------------------------------------------------


def pass_success(action: str, passer: Body, receiver: Body, length_m: float, pressured: bool, weak: bool,
                 wet: float, windy: bool, marked_m: float = 99.0) -> float:
    """Probability that a pass reaches its target, before interceptions (actions.md §3). `marked_m` is how close the
    nearest opponent is to where the ball is played."""
    z = logit(config.BASE_SUCCESS[action])
    if marked_m < config.MARKED_RADIUS_M:
        z += config.MARKED_LOGIT * (1 - marked_m / config.MARKED_RADIUS_M)
    z += skill(passer.attr("passing"))
    if action in ("through_ball", "switch", "long_pass"):
        z += 0.5 * skill(passer.attr("vision"))
    if action in ("short_pass", "cutback") and length_m > 12:
        z += config.SHORT_PASS_LENGTH_LOGIT * (length_m - 12)
    if action == "cross":
        z += 0.5 * skill(receiver.attr("aerial"))
    if pressured:
        z += config.PRESSURE_LOGIT * (0.5 if passer.attr("composure") >= 80 else 1.0)
    z += config.WET_ACCURACY_LOGIT * wet
    if windy and action in config.LOFTED:
        z -= 0.2
    p = logistic(z) * (2 - passer.fatigue()) ** -1
    if weak:
        p *= 1 - weak_penalty(passer, config.WEAK_FOOT_PASS_PENALTY)
    return min(max(p, 0.02), 0.995)


def intercept_chance(defender: Body, dist_to_line: float, ball_kmh: float) -> float:
    """A defender within INTERCEPT_RADIUS_M of a ground pass's path may cut it out."""
    if dist_to_line >= config.INTERCEPT_RADIUS_M:
        return 0.0
    near = 1 - dist_to_line / config.INTERCEPT_RADIUS_M
    pace_read = (defender.attr("positioning") + defender.attr("pace")) / 140
    slow = max(0.4, 1.3 - ball_kmh / 80)
    return config.INTERCEPT_BASE * near * pace_read * slow


# --- Duels -------------------------------------------------------------------------------------------------------


def take_on_success(attacker: Body, defender: Body) -> float:
    z = logit(config.BASE_SUCCESS["take_on"])
    z += skill((attacker.attr("dribbling") + attacker.attr("acceleration")) / 2)
    z -= skill((defender.attr("tackling") + defender.attr("pace")) / 2)
    return logistic(z)


def tackle_success(defender: Body, carrier: Body) -> float:
    z = logit(config.BASE_SUCCESS["tackle"]) + skill(defender.attr("tackling")) - skill(carrier.attr("dribbling"))
    return logistic(z)


def aerial_win(a: Body, b: Body) -> float:
    """Probability that `a` wins an aerial duel against `b`."""
    return logistic(skill(a.attr("aerial")) - skill(b.attr("aerial")))


# --- Shots (actions.md §4) ---------------------------------------------------------------------------------------


def in_triangle(px: float, py: float, tx: float, ty: float) -> bool:
    """Is (px, py) inside the triangle from the ball (tx, ty) to the two posts? Team-frame metres."""
    p1 = (pitch.LENGTH, pitch.GOAL_Y - pitch.GOAL_HALF_WIDTH)
    p2 = (pitch.LENGTH, pitch.GOAL_Y + pitch.GOAL_HALF_WIDTH)

    def cross(ax, ay, bx, by, cx, cy):
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    d1 = cross(tx, ty, p1[0], p1[1], px, py)
    d2 = cross(p1[0], p1[1], p2[0], p2[1], px, py)
    d3 = cross(p2[0], p2[1], tx, ty, px, py)
    neg = d1 < 0 or d2 < 0 or d3 < 0
    pos = d1 > 0 or d2 > 0 or d3 > 0
    return not (neg and pos)


def xg(tx: float, ty: float, *, header: bool, weak: bool, weak_foot: int, situation: str, assist: str,
       defenders_in_way: int, keeper_off_line_m: float) -> float:
    """Shot quality from the public-anchored logistic model (actions.md §4). Team-frame metres."""
    if situation == "penalty":
        return config.PENALTY_XG
    d = max(pitch.goal_distance(tx, ty), 0.5)
    a = pitch.goal_angle(tx, ty)
    z = config.XG_B0 + config.XG_B_LOGD * math.log(d) + config.XG_B_ANGLE * a + config.XG_B_D * d
    if header:
        z += config.XG_HEADER
    elif weak:
        z += config.XG_WEAK_FOOT * (5 - weak_foot)
    z += config.XG_SITUATION.get(situation, 0.0)
    z += config.XG_ASSIST.get(assist, 0.0)
    z += config.XG_PER_DEFENDER * defenders_in_way
    z += config.XG_KEEPER_OFF_LINE * min(max(keeper_off_line_m - 1.5, 0.0), 4.0)
    return min(logistic(z), config.BIG_SHOT_XG_MAX)


def resolve_shot(rng: random.Random, value: float, shooter: Body, keeper: Body | None, *, header: bool,
                 weak: bool, pressured: bool, defenders_in_way: int, windy: bool, distance_m: float) -> dict:
    """Blocked, off target (missed or woodwork), saved or a goal; plus speed and goal-mouth spot."""
    blocked = defenders_in_way and rng.random() < 1 - (1 - config.BLOCK_PER_DEFENDER) ** defenders_in_way
    p_block = 1 - (1 - config.BLOCK_PER_DEFENDER) ** defenders_in_way if defenders_in_way else 0.0
    p_on_avg = min(max(config.ON_TARGET_BASE + config.ON_TARGET_XG_SLOPE * value, config.ON_TARGET_RANGE[0]),
                   config.ON_TARGET_RANGE[1])
    p_on = config.ON_TARGET_BASE + config.ON_TARGET_XG_SLOPE * value
    p_on += config.ON_TARGET_PER_FINISHING * (shooter.attr("finishing") - 70)
    if pressured:
        p_on -= 0.05
    if weak:
        p_on -= weak_penalty(shooter, config.WEAK_FOOT_SHOT_PENALTY)
    if windy and distance_m > 20:
        p_on -= 0.05
    p_on *= shooter.fatigue()
    p_on = min(max(p_on, config.ON_TARGET_RANGE[0]), config.ON_TARGET_RANGE[1])
    lo, hi = config.SHOT_SPEED_KMH["head" if header else "foot"]
    speed = rng.uniform(lo, hi) * (0.85 + 0.15 * shooter.attr("finishing") / 99)
    if blocked:
        return {"outcome": "blocked", "speed": round(speed, 1), "mouth_y": None, "mouth_z": None}
    if rng.random() >= p_on:
        if rng.random() < config.WOODWORK_SHARE:
            y = rng.choice([rng.uniform(-3, 1), rng.uniform(99, 103)])
            return {"outcome": "woodwork", "speed": round(speed, 1), "mouth_y": round(y, 1),
                    "mouth_z": round(rng.uniform(0.2, 2.44), 2)}
        if rng.random() < 0.5:
            y, z = rng.choice([rng.uniform(-60, -2), rng.uniform(102, 160)]), rng.uniform(0.0, 3.0)
        else:
            y, z = rng.uniform(-20, 120), rng.uniform(2.5, 6.0)
        return {"outcome": "missed", "speed": round(speed, 1), "mouth_y": round(y, 1), "mouth_z": round(z, 2)}
    # On target: goal or save. Divide by an average shooter's chance of hitting the target, so goals track xG for an
    # average finisher against an average keeper, and finishing skill counts once on each step.
    p_goal = min(config.GOAL_GIVEN_ON_TARGET_MAX, value / max(p_on_avg * (1 - p_block), 1e-3))
    gk = keeper.attr("goalkeeping") if keeper else 50
    p_goal = logistic(logit(p_goal) + config.FINISH_LOGIT_PER_10 * (shooter.attr("finishing") - gk) / 10)
    corner_bias = 0.5 + 0.4 * (shooter.attr("finishing") / 99)
    y = 50 + rng.choice([-1, 1]) * rng.uniform(0, 48) ** corner_bias * (48 ** (1 - corner_bias))
    z = rng.uniform(0.0, 2.3)
    outcome = "goal" if rng.random() < p_goal else "saved"
    return {"outcome": outcome, "speed": round(speed, 1), "mouth_y": round(y, 1), "mouth_z": round(z, 2)}
