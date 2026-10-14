"""Seeded mock match engine: plays a whole match in 200 ms steps and records events + 5 Hz tracking.

This is a stand-in, not the real generator. It aims for output that is *shaped* exactly like CONTRACTS.md and is
internally consistent (events happen where the tracked players and ball actually are), with roughly sensible
football numbers. It is not calibrated.

Conventions used inside this file:
- positions are pitch-frame metres (x 0 → 105 east, y 0 → 68 south)
- "attack frame" means the acting team's frame in metres (x 0 = own goal line, y 0 = its left touchline)
- every event is created in time order, so `seq` increases with `match_ms`
"""

from __future__ import annotations

import math
import random
from dataclasses import dataclass, field

from . import pitch
from .world import FORMATIONS

TICK_MS = 200
DT = TICK_MS / 1000.0
HALF_MS = 45 * 60 * 1000

ON_BALL_TYPES = {"Pass", "Carry", "TakeOn", "Shot", "Clearance"}


@dataclass
class Player:
    pid: str
    side: str  # "home" / "away"
    pos: str
    attr: dict
    anchor: tuple[float, float]  # attack-frame metres
    x: float = 0.0
    y: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    dist_m: float = 0.0
    yellow: bool = False
    stun_until: int = -1
    jitter: tuple[float, float] = (0.0, 0.0)
    jitter_until: int = -1

    @property
    def top_speed(self) -> float:  # m/s
        return (25.5 + self.attr["pace"] * 0.095) / 3.6


@dataclass
class Flight:
    sx: float
    sy: float
    ex: float
    ey: float
    t0: int
    t1: int
    peak_z: float
    on_arrive: object  # callable(t)
    receiver: Player | None = None


@dataclass
class MatchResult:
    setup: dict
    events: list[dict]
    frames: list[dict]
    score: dict
    sent_off: dict[str, int] = field(default_factory=dict)  # player_id -> seq of the card


class Engine:
    def __init__(self, setup: dict):
        self.setup = setup
        self.match_id = setup["match_id"]
        self.rng = random.Random(setup["seed"] * 7919 + 17)
        self.events: list[dict] = []
        self.frames: list[dict] = []
        self.seq = 0
        self.score = {"home": 0, "away": 0}
        self.sent_off: dict[str, int] = {}
        self.team_id = {s: setup["teams"][s]["team_id"] for s in ("home", "away")}
        self.style = {s: dict(setup["teams"][s]["style"]) for s in ("home", "away")}
        self.on_pitch: dict[str, list[Player]] = {}
        self.bench: dict[str, list[dict]] = {}
        for side in ("home", "away"):
            team = setup["teams"][side]
            anchors = FORMATIONS[team["formation"]]
            self.on_pitch[side] = [
                Player(p["player_id"], side, p["pos"], p["attr"], (ax, ay))
                for p, (_, ax, ay) in zip(team["lineup"], anchors)
            ]
            self.bench[side] = list(team["bench"])
        self.storylines = set(setup.get("storylines", []))
        self.red_card_done = False
        self.subs_plan = {s: self._plan_subs(s) for s in ("home", "away")}

        # live state
        self.period = 1
        self.period_ms = 0
        self.offset_ms = 0
        self.poss_side = "home"
        self.possession_id = 0
        self.poss_start_t = 0
        self.poss_start_kind = "kickoff"
        self.poss_start_ax = 50.0
        self.carrier: Player | None = None
        self.ball = [52.5, 34.0, 0.0]
        self.ball_prev = (52.5, 34.0, 0.0)
        self.mode = "dead"  # held / flight / dead
        self.flight: Flight | None = None
        self.dead_until = 0
        self.restart: tuple | None = None
        self.decide_at = 0
        self.carrying_until = -1
        self.carry_from = (0.0, 0.0)
        self.carry_target = (0.0, 0.0)
        self.last_pressure: dict | None = None
        self.last_pressure_t = -10_000
        self.last_tackle_t = -10_000
        self.last_pass: dict | None = None  # last completed pass (for key-pass linking)
        self.pending_aerial_header: Player | None = None

    # ------------------------------------------------------------------ helpers

    @property
    def match_ms(self) -> int:
        return self.offset_ms + self.period_ms

    def east(self, side: str) -> bool:
        return pitch.attacks_east(side == "home", self.period)

    def other(self, side: str) -> str:
        return "away" if side == "home" else "home"

    def att(self, side: str, x: float, y: float) -> tuple[float, float]:
        return pitch.to_team_m(x, y, self.east(side))

    def from_att(self, side: str, ax: float, ay: float) -> tuple[float, float]:
        return pitch.clamp_m(*pitch.from_team_m(ax, ay, self.east(side)))

    def players(self, side: str) -> list[Player]:
        return self.on_pitch[side]

    def gk(self, side: str) -> Player:
        return next((p for p in self.on_pitch[side] if p.pos == "GK"), self.on_pitch[side][0])

    def nearest(self, side: str, x: float, y: float, exclude: Player | None = None, t: int | None = None):
        best, bd = None, 1e9
        for p in self.on_pitch[side]:
            if p is exclude or (t is not None and p.stun_until > t):
                continue
            d = pitch.dist(p.x, p.y, x, y)
            if d < bd:
                best, bd = p, d
        return best, bd

    def mods(self, side: str) -> dict:
        """Storyline tilts: only odds change, never outcomes directly (except the scripted red card)."""
        m = {"press": 0.0, "shot": 1.0, "foul": 1.0}
        minute = self.match_ms / 60000
        if "late_pressure_surge" in self.storylines and side == "home" and minute >= 55:
            m["press"] += 0.2
            m["shot"] *= 1.35
        if "comeback" in self.storylines:
            if minute < 50:
                m["shot"] *= 1.4 if side == "away" else 0.8
            elif minute >= 60:
                m["shot"] *= 1.6 if side == "home" else 0.7
                if side == "home":
                    m["press"] += 0.15
        if "red_card" in self.storylines and side == "away" and 28 <= minute <= 42 and not self.red_card_done:
            m["foul"] *= 3.0
        return m

    def press_eff(self, def_side: str) -> float:
        bx, _ = self.att(def_side, self.ball[0], self.ball[1])
        base = self.style[def_side]["press_intensity"] + self.mods(def_side)["press"]
        if bx > 60:
            eff = base
        elif bx > 35:
            eff = 0.35 + base * 0.5
        else:
            eff = 0.6 + base * 0.3
        return max(0.05, min(1.0, eff))

    # ------------------------------------------------------------------ events

    def emit(self, etype: str, side: str | None, player: Player | None, xy=None, end=None, **fields) -> dict:
        self.seq += 1
        ev = {
            "event_id": f"{self.match_id}-{self.seq:05d}",
            "match_id": self.match_id,
            "seq": self.seq,
            "possession_id": self.possession_id,
            "period": self.period,
            "period_ms": self.period_ms,
            "match_ms": self.match_ms,
            "clock": pitch.clock(self.period, self.period_ms),
        }
        if side is not None:
            ev["team_id"] = self.team_id[side]
        if player is not None:
            ev["player_id"] = player.pid
        ev["type"] = etype
        east = self.east(side) if side else True
        if xy is not None:
            ev["x"], ev["y"] = pitch.pct(*pitch.to_team_m(xy[0], xy[1], east))
        if end is not None:
            ev["end_x"], ev["end_y"] = pitch.pct(*pitch.to_team_m(end[0], end[1], east))
        for k, v in fields.items():
            if v is not None:
                ev[k] = v
        self.events.append(ev)
        return ev

    def under_pressure(self, t: int) -> bool:
        if self.carrier is None:
            return False
        if t - self.last_pressure_t <= 2000 and self.last_pressure and \
                self.last_pressure.get("target_player_id") == self.carrier.pid:
            return True
        _, d = self.nearest(self.other(self.carrier.side), self.carrier.x, self.carrier.y)
        return d < 2.5

    # ------------------------------------------------------------------ possession

    def take_possession(self, side: str, player: Player, t: int, kind: str, hold=(0.8, 2.0)):
        if side != self.poss_side or kind in ("kickoff",):
            if self.last_pressure and t - self.last_pressure_t <= 3000 and side != self.poss_side:
                self.last_pressure["outcome"] = "success"
            self.possession_id += 1
            self.poss_side = side
            self.poss_start_t = t
            self.poss_start_kind = kind
            self.poss_start_ax = self.att(side, player.x, player.y)[0]
            self.last_pass = None
        if kind in ("kickoff", "throw_in", "goal_kick", "corner", "free_kick", "penalty"):
            self.poss_start_kind = kind
            self.poss_start_t = t
        self.carrier = player
        self.mode = "held"
        self.flight = None
        self.carrying_until = -1
        self.decide_at = t + int(self.rng.uniform(*hold) * 1000)

    def go_dead(self, t: int, until_s: tuple[float, float], restart: tuple):
        """Ball out of play. restart = (kind, side, x, y) in pitch metres."""
        self.mode = "dead"
        self.carrier = None
        self.flight = None
        self.carrying_until = -1
        self.dead_until = t + int(self.rng.uniform(*until_s) * 1000)
        self.restart = restart
        rx, ry = restart[2], restart[3]
        self.ball = [rx, ry, 0.0]
        self._do_due_subs(t)

    # ------------------------------------------------------------------ substitutions & discipline

    def _plan_subs(self, side: str) -> list[int]:
        n = self.rng.choice([3, 4, 4, 5])
        times = sorted(self.rng.uniform(56, 87) for _ in range(n))
        return [int(m * 60000) for m in times]

    def _do_due_subs(self, t: int):
        if self.period != 2:
            return
        for side in ("home", "away"):
            plan = self.subs_plan[side]
            while plan and plan[0] <= self.match_ms and self.bench[side]:
                plan.pop(0)
                outfield = [p for p in self.on_pitch[side] if p.pos != "GK"]
                if not outfield:
                    break
                # tired, high-minute players first
                off = max(outfield, key=lambda p: p.dist_m * (1.2 - p.attr["stamina"] / 100) + self.rng.random() * 800)
                same = [b for b in self.bench[side] if b["pos"] == off.pos]
                outfield_bench = [b for b in self.bench[side] if b["pos"] != "GK"]
                if not outfield_bench:
                    break
                on_def = same[0] if same else self.rng.choice(outfield_bench)
                self.bench[side].remove(on_def)
                self.emit("Substitution", side, off, player_on_id=on_def["player_id"])
                new = Player(on_def["player_id"], side, off.pos, on_def["attr"], off.anchor, off.x, off.y)
                idx = self.on_pitch[side].index(off)
                self.on_pitch[side][idx] = new
                if self.restart and isinstance(self.restart[-1], Player) and self.restart[-1] is off:
                    self.restart = self.restart[:-1] + (new,)

    def discipline(self, offender: Player, xy, t: int):
        minute = self.match_ms / 60000
        side = offender.side
        card = None
        if ("red_card" in self.storylines and side == "away" and not self.red_card_done
                and 28 <= minute <= 42 and offender.pos != "GK"):
            card = "second_yellow" if offender.yellow else "red"
            self.red_card_done = True
        elif offender.pos == "GK":
            card = None if offender.yellow or self.rng.random() > 0.1 else "yellow"
        else:
            r = self.rng.random()
            if r < 0.004:
                card = "red"
            elif r < 0.17:
                card = "second_yellow" if offender.yellow else "yellow"
        if card is None:
            return
        self.emit("Card", side, offender, xy=xy, card=card)
        if card == "yellow":
            offender.yellow = True
            return
        self.sent_off[offender.pid] = self.seq
        self.on_pitch[side].remove(offender)

    # ------------------------------------------------------------------ geometry for decisions

    def xg(self, ax: float, ay: float, head: bool = False) -> float:
        dx = pitch.LENGTH - ax
        dy = abs(ay - pitch.WIDTH / 2)
        d = math.hypot(dx, dy)
        half = pitch.GOAL_HALF_WIDTH
        angle = math.atan2(2 * half * dx, dx * dx + dy * dy - half * half)
        if angle < 0:
            angle += math.pi
        z = -1.2 + 1.6 * angle - 0.09 * d
        v = 1 / (1 + math.exp(-z))
        return v * (0.6 if head else 1.0)

    def space_ahead(self, side: str, p: Player) -> bool:
        ax, ay = self.att(side, p.x, p.y)
        for o in self.on_pitch[self.other(side)]:
            ox, oy = self.att(side, o.x, o.y)
            dx = ox - ax
            if 0 < dx < 10 and abs(oy - ay) < dx * 0.8 + 2:
                return False
        return ax < 92

    # ------------------------------------------------------------------ actions

    def decide(self, t: int):
        p = self.carrier
        side = p.side
        ax, ay = self.att(side, p.x, p.y)
        mods = self.mods(side)
        if p.pos == "GK":
            self.do_pass(t, long=self.rng.random() < self.style[side]["directness"])
            return
        _, od = self.nearest(self.other(side), p.x, p.y)
        xg = self.xg(ax, ay)
        r = self.rng.random()
        shot_p = min(0.7, (xg * 1.1 + (0.03 if ax > 90 else 0.0)) * mods["shot"]) if xg > 0.045 else 0.0
        if r < shot_p:
            self.do_shot(t, situation=None)
            return
        r = self.rng.random()
        if od < 3.0 and ax > 45 and r < 0.10 + (p.attr["dribbling"] - 60) / 250:
            self.do_takeon(t)
            return
        if ax < 28 and od < 3.5 and p.pos in ("CB", "RB", "LB", "RWB", "LWB", "DM") and r < 0.35:
            self.do_clearance(t)
            return
        if self.space_ahead(side, p) and self.rng.random() < 0.18 + p.attr["dribbling"] / 400:
            self.start_carry(t)
            return
        wide = ay < 16 or ay > 52
        cross = wide and ax > 80 and self.rng.random() < 0.45
        long = (not cross) and ax < 55 and self.rng.random() < self.style[side]["directness"] * 0.18
        self.do_pass(t, cross=cross, long=long)

    def start_carry(self, t: int):
        p = self.carrier
        ax, ay = self.att(p.side, p.x, p.y)
        tx = min(100.0, ax + self.rng.uniform(8, 18))
        ty = ay + (34 - ay) * self.rng.uniform(0.0, 0.3) + self.rng.uniform(-4, 4)
        self.carry_from = (p.x, p.y)
        self.carry_target = self.from_att(p.side, tx, ty)
        self.carrying_until = t + int(self.rng.uniform(1.5, 4.0) * 1000)

    def end_carry(self, t: int):
        p = self.carrier
        self.carrying_until = -1
        if pitch.dist(p.x, p.y, *self.carry_from) >= 3.0:
            self.emit("Carry", p.side, p, xy=self.carry_from, end=(self.ball[0], self.ball[1]),
                      under_pressure=self.under_pressure(t), qualifiers=[])

    def pick_receiver(self, side: str, passer: Player, cross: bool, long: bool) -> Player | None:
        px, py = self.att(side, passer.x, passer.y)
        opp = self.other(side)
        best, weights = [], []
        for q in self.on_pitch[side]:
            if q is passer:
                continue
            qx, qy = self.att(side, q.x, q.y)
            d = math.hypot(qx - px, qy - py)
            if q.pos == "GK" and px > 30:
                continue
            _, open_d = self.nearest(opp, q.x, q.y)
            gain = qx - px
            if cross:
                w = (3.0 if (qx > 86 and 20 < qy < 48) else 0.05)
            elif long:
                w = math.exp(-((d - 40) / 15) ** 2) * (1 + max(0, gain) / 12)
            else:
                w = math.exp(-((d - 16) / 12) ** 2) * (1 + self.style[side]["directness"] * max(0, gain) / 18 + 0.4)
                if gain < -5:
                    w *= 0.6
            w *= min(1.0, open_d / 5.0) ** 1.2 + 0.05
            best.append(q)
            weights.append(w)
        if not best:
            return None
        return self.rng.choices(best, weights)[0]

    def do_pass(self, t: int, cross=False, long=False, qualifiers=None, body_part=None, restart_kind=None):
        p = self.carrier
        side = p.side
        opp = self.other(side)
        rcv = self.pick_receiver(side, p, cross, long)
        if rcv is None:
            self.do_clearance(t)
            return
        px, py = p.x, p.y
        d0 = pitch.dist(px, py, rcv.x, rcv.y)
        if cross or d0 > 32:
            speed_kmh = self.rng.uniform(58, 78)
            peak = self.rng.uniform(4, 11)
            height = "high"
        elif d0 > 18:
            speed_kmh, peak, height = self.rng.uniform(45, 62), 0.0, "ground"
        else:
            speed_kmh, peak, height = self.rng.uniform(30, 48), 0.0, "ground"
        if restart_kind == "throw_in":
            speed_kmh, peak, height = self.rng.uniform(25, 40), 1.5, "high"
        flight_s = d0 / (speed_kmh / 3.6) * 1.15
        # lead the receiver along their run, plus a step towards goal
        rax, ray = self.att(side, rcv.x + rcv.vx * flight_s * 0.5, rcv.y + rcv.vy * flight_s * 0.5)
        ex, ey = self.from_att(side, min(103.0, rax + 1.5), min(67.0, max(1.0, ray)))
        d = pitch.dist(px, py, ex, ey)
        flight_s = max(0.4, d / (speed_kmh / 3.6) * 1.15)
        t1 = t + int(flight_s * 1000)

        up = self.under_pressure(t) and restart_kind is None
        pax, _ = self.att(side, px, py)
        eax, eay = self.att(side, ex, ey)
        gain = eax - pax
        _, rcv_open = self.nearest(opp, ex, ey)
        succ = 0.965 - 0.006 * max(0.0, d - 12) - (0.10 if up else 0.0) - 0.004 * max(0.0, gain)
        succ -= 0.08 * max(0.0, (5 - rcv_open) / 5)
        succ += (p.attr["passing"] - 72) * 0.004
        if cross:
            succ = 0.32 + (p.attr["passing"] - 70) * 0.006
        if restart_kind in ("kickoff", "throw_in", "goal_kick", "free_kick"):
            succ = max(succ, 0.9 if restart_kind != "goal_kick" or d < 40 else 0.55)
        succ = max(0.12, min(0.985, succ))

        quals = list(qualifiers or [])
        if cross:
            quals.append("cross")
        elif long and d > 32:
            quals.append("long_ball")
        if abs(eay - self.att(side, px, py)[1]) > 30 and d > 28:
            quals.append("switch_of_play")
        bp = body_part or ("left_foot" if self.rng.random() < 0.28 else "right_foot")

        offside = (not cross and restart_kind is None and gain > 14 and eax > 70
                   and rcv.pos in ("ST", "LW", "RW", "AM", "LM", "RM") and self.rng.random() < 0.10)
        if offside:
            ev = self.emit("Pass", side, p, xy=(px, py), end=(ex, ey), outcome="fail", body_part=bp, height=None,
                           under_pressure=up, qualifiers=quals, ball_speed_kmh=round(speed_kmh, 1))
            self._launch(px, py, ex, ey, t, t1, peak, rcv, lambda tt: self._offside(tt, rcv))
            return
        if self.rng.random() < succ:
            ev = self.emit("Pass", side, p, xy=(px, py), end=(ex, ey), outcome="success", receiver_id=rcv.pid,
                           body_part=bp, under_pressure=up, qualifiers=quals, ball_speed_kmh=round(speed_kmh, 1))
            self._launch(px, py, ex, ey, t, t1, peak, rcv, lambda tt: self._receive(tt, rcv, ev, height == "high"))
            return
        # failed pass: intercepted, contested in the air, or out of play
        self.emit("Pass", side, p, xy=(px, py), end=(ex, ey), outcome="fail", body_part=bp, under_pressure=up,
                  qualifiers=quals, ball_speed_kmh=round(speed_kmh, 1))
        if height == "high":
            self._launch(px, py, ex, ey, t, t1, peak, rcv, lambda tt: self._aerial(tt, side, ex, ey, cross))
            return
        if self.rng.random() < 0.22:
            # overhit: runs out over the touchline or goal line
            ox, oy = self.from_att(side, min(105.0, eax + self.rng.uniform(3, 12)),
                                   -0.5 if eay < 34 else 68.5)
            if eax > 95:
                ox, oy = self.from_att(side, 105.0, eay)
            self._launch(px, py, ox, oy, t, t1 + 600, 0.0, None, lambda tt: self._out_of_play(tt, side, ox, oy))
            return
        # intercepted: the defender closest to the pass line
        best, bd, bpt = None, 1e9, (ex, ey)
        for o in self.on_pitch[opp]:
            lx, ly, frac = _closest_on_segment(px, py, ex, ey, o.x, o.y)
            dd = pitch.dist(o.x, o.y, lx, ly)
            if frac > 0.15 and dd < bd:
                best, bd, bpt = o, dd, (lx, ly)
        if best is None:
            best, _ = self.nearest(opp, ex, ey)
            bpt = (ex, ey)
        ix, iy = bpt
        ti = t + max(300, int((t1 - t) * pitch.dist(px, py, ix, iy) / max(d, 1)))
        self._launch(px, py, ix, iy, t, ti, 0.0, best, lambda tt: self._intercept(tt, best))

    def _launch(self, sx, sy, ex, ey, t0, t1, peak, rcv, on_arrive):
        self.mode = "flight"
        self.carrier = None
        self.carrying_until = -1
        self.flight = Flight(sx, sy, ex, ey, t0, max(t1, t0 + TICK_MS), peak, on_arrive, rcv)

    def _receive(self, t: int, rcv: Player, pass_ev: dict, high: bool):
        if rcv.side != self.poss_side or rcv not in self.on_pitch[rcv.side]:
            self.recover_loose(t)
            return
        self.last_pass = {"ev": pass_ev, "t": t, "receiver": rcv.pid, "high": high}
        self.take_possession(rcv.side, rcv, t, "pass")
        rax, ray = self.att(rcv.side, rcv.x, rcv.y)
        # first-time finish on a cutback or a cross into the box
        if rax > 86 and 18 < ray < 50 and self.rng.random() < (0.30 if high else 0.15) * self.mods(rcv.side)["shot"]:
            if not high and rax > 88 and pass_ev.get("end_x", 0) < pass_ev.get("x", 0) + 3:
                pass_ev["qualifiers"].append("cutback")
            self.do_shot(t + 200, situation=None, head=high and self.rng.random() < 0.7)

    def _intercept(self, t: int, o: Player):
        if o not in self.on_pitch[o.side]:
            self.recover_loose(t)
            return
        self.emit("Interception", o.side, o, xy=(self.ball[0], self.ball[1]), outcome="success")
        self.take_possession(o.side, o, t, "regain")

    def _offside(self, t: int, rcv: Player):
        self.emit("Offside", rcv.side, rcv, xy=(self.ball[0], self.ball[1]))
        opp = self.other(rcv.side)
        taker, _ = self.nearest(opp, self.ball[0], self.ball[1])
        self.go_dead(t, (8, 16), ("free_kick", opp, self.ball[0], self.ball[1], taker))

    def _aerial(self, t: int, att_side: str, x: float, y: float, cross: bool):
        def_side = self.other(att_side)
        a, _ = self.nearest(att_side, x, y)
        d, _ = self.nearest(def_side, x, y)
        if a is None or d is None:
            self.recover_loose(t)
            return
        p_att = 0.38 if cross else 0.48
        att_wins = self.rng.random() < p_att
        winner, loser = (a, d) if att_wins else (d, a)
        self.emit("Aerial", winner.side, winner, xy=(x, y), outcome="success")
        self.emit("Aerial", loser.side, loser, xy=(x, y), outcome="fail")
        wax, way = self.att(winner.side, x, y)
        if att_wins and cross and wax > 88 and 18 < way < 50 and self.rng.random() < 0.5:
            self.carrier = winner
            self.do_shot(t + 200, situation=None, head=True)
            return
        if not att_wins and wax < 30 and self.rng.random() < 0.6:
            self.carrier = winner
            self.do_clearance(t + 200, head=True)
            return
        self.take_possession(winner.side, winner, t, "regain" if winner.side != self.poss_side else "pass")

    def _out_of_play(self, t: int, last_side: str, x: float, y: float):
        opp = self.other(last_side)
        ax, ay = self.att(last_side, x, y)
        if ax >= 104.5:  # over the opponent's goal line → goal kick
            gk = self.gk(opp)
            sx, sy = self.from_att(opp, 5.5, 34 + self.rng.uniform(-9, 9))
            self.go_dead(t, (12, 22), ("goal_kick", opp, sx, sy, gk))
            return
        if ax <= 0.5:  # over own goal line → corner to the opponent
            self.setup_corner(t, opp, left=ay > 34)
            return
        ty = 0.3 if y < 34 else 67.7
        taker, _ = self.nearest(opp, x, ty)
        self.go_dead(t, (7, 15), ("throw_in", opp, x, ty, taker))

    def setup_corner(self, t: int, side: str, left: bool):
        """`left` is from the attacking team's view (attack-frame y near 0)."""
        cx, cy = self.from_att(side, 104.7, 0.3 if left else 67.7)
        cands = [p for p in self.on_pitch[side] if p.pos not in ("GK", "CB")]
        taker = max(cands, key=lambda p: p.attr["passing"] + self.rng.random() * 6) if cands else self.gk(side)
        self.go_dead(t, (18, 30), ("corner", side, cx, cy, taker))

    def do_takeon(self, t: int):
        p = self.carrier
        side = p.side
        opp = self.other(side)
        o, _ = self.nearest(opp, p.x, p.y, t=t)
        if o is None:
            self.start_carry(t)
            return
        up = self.under_pressure(t)
        chance = 0.48 + (p.attr["dribbling"] - o.attr["tackling"]) / 140 + (p.attr["pace"] - o.attr["pace"]) / 300
        xy = (p.x, p.y)
        if self.rng.random() < max(0.15, min(0.85, chance)):
            self.emit("TakeOn", side, p, xy=xy, outcome="success", under_pressure=up, qualifiers=[])
            o.stun_until = t + 1500
            self.start_carry(t)
            return
        self.emit("TakeOn", side, p, xy=xy, outcome="fail", under_pressure=up, qualifiers=[])
        if self.rng.random() < 0.22 * self.mods(opp)["foul"]:
            self.foul(t, o, p)
            return
        self.emit("Tackle", opp, o, xy=xy, outcome="success")
        self.take_possession(opp, o, t, "regain")

    def foul(self, t: int, offender: Player, victim: Player):
        xy = (self.ball[0], self.ball[1])
        self.emit("Foul", offender.side, offender, xy=xy, fouled_player_id=victim.pid)
        self.discipline(offender, xy, t)
        side = victim.side
        vax, vay = self.att(side, *xy)
        if vax > 88.5 and 13.84 < vay < 54.16:
            sx, sy = self.from_att(side, 94.0, 34.0)
            cands = [p for p in self.on_pitch[side] if p.pos != "GK"]
            taker = max(cands, key=lambda p: p.attr["finishing"]) if cands else victim
            self.go_dead(t, (45, 75), ("penalty", side, sx, sy, taker))
            return
        if victim not in self.on_pitch[side]:
            victim, _ = self.nearest(side, *xy)
        self.go_dead(t, (12, 28), ("free_kick", side, xy[0], xy[1], victim))

    def do_clearance(self, t: int, head: bool = False):
        p = self.carrier
        side = p.side
        tx, ty = self.rng.uniform(45, 80), self.rng.uniform(6, 62)
        ex, ey = self.from_att(side, tx, ty)
        self.emit("Clearance", side, p, xy=(p.x, p.y), end=(ex, ey), body_part="head" if head else "right_foot",
                  under_pressure=self.under_pressure(t), qualifiers=[])
        d = pitch.dist(p.x, p.y, ex, ey)
        speed = self.rng.uniform(55, 75)
        t1 = t + int(d / (speed / 3.6) * 1.2 * 1000)
        self._launch(p.x, p.y, ex, ey, t, t1, self.rng.uniform(8, 16), None, lambda tt: self.recover_loose(tt))

    def recover_loose(self, t: int):
        bx, by = self.ball[0], self.ball[1]
        h, hd = self.nearest("home", bx, by)
        a, ad = self.nearest("away", bx, by)
        if h is None or a is None:
            return
        # nearer player usually wins it
        p_home = 1 / (1 + math.exp((hd - ad) / 3))
        winner = h if self.rng.random() < p_home else a
        self.emit("BallRecovery", winner.side, winner, xy=(bx, by), outcome="success")
        self.take_possession(winner.side, winner, t, "regain" if winner.side != self.poss_side else "loose")

    def shot_situation(self, t: int, side: str) -> str:
        if self.poss_start_kind in ("corner", "free_kick", "throw_in", "penalty") and t - self.poss_start_t < 9000:
            return self.poss_start_kind
        if self.poss_start_kind == "regain" and self.poss_start_ax < 50 and t - self.poss_start_t < 14000:
            return "counter"
        return "open_play"

    def do_shot(self, t: int, situation: str | None, head: bool = False, penalty: bool = False):
        p = self.carrier
        side = p.side
        opp = self.other(side)
        ax, ay = self.att(side, p.x, p.y)
        situation = situation or self.shot_situation(t, side)
        xg = 0.76 if penalty else self.xg(ax, ay, head)
        up = False if penalty else self.under_pressure(t)
        quals = []
        assisted_by = key_pass_id = None
        lp = self.last_pass
        if lp and lp["receiver"] == p.pid and t - lp["t"] <= 6000 and not penalty:
            assisted_by = lp["ev"]["player_id"]
            key_pass_id = lp["ev"]["event_id"]
            if "key_pass" not in lp["ev"]["qualifiers"]:
                lp["ev"]["qualifiers"].append("key_pass")
        finishing = p.attr["finishing"]
        p_goal = min(0.95, xg * (0.68 + (finishing - 70) * 0.01) * (1.0 if up is False else 0.85))
        r = self.rng.random()
        if r < p_goal:
            outcome = "goal"
        else:
            r2 = self.rng.random()
            close = math.hypot(105 - ax, 34 - ay) < 14
            if penalty:
                outcome = "saved" if r2 < 0.6 else "missed"
            elif r2 < 0.40:
                outcome = "saved"
            elif r2 < (0.40 + (0.15 if close else 0.26)):
                outcome = "blocked"
            elif r2 < (0.43 + (0.15 if close else 0.26)):
                outcome = "woodwork"
            else:
                outcome = "missed"
        bp = "head" if head else ("left_foot" if self.rng.random() < 0.3 else "right_foot")
        speed = self.rng.uniform(40, 70) if head else self.rng.uniform(75, 118) * (0.85 + finishing / 600)
        if penalty:
            speed = self.rng.uniform(85, 110)
        speed = round(min(speed, 125.0), 1)
        half_w_pct = pitch.GOAL_HALF_WIDTH / pitch.WIDTH * 100
        mouth_y = mouth_z = None
        if outcome in ("goal", "saved"):
            mouth_y = round(50 + self.rng.uniform(-0.92, 0.92) * half_w_pct, 1)
            mouth_z = round(self.rng.uniform(0.05, 2.3), 2)
        elif outcome == "woodwork":
            mouth_y = round(50 + self.rng.choice([-1, 1]) * half_w_pct, 1)
            mouth_z = round(self.rng.uniform(0.1, 2.44), 2)
        elif outcome == "missed":
            if self.rng.random() < 0.5:
                mouth_y = round(50 + self.rng.choice([-1, 1]) * self.rng.uniform(1.05, 2.2) * half_w_pct, 1)
                mouth_z = round(self.rng.uniform(0.1, 2.0), 2)
            else:
                mouth_y = round(50 + self.rng.uniform(-1.4, 1.4) * half_w_pct, 1)
                mouth_z = round(self.rng.uniform(2.5, 5.0), 2)
        ev = self.emit("Shot", side, p, xy=(p.x, p.y), body_part=bp, under_pressure=up, qualifiers=quals,
                       shot_outcome=outcome, situation="penalty" if penalty else situation,
                       shot_speed_kmh=speed, goal_mouth_y=mouth_y, goal_mouth_z=mouth_z,
                       assisted_by=assisted_by, key_pass_event_id=key_pass_id)
        self.last_pass = None
        gy = (mouth_y if mouth_y is not None else 50) / 100 * pitch.WIDTH
        gx, gy = self.from_att(side, 105.0, gy)
        if outcome == "blocked":
            dist_to_goal = math.hypot(105 - ax, 34 - ay)
            k = self.rng.uniform(2, 6) / max(dist_to_goal, 1)
            gx, gy = p.x + (gx - p.x) * k, p.y + (gy - p.y) * k
        d = pitch.dist(p.x, p.y, gx, gy)
        t1 = t + max(200, int(d / (speed / 3.6) * 1000))
        peak = 0.0 if mouth_z is None else min(mouth_z, 2.5)
        self._launch(p.x, p.y, gx, gy, t, t1, peak, None,
                     lambda tt: self._shot_arrives(tt, side, opp, outcome, ev))

    def _shot_arrives(self, t: int, side: str, opp: str, outcome: str, ev: dict):
        if outcome == "goal":
            self.score[side] += 1
            self.go_dead(t, (50, 70), ("kickoff", opp, 52.5, 34.0, None))
            return
        if outcome == "saved":
            gk = self.gk(opp)
            r = self.rng.random()
            qual = "caught" if r < 0.45 else ("parried_to_corner" if r < 0.75 else "parried_loose")
            self.emit("Save", opp, gk, xy=(gk.x, gk.y), outcome="success", qualifiers=[qual])
            if qual == "caught":
                self.take_possession(opp, gk, t, "regain", hold=(3.5, 7.0))
            elif qual == "parried_to_corner":
                self.setup_corner(t, side, left=self.rng.random() < 0.5)
            else:
                ax, ay = self.att(side, self.ball[0], self.ball[1])
                self.ball[0], self.ball[1] = self.from_att(side, ax - self.rng.uniform(4, 10), ay)
                self.recover_loose(t + 400)
            return
        if outcome == "missed":
            gk = self.gk(opp)
            sx, sy = self.from_att(opp, 5.5, 34 + self.rng.uniform(-9, 9))
            self.go_dead(t, (14, 24), ("goal_kick", opp, sx, sy, gk))
            return
        if outcome == "blocked" and self.rng.random() < 0.3:
            self.setup_corner(t, side, left=self.rng.random() < 0.5)
            return
        self.recover_loose(t + 200)

    # ------------------------------------------------------------------ restarts

    def do_restart(self, t: int):
        kind, side, rx, ry, *rest = self.restart
        taker = rest[0] if rest else None
        if taker is None or taker not in self.on_pitch[side]:
            taker, _ = self.nearest(side, rx, ry)
            if kind == "kickoff":
                fwd = [p for p in self.on_pitch[side] if p.pos in ("ST", "AM", "CM")]
                taker = fwd[0] if fwd else taker
        taker.x, taker.y, taker.vx, taker.vy = rx, ry, 0.0, 0.0
        self.ball = [rx, ry, 0.0]
        self.restart = None
        self.take_possession(side, taker, t, kind)
        self.mode = "held"
        if kind == "kickoff":
            self.do_pass(t, qualifiers=["kickoff"], restart_kind="kickoff")
        elif kind == "throw_in":
            self.do_pass(t, qualifiers=["throw_in"], body_part="other", restart_kind="throw_in")
        elif kind == "goal_kick":
            self.do_pass(t, long=self.rng.random() < self.style[side]["directness"] + 0.15,
                         qualifiers=["goal_kick"], restart_kind="goal_kick")
        elif kind == "corner":
            self.do_corner(t, taker)
        elif kind == "penalty":
            self.do_shot(t, situation="penalty", penalty=True)
        elif kind == "free_kick":
            ax, ay = self.att(side, rx, ry)
            if ax > 74 and 18 < ay < 50 and self.rng.random() < 0.4:
                self.do_shot(t, situation="free_kick")
            else:
                cross = ax > 72 and self.rng.random() < 0.6
                self.do_pass(t, cross=cross, qualifiers=["free_kick"], restart_kind="free_kick")

    def do_corner(self, t: int, taker: Player):
        side = taker.side
        ex, ey = self.from_att(side, self.rng.uniform(88, 99), self.rng.uniform(22, 46))
        att_win = self.rng.random() < 0.36
        self.emit("Corner", side, taker, xy=(taker.x, taker.y), end=(ex, ey),
                  outcome="success" if att_win else "fail")
        d = pitch.dist(taker.x, taker.y, ex, ey)
        speed = self.rng.uniform(55, 72)
        t1 = t + int(d / (speed / 3.6) * 1.2 * 1000)
        self._launch(taker.x, taker.y, ex, ey, t, t1, self.rng.uniform(5, 9), None,
                     lambda tt: self._corner_lands(tt, side, ex, ey, att_win))

    def _corner_lands(self, t: int, side: str, x: float, y: float, att_win: bool):
        def_side = self.other(side)
        a, _ = self.nearest(side, x, y)
        d, _ = self.nearest(def_side, x, y)
        winner, loser = (a, d) if att_win else (d, a)
        self.emit("Aerial", winner.side, winner, xy=(x, y), outcome="success")
        self.emit("Aerial", loser.side, loser, xy=(x, y), outcome="fail")
        self.carrier = winner
        if att_win and self.rng.random() < 0.55:
            self.do_shot(t + 200, situation="corner", head=True)
        elif not att_win:
            self.do_clearance(t + 200, head=True)
        else:
            self.take_possession(side, winner, t, "corner")

    # ------------------------------------------------------------------ per-tick defending

    def defend(self, t: int):
        p = self.carrier
        opp = self.other(p.side)
        o, d = self.nearest(opp, p.x, p.y, t=t)
        if o is None:
            return
        eff = self.press_eff(opp)
        if d < 3.5 and t - self.last_pressure_t > 2500 and self.rng.random() < 0.35 * eff:
            ev = self.emit("Pressure", opp, o, xy=(o.x, o.y), outcome="fail", target_player_id=p.pid)
            self.last_pressure, self.last_pressure_t = ev, t
        if d < 1.8 and t - self.last_tackle_t > 1200 and self.rng.random() < 0.06 * eff * (0.6 + o.attr["tackling"] / 100):
            self.last_tackle_t = t
            if self.rng.random() < 0.24 * self.mods(opp)["foul"]:
                self.foul(t, o, p)
                return
            won = self.rng.random() < 0.55 + (o.attr["tackling"] - p.attr["dribbling"]) / 200
            if won:
                if self.carrying_until > 0:
                    self.end_carry(t)
                self.emit("Tackle", opp, o, xy=(self.ball[0], self.ball[1]), outcome="success")
                self.take_possession(opp, o, t, "regain")
            else:
                self.emit("Tackle", opp, o, xy=(self.ball[0], self.ball[1]), outcome="fail")
                o.stun_until = t + 1500

    # ------------------------------------------------------------------ movement

    def shape_target(self, p: Player, t: int) -> tuple[float, float]:
        side = p.side
        bx, by = self.att(side, self.ball[0], self.ball[1])
        attacking = self.poss_side == side and self.mode != "dead" or (
            self.mode == "dead" and self.restart and self.restart[1] == side)
        if self.mode == "dead" and self.restart and self.restart[0] == "kickoff":
            ax0, ay0 = p.anchor
            tx = min(ax0 * 0.55, 50.0) if p.pos != "GK" else 5.0
            if p.pos == "ST" and self.restart[1] == side:
                tx = 51.0
            return self.from_att(side, tx, ay0)
        ax0, ay0 = p.anchor
        width = self.style[side]["width"]
        if p.pos == "GK":
            tx = max(2.0, min(18.0, 4 + (bx - 30) * 0.12)) if bx > 30 else 4.0
            ty = 34 + (by - 34) * 0.25
        elif attacking:
            tx = ax0 * 0.62 + bx * 0.38 + 7
            ty = 34 + (ay0 - 34) * (0.75 + 0.45 * width) + (by - 34) * 0.2
        else:
            tx = ax0 * 0.66 + bx * 0.34 - 5
            ty = 34 + (ay0 - 34) * 0.72 + (by - 34) * 0.3
        if t >= p.jitter_until:
            p.jitter = (self.rng.uniform(-4, 4), self.rng.uniform(-4, 4))
            p.jitter_until = t + self.rng.randint(2500, 8000)
        if p.pos != "GK":
            tx += p.jitter[0]
            ty += p.jitter[1]
        tx = max(2.0, min(103.0, tx))
        ty = max(1.0, min(67.0, ty))
        return self.from_att(side, tx, ty)

    def move(self, t: int):
        pressers: set[int] = set()
        if self.mode == "held" and self.carrier:
            opp = self.other(self.carrier.side)
            ranked = sorted(self.on_pitch[opp], key=lambda o: pitch.dist(o.x, o.y, self.carrier.x, self.carrier.y))
            n = 2 if self.press_eff(opp) > 0.65 else 1
            pressers = {id(o) for o in ranked[:n] if o.stun_until <= t and o.pos != "GK"}
        fatigue = self.match_ms / (90 * 60000)
        for side in ("home", "away"):
            for p in self.on_pitch[side]:
                urgent = False
                if p is self.carrier and self.mode == "held":
                    if self.carrying_until > 0:
                        tx, ty = self.carry_target
                        urgent = True
                    else:
                        tx, ty = p.x, p.y
                elif self.mode == "flight" and self.flight and p is self.flight.receiver:
                    tx, ty, urgent = self.flight.ex, self.flight.ey, True
                elif id(p) in pressers:
                    tx, ty, urgent = self.ball[0], self.ball[1], True
                elif self.mode == "dead" and self.restart and len(self.restart) > 4 and self.restart[4] is p:
                    tx, ty, urgent = self.restart[2], self.restart[3], True
                else:
                    tx, ty = self.shape_target(p, t)
                top = p.top_speed * (1 - 0.07 * fatigue * (1.3 - p.attr["stamina"] / 100))
                if p.stun_until > t:
                    top *= 0.5
                dx, dy = tx - p.x, ty - p.y
                d = math.hypot(dx, dy)
                if urgent:
                    want = min(top, d * 1.5)
                elif d > 14:
                    want = min(top * 0.8, d * 0.45)
                else:
                    want = min(4.2, d * 0.5)
                if d > 1e-6:
                    dvx, dvy = dx / d * want - p.vx, dy / d * want - p.vy
                else:
                    dvx, dvy = -p.vx, -p.vy
                acc = math.hypot(dvx, dvy)
                cap = 4.0 * DT
                if acc > cap:
                    dvx, dvy = dvx / acc * cap, dvy / acc * cap
                p.vx += dvx
                p.vy += dvy
                sp = math.hypot(p.vx, p.vy)
                if sp > top:
                    p.vx, p.vy = p.vx / sp * top, p.vy / sp * top
                nx, ny = pitch.clamp_m(p.x + p.vx * DT, p.y + p.vy * DT)
                p.dist_m += math.hypot(nx - p.x, ny - p.y)
                p.x, p.y = nx, ny

    def move_ball(self, t: int):
        self.ball_prev = tuple(self.ball)
        if self.mode == "held" and self.carrier:
            p = self.carrier
            sp = math.hypot(p.vx, p.vy)
            ox, oy = (p.vx / sp * 0.6, p.vy / sp * 0.6) if sp > 0.3 else (0.0, 0.0)
            tx, ty = p.x + ox, p.y + oy
            # ease in after a reception so the ball never teleports to the player's feet
            self.ball[0] += (tx - self.ball[0]) * 0.6
            self.ball[1] += (ty - self.ball[1]) * 0.6
            self.ball[2] = 0.0
        elif self.mode == "flight" and self.flight:
            f = self.flight
            u = min(1.0, max(0.0, (t - f.t0) / (f.t1 - f.t0)))
            self.ball = [f.sx + (f.ex - f.sx) * u, f.sy + (f.ey - f.sy) * u, 4 * f.peak_z * u * (1 - u)]

    # ------------------------------------------------------------------ frames

    def frame(self) -> dict:
        bx, by = pitch.pct(self.ball[0], self.ball[1])
        if self.mode == "flight" and self.flight:
            f = self.flight
            ball_kmh = pitch.dist(f.sx, f.sy, f.ex, f.ey) / max((f.t1 - f.t0) / 1000, 0.2) * 3.6
        elif self.mode == "held" and self.carrier:
            ball_kmh = min(math.dist(self.ball, self.ball_prev) / DT * 3.6, 45.0)
        else:
            ball_kmh = 0.0
        players = []
        for side in ("home", "away"):
            for p in self.on_pitch[side]:
                x, y = pitch.pct(p.x, p.y)
                players.append({"player_id": p.pid, "x": x, "y": y,
                                "speed_kmh": round(math.hypot(p.vx, p.vy) * 3.6, 1),
                                "dist_m": round(p.dist_m, 1)})
        return {
            "match_id": self.match_id, "period": self.period, "period_ms": self.period_ms,
            "match_ms": self.match_ms,
            "ball": {"x": bx, "y": by, "z": round(self.ball[2], 2), "speed_kmh": round(ball_kmh, 1)},
            "players": players,
        }

    # ------------------------------------------------------------------ main loop

    def place_for_kickoff(self, kick_side: str):
        for side in ("home", "away"):
            for p in self.on_pitch[side]:
                ax0, ay0 = p.anchor
                tx = 5.0 if p.pos == "GK" else min(ax0 * 0.55, 48.0)
                if p.pos == "ST" and side == kick_side:
                    tx = 51.0
                p.x, p.y = self.from_att(side, tx, ay0)
                p.vx = p.vy = 0.0

    def run(self) -> MatchResult:
        for period in (1, 2):
            self.period = period
            self.period_ms = 0
            added = self.rng.randint(1, 4) if period == 1 else self.rng.randint(3, 7)
            end_ms = HALF_MS + added * 60000 + self.rng.randint(0, 50) * 1000
            kick_side = "home" if period == 1 else "away"
            self.place_for_kickoff(kick_side)
            self.ball = [52.5, 34.0, 0.0]
            self.ball_prev = tuple(self.ball)
            self.emit("PeriodStart", None, None)
            self.mode = "dead"
            self.restart = ("kickoff", kick_side, 52.5, 34.0, None)
            self.dead_until = 0
            while True:
                t = self.period_ms
                self.step(t)
                self.move(t)
                self.move_ball(t)
                self.frames.append(self.frame())
                if t >= end_ms and self.mode in ("dead", "held"):
                    break
                self.period_ms += TICK_MS
            self.emit("PeriodEnd", None, None)
            self.offset_ms += self.period_ms + TICK_MS
            self.mode = "dead"
            self.carrier = None
            self.flight = None
        return MatchResult(self.setup, self.events, self.frames, dict(self.score), dict(self.sent_off))

    def step(self, t: int):
        if self.mode == "dead":
            if t >= self.dead_until and self.restart:
                self.do_restart(t)
            return
        if self.mode == "flight":
            if self.flight and t >= self.flight.t1:
                f = self.flight
                self.ball = [f.ex, f.ey, 0.0]
                self.flight = None
                self.mode = "held"  # provisional; on_arrive sets the real state
                self.carrier = None
                f.on_arrive(t)
                if self.mode == "held" and self.carrier is None:
                    self.recover_loose(t)
            return
        if self.mode == "held" and self.carrier:
            if self.carrier not in self.on_pitch[self.carrier.side]:
                self.recover_loose(t)
                return
            self.defend(t)
            if self.mode != "held" or self.carrier is None:
                return
            if self.carrying_until > 0:
                ax, _ = self.att(self.carrier.side, self.carrier.x, self.carrier.y)
                if t >= self.carrying_until or ax > 96:
                    self.end_carry(t)
                    self.decide(t)
                return
            if t >= self.decide_at:
                self.decide(t)


def _closest_on_segment(ax, ay, bx, by, px, py):
    vx, vy = bx - ax, by - ay
    l2 = vx * vx + vy * vy
    if l2 < 1e-9:
        return ax, ay, 0.0
    u = max(0.0, min(1.0, ((px - ax) * vx + (py - ay) * vy) / l2))
    return ax + vx * u, ay + vy * u, u


def play(setup: dict) -> MatchResult:
    return Engine(setup).run()
