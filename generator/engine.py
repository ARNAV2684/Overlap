# engine.py — Match engine
#
# Purpose: play a whole match in 200 ms steps: move everyone, let the carrier decide, resolve outcomes, emit events
#          and record 5 Hz tracking
# Inputs:  the two clubs from the world, a match id, a seed, the kickoff time
# Outputs: MatchResult (setup, events, tracking frames, score, conditions, summary) — CONTRACTS.md §2-§4
# Spec:    generator/specs/engine.md
#
# Positions inside the engine are pitch-frame metres; events convert to the acting team's frame through pitch.py.

from __future__ import annotations

import hashlib
import math
import random

import config
import decisions
import discipline
import movement
import outcomes
import pitch
import set_pieces
import world
from state import Body, Flight, MatchResult, Restart

PASS_ACTIONS = ("short_pass", "long_pass", "through_ball", "cross", "cutback", "switch")
# Restart kinds that make a shot a set-piece shot, mapped to CONTRACTS.md §3 situations (a goal kick doesn't).
SET_PIECE_SITUATION = {"corner": "corner", "throw_in": "throw_in", "free_kick": "free_kick",
                       "free_kick_indirect": "free_kick", "penalty": "penalty"}


def stream(seed: int, name: str) -> random.Random:
    """One random stream per concern (engine.md §7)."""
    return random.Random(int.from_bytes(hashlib.sha256(f"{seed}:{name}".encode()).digest()[:8], "big"))


class Match:
    def __init__(self, home: world.Club, away: world.Club, *, match_id: str, seed: int, kickoff_utc: str,
                 season_id: str = "S1", matchweek: int = 1, storylines: tuple[str, ...] = (),
                 keep_frames: bool = True, unavailable: dict[str, frozenset[int]] | None = None):
        self.club = {"home": home, "away": away}
        self.match_id, self.seed, self.keep_frames = match_id, seed, keep_frames
        self.rng = {name: stream(seed, name) for name in config.STREAMS}
        self.conditions = self._draw_conditions(kickoff_utc, home)
        setup = world.build_setup(home, away, match_id=match_id, seed=seed, kickoff_utc=kickoff_utc,
                                  season_id=season_id, matchweek=matchweek, storylines=storylines,
                                  unavailable=unavailable)
        order = ("match_id", "seed", "competition", "season_id", "venue", "kickoff_utc")
        self.setup = {k: setup[k] for k in order}
        self.setup["conditions"] = dict(self.conditions)
        self.setup["storylines"] = setup["storylines"]
        self.setup["teams"] = setup["teams"]
        self.team_id = {s: setup["teams"][s]["team_id"] for s in ("home", "away")}
        self.formation = {s: self.club[s].formation for s in ("home", "away")}
        self.bodies: dict[str, list[Body]] = {}
        for side in ("home", "away"):
            club = self.club[side]
            self.bodies[side] = [
                Body(p["player_id"], side, p["pos"], i, club.player(p["shirt"]), 0.0, 0.0)
                for i, p in enumerate(setup["teams"][side]["lineup"])
            ]
        fill = self.conditions["attendance"] / self.club["home"].venue.get("capacity", config.DEFAULT_CAPACITY)
        for b in self.bodies["home"]:
            b.bonus["composure"] = config.HOME_COMPOSURE * min(fill, 1.0)
        self.crowd_fill = min(fill, 1.0)
        self.bench = {s: [self.club[s].player(p["shirt"]) for p in setup["teams"][s]["bench"]]
                      for s in ("home", "away")}
        self.used_bench: dict[str, set[int]] = {"home": set(), "away": set()}
        self.subs_used = {"home": 0, "away": 0}
        self.sub_windows = {s: discipline.plan_windows(self.rng["discipline"]) for s in ("home", "away")}
        self.yellows: set[str] = set()
        self.reds = {"home": 0, "away": 0}
        self.wet = {"none": 0, "light": 1, "heavy": 2}[self.conditions["precipitation"]]
        self.windy = self.conditions["wind_ms"] > config.WINDY_MS
        self.heat = config.HEAT_DRAIN if self.conditions["temperature_c"] > config.HEAT_C else 1.0

        self.starters = {b.pid for s in ("home", "away") for b in self.bodies[s]}
        self.events: list[dict] = []
        self.frames: list[dict] = []
        self.seq = 0
        self.score = {"home": 0, "away": 0}
        self.period, self.period_ms, self.offset_ms = 1, 0, 0
        self.poss_side: str | None = None
        self.poss_id = 0
        self.mode = "dead"                       # held, flight, loose, dead
        self.carrier: Body | None = None
        self.flight: Flight | None = None
        self.restart: Restart | None = None
        self.restart_taker: Body | None = None
        self.corner_box: list[Body] = []
        self.ball_x, self.ball_y, self.ball_z = pitch.LENGTH / 2, pitch.GOAL_Y, 0.0
        self.ball_speed = 0.0
        self.last_touch: str | None = None
        self.decide_at = 0
        self.carrying = False
        self.carry_from = (0.0, 0.0)
        self.carry_to = (0.0, 0.0)
        self.carry_until = 0
        self.pressers: list[Body] = []
        self.pressed_at: dict[str, int] = {}
        self.chasers: list[Body] = []
        self.last_regain = {"home": (-10**9, 100.0), "away": (-10**9, 100.0)}
        self.last_loss = {"home": -10**9, "away": -10**9}
        self.last_pass: dict[str, tuple[dict, str] | None] = {"home": None, "away": None}
        self.set_piece: tuple[str, str, int] | None = None
        self.stoppage_ms = 0
        self.offside_line = {"home": 50.0, "away": 50.0}
        self._style: dict[str, dict] = {}
        self.live_steps = {"home": 0, "away": 0}
        self.xg_total = {"home": 0.0, "away": 0.0}

    # --- conditions (engine.md §9) ----------------------------------------------------------------------------

    def _draw_conditions(self, kickoff_utc: str, home: world.Club) -> dict:
        r = self.rng["conditions"]
        month = int(kickoff_utc[5:7])
        temp = r.gauss(config.TEMPERATE_MEAN_C[month], config.TEMPERATURE_SD_C)
        names = list(config.PRECIPITATION_P)
        precip = r.choices(names, weights=[config.PRECIPITATION_P[n] for n in names], k=1)[0]
        wind = min(r.gammavariate(2.0, config.WIND_MEAN_MS / 2.0), 20.0)
        capacity = home.venue.get("capacity", config.DEFAULT_CAPACITY)
        attendance = int(capacity * r.uniform(*config.ATTENDANCE_FILL))
        return {"temperature_c": round(temp, 1), "precipitation": precip, "wind_ms": round(wind, 1),
                "attendance": attendance}

    # --- small helpers ----------------------------------------------------------------------------------------

    @property
    def match_ms(self) -> int:
        return self.offset_ms + self.period_ms

    @property
    def ball_live(self) -> bool:
        return self.mode != "dead"

    def clock(self) -> str:
        base = 45 * (self.period - 1)
        minutes, seconds = divmod(self.period_ms // 1000, 60)
        if minutes < 45:
            return f"{base + minutes}:{seconds:02d}"
        return f"{base + 45}+{minutes - 45}:{seconds:02d}"

    def east(self, side: str) -> bool:
        return pitch.attacks_east(side == "home", self.period)

    @staticmethod
    def other(side: str) -> str:
        return "away" if side == "home" else "home"

    def on_pitch(self, side: str) -> list[Body]:
        return [b for b in self.bodies[side] if b.on]

    def keeper(self, side: str) -> Body | None:
        return next((b for b in self.on_pitch(side) if b.is_gk), None)

    def tpos(self, b: Body) -> tuple[float, float]:
        return pitch.to_team(b.x, b.y, self.east(b.side))

    def tp(self, side: str, x: float, y: float) -> tuple[float, float]:
        """Pitch metres -> that side's team-frame 0-100, for event fields."""
        return pitch.team_pct(x, y, self.east(side))

    def style(self, side: str) -> dict:
        return self._style[side]

    def shape_of(self, b: Body) -> tuple[float, float]:
        return movement.shape_target(self, b)

    def nearest_opponent_dist(self, b: Body) -> float:
        return min((math.hypot(o.x - b.x, o.y - b.y) for o in self.on_pitch(self.other(b.side))), default=99.0)

    def under_pressure(self, b: Body) -> bool:
        if self.nearest_opponent_dist(b) <= config.PRESSURE_RADIUS_M:
            return True
        return self.match_ms - self.pressed_at.get(b.pid, -10**9) <= config.PRESSURE_REPEAT_MS

    def in_counter(self, side: str) -> bool:
        t, x = self.last_regain[side]
        return self.poss_side == side and self.match_ms - t <= config.COUNTER_WINDOW_MS and x <= config.COUNTER_FROM_X

    def minute(self) -> float:
        return self.match_ms / 60000

    # --- match style (engine.md §6) ---------------------------------------------------------------------------

    def _update_style(self) -> None:
        minute = self.minute()
        for side in ("home", "away"):
            st = dict(self.club[side].style)
            diff = self.score[side] - self.score[self.other(side)]
            if diff < 0 and minute >= 60:
                k = 2.0 if diff <= -2 and minute >= 75 else 1.0
                for key in ("directness", "press_intensity", "press_height"):
                    st[key] += 0.10 * k
            elif diff > 0 and minute >= 75:
                for key in ("tempo", "line_height", "press_height"):
                    st[key] -= 0.10
            for _ in range(self.reds[side]):          # set-pieces-and-discipline.md §3
                st["press_intensity"] -= 0.15
                st["press_height"] -= 0.15
                st["line_height"] -= 0.10
                st["directness"] += 0.10
            self._style[side] = {k: min(max(v, 0.0), 1.0) for k, v in st.items()}

    def shot_appetite(self, side: str) -> float:
        diff = self.score[side] - self.score[self.other(side)]
        if diff < 0 and self.minute() >= 60:
            return 1.15
        if diff > 0 and self.minute() >= 75:
            return 0.9
        return 1.0

    # --- events -----------------------------------------------------------------------------------------------

    def emit(self, etype: str, b: Body | None = None, at: tuple[float, float] | None = None, **fields) -> dict:
        self.seq += 1
        e = {"event_id": f"{self.match_id}-{self.seq:05d}", "match_id": self.match_id, "seq": self.seq,
             "possession_id": self.poss_id, "period": self.period, "period_ms": self.period_ms,
             "match_ms": self.match_ms, "clock": self.clock()}
        if b is not None:
            e["team_id"] = self.team_id[b.side]
            e["player_id"] = b.pid
        e["type"] = etype
        if b is not None:
            x, y = at if at is not None else (b.x, b.y)
            e["x"], e["y"] = self.tp(b.side, x, y)
        for k, v in fields.items():
            if v is not None:
                e[k] = v
        self.events.append(e)
        return e

    # --- possession (engine.md §3) ----------------------------------------------------------------------------

    def gain(self, side: str, kind: str, at: tuple[float, float] | None = None) -> None:
        changed = side != self.poss_side
        if changed or kind == "kickoff":
            self.poss_id += 1
        if changed:
            if self.poss_side is not None and kind == "regain" and at is not None:
                self.last_regain[side] = (self.match_ms, self.tp(side, *at)[0])
                self.last_loss[self.poss_side] = self.match_ms
            self.last_pass = {"home": None, "away": None}
            if self.set_piece and self.set_piece[1] != side:
                self.set_piece = None
        self.poss_side = side

    def give_ball(self, b: Body) -> None:
        self.mode, self.carrier, self.flight, self.carrying = "held", b, None, False
        self.last_touch = b.side
        st = self.style(b.side)
        delay = self.rng["decisions"].uniform(*config.DECISION_DELAY_S) * (1.3 - 0.6 * st["tempo"])
        if self.under_pressure(b):
            delay *= 0.7
        if b.is_gk or b.role == "deep_playmaker":
            delay *= 1.3
        if self.in_counter(b.side):             # actions.md §2: a counter-attacking side releases the ball fast
            delay *= 1 - config.COUNTER_RELEASE * st["counter_attack"]
        self.decide_at = self.match_ms + int(delay * 1000)
        self._choose_pressers(b)

    def _choose_pressers(self, carrier: Body) -> None:
        """Who presses this carrier (actions.md §2). The press line is in the carrier's frame."""
        dside = self.other(carrier.side)
        st = self.style(dside)
        r = self.rng["decisions"]
        bx_carrier = self.tp(carrier.side, self.ball_x, self.ball_y)[0]
        line_ok = bx_carrier >= 100 - (35 + 45 * st["press_height"])
        near = sorted((d for d in self.on_pitch(dside) if not d.is_gk),
                      key=lambda d: (math.hypot(d.x - carrier.x, d.y - carrier.y), d.slot_index))
        near = [d for d in near if math.hypot(d.x - carrier.x, d.y - carrier.y) <= config.PRESS_RADIUS_M]
        chosen = []
        if self.match_ms - self.last_loss[dside] <= config.COUNTER_PRESS_MS:
            chosen = [d for d in near[:config.MAX_COUNTER_PRESSERS] if r.random() < st["counter_press"]]
        elif line_ok:
            for d in near:
                if len(chosen) >= config.MAX_PRESSERS:
                    break
                if r.random() < st["press_intensity"] * config.PRESS_ROLE.get(d.role, 1.0):
                    chosen.append(d)
        self.pressers = chosen

    # --- flights ----------------------------------------------------------------------------------------------

    def launch(self, kind: str, actor: Body, ex: float, ey: float, result: str, *, speed_kmh: float,
               peak: float = 0.0, target: Body | None = None, **data) -> Flight:
        d = math.hypot(ex - self.ball_x, ey - self.ball_y)
        v = max(speed_kmh / 3.6, 3.0)
        secs = d / (v * (0.85 if peak > 0 else 0.75))
        t1 = self.match_ms + max(int(secs * 1000), config.STEP_MS)
        self.flight = Flight(kind, self.ball_x, self.ball_y, ex, ey, self.match_ms, t1, peak, result, actor,
                             target, data)
        self.mode, self.carrier, self.carrying = "flight", None, False
        self.last_touch = actor.side
        self.pressers = []
        return self.flight

    def _crossing(self, sx: float, sy: float, ex: float, ey: float) -> tuple[float, float]:
        """Where a ball going from s to e leaves the pitch."""
        t = 1.0
        if ex < 0:
            t = min(t, sx / (sx - ex))
        if ex > pitch.LENGTH:
            t = min(t, (pitch.LENGTH - sx) / (ex - sx))
        if ey < 0:
            t = min(t, sy / (sy - ey))
        if ey > pitch.WIDTH:
            t = min(t, (pitch.WIDTH - sy) / (ey - sy))
        return pitch.clamp(sx + (ex - sx) * t, sy + (ey - sy) * t)

    def _out(self, x: float, y: float, last: str) -> None:
        """The ball has left the pitch at (x, y), last touched by `last`: throw-in, goal kick or corner."""
        r = self.rng["restarts"]
        if 0.0 < x < pitch.LENGTH:
            side = self.other(last)
            self.schedule_restart("throw_in", side, x, 0.0 if y <= 0.5 else pitch.WIDTH,
                                  r.uniform(*config.DEAD_TIME_S["throw_in"]))
            return
        defending = "home" if (x <= 0.5) == self.east("home") else "away"   # whose goal line it is
        if last == defending:
            cy = 0.0 if y < pitch.GOAL_Y else pitch.WIDTH
            self.schedule_restart("corner", self.other(defending), 0.0 if x <= 0.5 else pitch.LENGTH, cy,
                                  r.uniform(*config.DEAD_TIME_S["corner"]))
        else:
            gx = pitch.to_team(5.5, pitch.GOAL_Y, self.east(defending))
            self.schedule_restart("goal_kick", defending, gx[0], gx[1], r.uniform(*config.DEAD_TIME_S["goal_kick"]))

    # --- passing ----------------------------------------------------------------------------------------------

    def do_pass(self, passer: Body, action: str, receiver: Body, point: tuple[float, float], *,
                qualifiers: list[str] | None = None, body: str | None = None, forced: bool = False) -> None:
        """Decide the pass's whole outcome at the kick, emit the Pass, and launch the ball (actions.md §3)."""
        r = self.rng["outcomes"]
        side, east = passer.side, self.east(passer.side)
        ex, ey = pitch.to_team(*point, east)
        sx, sy = self.ball_x, self.ball_y
        length = math.hypot(ex - sx, ey - sy)
        weak = body is None and outcomes.uses_weak_foot(passer, r)
        pressured = self.under_pressure(passer)
        lofted = action in config.LOFTED or (action == "throw_in" and length > 20)
        lo, hi = config.BALL_SPEED_KMH.get(action, (35, 60))
        speed = r.uniform(lo, hi) * (0.9 + 0.2 * passer.attr("passing") / 99)
        if self.wet and not lofted:
            speed *= config.WET_ROLL_SPEED
        peak = r.uniform(*config.PEAK_M.get(action, (3, 6))) if lofted else 0.0
        quals = list(qualifiers or [])
        if action in ("through_ball", "cross", "cutback"):
            quals.append(action)
        if length > config.LONG_PASS_M and action != "cross":
            quals.append("long_ball")
        if abs(ey - sy) > config.SWITCH_DY_M:
            quals.append("switch_of_play")
        if weak:
            quals.append("weak_foot")
        base_action = action if action in config.BASE_SUCCESS else "short_pass"
        marked = 99.0 if lofted else min((math.hypot(o.x - ex, o.y - ey) for o in self.on_pitch(self.other(side))),
                                         default=99.0)
        p_ok = 0.97 if forced else outcomes.pass_success(base_action, passer, receiver, length, pressured, weak,
                                                         self.wet, self.windy, marked)
        result, target, data = "receive", receiver, {}
        if not lofted and not forced:
            opps = sorted(self.on_pitch(self.other(side)), key=lambda o: (math.hypot(o.x - sx, o.y - sy), o.slot_index))
            for o in opps:
                dist, t = pitch.segment_distance(sx, sy, ex, ey, o.x, o.y)
                if 0.1 < t < 0.95 and r.random() < outcomes.intercept_chance(o, dist, speed):
                    result, target = "intercept", o
                    ex, ey = sx + (ex - sx) * t, sy + (ey - sy) * t
                    break
        if result == "receive" and r.random() >= p_ok:
            ang = r.uniform(0, 2 * math.pi)
            off = r.uniform(*config.LOOSE_OFFSET_M) * (1.5 if lofted else 1.0)
            ex, ey = ex + off * math.cos(ang), ey + off * math.sin(ang)
            result, target = "loose", None
            if action == "cross" and r.random() < config.CROSS_CUT_OUT_CORNER:
                result = "behind"                   # a defender cuts the cross out behind his goal line
                ex, ey = pitch.clamp(ex, ey)
            elif not (0 <= ex <= pitch.LENGTH and 0 <= ey <= pitch.WIDTH):
                ex, ey = self._crossing(sx, sy, ex, ey)
                result = "out"
        elif result == "receive" and lofted and not forced:
            defenders = [o for o in self.on_pitch(self.other(side)) if not o.is_gk]
            rival = min(defenders, key=lambda o: (math.hypot(o.x - ex, o.y - ey), o.slot_index), default=None)
            if rival is not None and math.hypot(rival.x - ex, rival.y - ey) < 6.0:
                won = r.random() < outcomes.aerial_win(receiver, rival)
                result, data = "aerial", {"attacker": receiver, "defender": rival, "attacker_won": won}
                target = receiver if won else rival
        if result in ("receive", "aerial") and not forced and \
                discipline.offside(self, passer, receiver, action, self.rng["discipline"]):
            endx, endy = self.tp(side, ex, ey)
            self.emit("Pass", passer, outcome="fail", end_x=endx, end_y=endy,
                      body_part=body or outcomes.body_part(passer, weak), under_pressure=pressured,
                      qualifiers=quals, ball_speed_kmh=round(speed, 1))
            self.emit("Offside", receiver)
            ox, oy = receiver.x, receiver.y
            self.schedule_restart("free_kick_indirect", self.other(side), ox, oy,
                                  self.rng["restarts"].uniform(*config.DEAD_TIME_S["free_kick"]))
            return
        success = result == "receive" or (result == "aerial" and data["attacker_won"])
        endx, endy = self.tp(side, ex, ey)
        ev = self.emit("Pass", passer, outcome="success" if success else "fail",
                       receiver_id=receiver.pid if success else None, end_x=endx, end_y=endy,
                       body_part=body or outcomes.body_part(passer, weak), under_pressure=pressured,
                       qualifiers=quals, ball_speed_kmh=round(speed, 1))
        self.launch(action, passer, ex, ey, result, speed_kmh=speed, peak=peak, target=target, event=ev,
                    receiver=receiver, **data)

    # --- shots ------------------------------------------------------------------------------------------------

    def situation(self, side: str) -> str:
        if self.set_piece and self.set_piece[1] == side and self.match_ms - self.set_piece[2] <= 10_000:
            kind = SET_PIECE_SITUATION.get(self.set_piece[0])
            if kind:
                return kind
        return "counter" if self.in_counter(side) else "open_play"

    def _shot_inputs(self, b: Body) -> tuple[float, float, int, float]:
        tx, ty = self.tpos(b)
        east = self.east(b.side)
        defenders = sum(1 for o in self.on_pitch(self.other(b.side)) if not o.is_gk and
                        outcomes.in_triangle(*pitch.to_team(o.x, o.y, east), tx, ty))
        gk = self.keeper(self.other(b.side))
        off = 0.0
        if gk is not None:
            gx, gy = pitch.to_team(gk.x, gk.y, east)
            off = pitch.segment_distance(tx, ty, pitch.LENGTH, pitch.GOAL_Y, gx, gy)[0]
        return tx, ty, defenders, off

    def _assist_type(self, side: str, shooter: Body) -> str:
        lp = self.last_pass[side]
        if not lp or lp[1] != shooter.pid:
            return "none"
        quals = lp[0].get("qualifiers", [])
        for q in ("cutback", "through_ball", "cross"):
            if q in quals:
                return q
        return "none"

    def shot_xg(self, b: Body, open_play: bool = True, header: bool = False) -> float:
        tx, ty, defenders, off = self._shot_inputs(b)
        return outcomes.xg(tx, ty, header=header, weak=False, weak_foot=b.player.weak_foot,
                           situation=self.situation(b.side) if open_play else "open_play",
                           assist=self._assist_type(b.side, b), defenders_in_way=defenders, keeper_off_line_m=off)

    def do_shot(self, b: Body, header: bool = False, wall: int = 0) -> None:
        r = self.rng["outcomes"]
        side, east = b.side, self.east(b.side)
        tx, ty, defenders, off = self._shot_inputs(b)
        defenders += wall
        situation = self.situation(side)
        weak = not header and outcomes.uses_weak_foot(b, r, 0.20)
        assist = self._assist_type(side, b)
        value = outcomes.xg(tx, ty, header=header, weak=weak, weak_foot=b.player.weak_foot, situation=situation,
                            assist=assist, defenders_in_way=defenders, keeper_off_line_m=off)
        keeper = self.keeper(self.other(side))
        pressured = self.under_pressure(b)
        res = outcomes.resolve_shot(r, value, b, keeper, header=header, weak=weak, pressured=pressured,
                                    defenders_in_way=defenders, windy=self.windy,
                                    distance_m=pitch.goal_distance(tx, ty))
        self.xg_total[side] += value
        quals = (["headed"] if header else []) + (["weak_foot"] if weak else [])
        fields = {"shot_outcome": res["outcome"], "situation": situation,
                  "body_part": "head" if header else outcomes.body_part(b, weak),
                  "shot_speed_kmh": res["speed"], "goal_mouth_y": res["mouth_y"], "goal_mouth_z": res["mouth_z"],
                  "under_pressure": pressured, "qualifiers": quals}
        lp = self.last_pass[side]
        if lp and lp[1] == b.pid:
            lp[0]["qualifiers"].append("key_pass")
            fields.update(assisted_by=lp[0]["player_id"], key_pass_event_id=lp[0]["event_id"])
        self.emit("Shot", b, **fields)
        self.last_pass[side] = None
        # where the ball goes
        if res["outcome"] == "blocked":
            blocker = min((o for o in self.on_pitch(self.other(side)) if not o.is_gk
                           and outcomes.in_triangle(*pitch.to_team(o.x, o.y, east), tx, ty)),
                          key=lambda o: (math.hypot(o.x - b.x, o.y - b.y), o.slot_index))
            self.launch("shot", b, blocker.x, blocker.y, "block", speed_kmh=res["speed"], target=blocker)
            return
        mouth = res["mouth_y"] if res["mouth_y"] is not None else 50.0
        gy = pitch.GOAL_Y - pitch.GOAL_HALF_WIDTH + 2 * pitch.GOAL_HALF_WIDTH * mouth / 100
        gx, gyp = pitch.to_team(pitch.LENGTH, min(max(gy, -5.0), pitch.WIDTH + 5), east)
        gx, gyp = pitch.clamp(gx, gyp)
        result = {"goal": "goal", "saved": "save", "missed": "miss", "woodwork": "woodwork"}[res["outcome"]]
        self.launch("shot", b, gx, gyp, result, speed_kmh=res["speed"], target=keeper)

    # --- on-ball actions --------------------------------------------------------------------------------------

    def decide(self) -> None:
        b = self.carrier
        choice = decisions.choose(self, b, self.rng["decisions"])
        a = choice.action
        if a in PASS_ACTIONS:
            self.do_pass(b, a, choice.target, choice.point)
        elif a == "shot":
            self.do_shot(b)
        elif a == "carry":
            self.start_carry(b, choice.point)
        elif a == "take_on":
            self.do_take_on(b)
        elif a == "clearance":
            self.do_clearance(b)
        else:
            self.decide_at = self.match_ms + int(self.rng["decisions"].uniform(0.6, 1.5) * 1000)

    def start_carry(self, b: Body, point: tuple[float, float]) -> None:
        east = self.east(b.side)
        tx, ty = pitch.to_team(*point, east)
        dist = math.hypot(tx - b.x, ty - b.y)
        secs = min(max(dist / max(0.7 * b.top_speed, 1.0), config.CARRY_S[0]), config.CARRY_S[1])
        self.carrying, self.carry_from, self.carry_to = True, (b.x, b.y), (tx, ty)
        self.carry_until = self.match_ms + int(secs * 1000)

    def end_carry(self, b: Body) -> None:
        ex, ey = self.tp(b.side, b.x, b.y)
        self.emit("Carry", b, at=self.carry_from, end_x=ex, end_y=ey, under_pressure=self.under_pressure(b))
        self.carrying = False

    def do_take_on(self, b: Body) -> None:
        r = self.rng["outcomes"]
        opp = min(self.on_pitch(self.other(b.side)), key=lambda o: (math.hypot(o.x - b.x, o.y - b.y), o.slot_index))
        if self.rng["discipline"].random() < discipline.foul_chance(self, opp, b, "take_on"):
            self.emit("TakeOn", b, outcome="success", under_pressure=True)
            discipline.commit_foul(self, opp, b)
            return
        if r.random() < outcomes.take_on_success(b, opp):
            self.emit("TakeOn", b, outcome="success", under_pressure=True)
            opp.stunned_until = self.match_ms + 1500
            tx, ty = self.tpos(b)
            self.start_carry(b, (min(tx + r.uniform(5, 10), pitch.LENGTH - 3), ty))
        else:
            self.emit("TakeOn", b, outcome="fail", under_pressure=True)
            self._won_tackle(opp, b)

    def do_clearance(self, b: Body) -> None:
        r = self.rng["outcomes"]
        tx, ty = self.tpos(b)
        ex, ey = tx + r.uniform(25, 55), ty + r.uniform(-20, 20)
        ex, ey = pitch.to_team(ex, ey, self.east(b.side))
        result = "loose"
        if not (0 <= ex <= pitch.LENGTH and 0 <= ey <= pitch.WIDTH):
            ex, ey = self._crossing(self.ball_x, self.ball_y, ex, ey)
            result = "out"
        endx, endy = self.tp(b.side, ex, ey)
        self.emit("Clearance", b, end_x=endx, end_y=endy, under_pressure=self.under_pressure(b))
        if self.set_piece and self.set_piece[1] != b.side:
            self.set_piece = None
        self.launch("clearance", b, ex, ey, result, speed_kmh=r.uniform(*config.BALL_SPEED_KMH["clearance"]),
                    peak=r.uniform(*config.PEAK_M["clearance"]))

    def _won_tackle(self, d: Body, carrier: Body) -> None:
        """Defender `d` has won the ball from `carrier`: he keeps it, or pokes it loose."""
        r = self.rng["outcomes"]
        if self.carrying:
            self.end_carry(carrier)
        self.emit("Tackle", d, outcome="success")
        if r.random() < config.TACKLE_POKE_LOOSE:
            ang = r.uniform(0, 2 * math.pi)
            lx, ly = pitch.clamp(d.x + 4 * math.cos(ang), d.y + 4 * math.sin(ang))
            self.mode, self.carrier, self.carrying = "loose", None, False
            self.ball_x, self.ball_y = lx, ly
            self.last_touch = d.side
            self.pressers = []
        else:
            self.gain(d.side, "regain", (d.x, d.y))
            self.give_ball(d)

    # --- defending (engine.md §5) -----------------------------------------------------------------------------

    def defend(self) -> None:
        b = self.carrier
        now = self.match_ms
        r = self.rng["outcomes"]
        self.pressers = [d for d in self.pressers if d.on]
        for d in self.pressers:
            dist = math.hypot(d.x - b.x, d.y - b.y)
            if dist <= config.PRESSURE_RADIUS_M and now - d.last_pressure_ms >= config.PRESSURE_REPEAT_MS:
                self.emit("Pressure", d, target_player_id=b.pid)
                d.last_pressure_ms = now
                self.pressed_at[b.pid] = now
        for d in sorted(self.on_pitch(self.other(b.side)), key=lambda o: o.slot_index):
            if d.is_gk or now < d.stunned_until:
                continue
            if math.hypot(d.x - b.x, d.y - b.y) > config.TACKLE_RADIUS_M:
                continue
            rate = config.TACKLE_RATE_PER_STEP * d.attr("tackling") / 70 * config.PRESS_ROLE.get(d.role, 1.0)
            if r.random() >= rate:
                continue
            if self.rng["discipline"].random() < discipline.foul_chance(self, d, b, "tackle"):
                discipline.commit_foul(self, d, b)
                return
            if r.random() < outcomes.tackle_success(d, b):
                self._won_tackle(d, b)
            else:
                self.emit("Tackle", d, outcome="fail")
                d.stunned_until = now + 1200
            return

    # --- arrivals ---------------------------------------------------------------------------------------------

    def arrive(self) -> None:
        f = self.flight
        r = self.rng["outcomes"]
        res = f.result
        side = f.actor.side
        if res == "receive":
            if self.in_counter(side) and self.tp(side, f.ex, f.ey)[0] < self.tp(side, f.sx, f.sy)[0] - config.COUNTER_BACK_PCT:
                self.last_regain[side] = (-10**9, 100.0)    # a pass backwards slows the attack: no longer a counter
            self.gain(side, "pass")
            if f.kind in PASS_ACTIONS or f.kind in ("throw_in", "kickoff", "goal_kick"):
                self.last_pass[side] = (f.data["event"], f.target.pid)
            self.give_ball(f.target)
        elif res == "intercept":
            self.emit("Interception", f.target)
            self.gain(f.target.side, "regain", (f.target.x, f.target.y))
            self.give_ball(f.target)
        elif res == "aerial":
            att, dfd, won = f.data["attacker"], f.data["defender"], f.data["attacker_won"]
            if not (att.on and dfd.on):
                self.mode, self.flight = "loose", None
                return
            if self.rng["discipline"].random() < discipline.foul_chance(self, dfd, att, "aerial"):
                self.emit("Aerial", att, outcome="success")
                self.emit("Aerial", dfd, outcome="fail")
                discipline.commit_foul(self, dfd, att)
                return
            self.emit("Aerial", att if won else dfd, outcome="success")
            self.emit("Aerial", dfd if won else att, outcome="fail")
            if won:
                self.gain(side, "pass")
                self.last_pass[side] = (f.data["event"], att.pid)
                tx, ty = self.tpos(att)
                if f.kind == "cross" and pitch.in_box(tx, ty) and r.random() < config.HEADER_SHOT_SHARE:
                    self.carrier = att
                    self.do_shot(att, header=True)
                else:
                    self.give_ball(att)
            elif f.kind == "cross" and r.random() < config.CROSS_HEADED_CORNER:
                self._behind_for_corner(side, f.ey)
            else:
                self.gain(dfd.side, "regain", (dfd.x, dfd.y))
                self.carrier = dfd
                self.do_clearance(dfd)
        elif res == "loose" or res == "woodwork":
            self.mode, self.flight = "loose", None
            if res == "woodwork":
                tx = pitch.LENGTH - r.uniform(6, 14)
                ty = pitch.GOAL_Y + r.uniform(-10, 10)
                self.ball_x, self.ball_y = pitch.clamp(*pitch.to_team(tx, ty, self.east(side)))
        elif res == "out":
            self._out(f.ex, f.ey, self.last_touch)
        elif res == "behind":
            self._behind_for_corner(side, f.ey)
        elif res == "goal":
            self.score[side] += 1
            dead = self.rng["restarts"].uniform(*config.DEAD_TIME_S["kickoff_after_goal"])
            self.stoppage_ms += int(dead * 1000)
            cx, cy = set_pieces.kickoff_spot()
            self.schedule_restart("kickoff", self.other(side), cx, cy, dead)
        elif res == "save":
            keeper = f.target
            self.emit("Save", keeper)
            kind = r.choices(list(config.SAVE_RESULT), weights=list(config.SAVE_RESULT.values()), k=1)[0]
            if kind == "held":
                self.gain(keeper.side, "regain", (keeper.x, keeper.y))
                self.give_ball(keeper)
            elif kind == "corner":
                self._behind_for_corner(side, f.ey)
            else:
                tx = pitch.LENGTH - r.uniform(5, 10)
                ty = pitch.GOAL_Y + r.uniform(-8, 8)
                self.mode, self.flight, self.last_touch = "loose", None, keeper.side
                self.ball_x, self.ball_y = pitch.clamp(*pitch.to_team(tx, ty, self.east(side)))
        elif res == "block":
            if r.random() < config.BLOCK_CORNER:
                self._behind_for_corner(side, f.ey)
                return
            ang = r.uniform(0, 2 * math.pi)
            self.mode, self.flight, self.last_touch = "loose", None, f.target.side
            self.ball_x, self.ball_y = pitch.clamp(f.ex + 4 * math.cos(ang), f.ey + 4 * math.sin(ang))
        elif res == "miss":
            self._out(f.ex, f.ey, side)

    def _behind_for_corner(self, side: str, near_y: float) -> None:
        """A defender (or the keeper) has put the ball behind his own goal line: corner to `side` (actions.md §3)."""
        self.last_touch = self.other(side)
        cy = 0.0 if near_y < pitch.GOAL_Y else pitch.WIDTH
        gx = pitch.LENGTH if self.east(side) else 0.0
        self.schedule_restart("corner", side, gx, cy, self.rng["outcomes"].uniform(*config.DEAD_TIME_S["corner"]))

    def _pick_chasers(self) -> None:
        """Loose ball: the nearest two of each side chase it (engine.md §3)."""
        chasers = []
        for side in ("home", "away"):
            team = sorted(self.on_pitch(side), key=lambda b: (math.hypot(b.x - self.ball_x, b.y - self.ball_y),
                                                               b.slot_index))
            chasers += team[:2]
        self.chasers = chasers

    def chase(self) -> None:
        """After this step's movement, the first chaser to reach the loose ball wins it."""
        self.chasers = [b for b in self.chasers if b.on]
        if not self.chasers:
            self._pick_chasers()
        winner = min(self.chasers, key=lambda b: (math.hypot(b.x - self.ball_x, b.y - self.ball_y),
                                             -b.attr("positioning"), b.slot_index))
        if math.hypot(winner.x - self.ball_x, winner.y - self.ball_y) <= 1.0:
            self.emit("BallRecovery", winner)
            self.gain(winner.side, "regain", (winner.x, winner.y))
            self.give_ball(winner)

    # --- restarts (set-pieces-and-discipline.md §1) -----------------------------------------------------------

    def schedule_restart(self, kind: str, side: str, x: float, y: float, dead_s: float) -> None:
        self.mode, self.carrier, self.flight, self.carrying, self.pressers = "dead", None, None, False, []
        self.ball_x, self.ball_y, self.ball_z = x, y, 0.0
        discipline.maybe_substitute(self)
        self.restart = Restart(kind, side, x, y, self.period_ms + int(dead_s * 1000))
        self.restart_taker = set_pieces.taker(self, self.restart)
        self.corner_box = set_pieces.corner_attackers(self, side) if kind == "corner" else []
        if self.restart_taker in self.corner_box:
            self.corner_box.remove(self.restart_taker)

    def substitute(self, off: Body, on_player) -> Body:
        side = off.side
        pid = f"{self.team_id[side]}-{on_player.shirt:02d}"
        self.emit("Substitution", off, player_on_id=pid)
        off.on = False
        new = Body(pid, side, off.slot, off.slot_index, on_player, off.x, off.y)
        self.bodies[side].append(new)
        self.used_bench[side].add(on_player.shirt)
        self.subs_used[side] += 1
        return new

    def take_restart(self) -> None:
        rs, taker = self.restart, self.restart_taker
        self.restart = None
        self.gain(rs.side, "kickoff" if rs.kind == "kickoff" else "restart")
        self.ball_x, self.ball_y = rs.x, rs.y
        team = [b for b in self.on_pitch(rs.side) if b is not taker]
        east = self.east(rs.side)
        if rs.kind == "kickoff":
            behind = [b for b in team if b.slot in ("CM", "DM", "AM")] or team
            rcv = min(behind, key=lambda b: (math.hypot(b.x - rs.x, b.y - rs.y), b.slot_index))
            self.do_pass(taker, "short_pass", rcv, pitch.to_team(rcv.x, rcv.y, east), forced=True)
            return
        self.set_piece = (rs.kind, rs.side, self.match_ms)
        if rs.kind == "throw_in":
            near = [b for b in team if math.hypot(b.x - rs.x, b.y - rs.y) <= 20 and not b.is_gk] or team
            rcv = min(near, key=lambda b: (-self.nearest_opponent_dist(b), b.slot_index))
            self.do_pass(taker, "short_pass", rcv, pitch.to_team(rcv.x, rcv.y, east), qualifiers=["throw_in"],
                         body="other")
        elif rs.kind == "goal_kick":
            st, opp = self.style(rs.side), self.style(self.other(rs.side))
            if st["build_up_short"] >= 0.6 and opp["press_height"] < 0.6:
                cbs = [b for b in team if b.slot == "CB"] or team
                rcv = min(cbs, key=lambda b: (-self.nearest_opponent_dist(b), b.slot_index))
                self.do_pass(taker, "short_pass", rcv, pitch.to_team(rcv.x, rcv.y, east), qualifiers=["goal_kick"])
            else:
                aerial = [b for b in team if not b.is_gk]
                rcv = max(aerial, key=lambda b: (b.attr("aerial") + (15 if b.role == "target_man" else 0),
                                                 -b.slot_index))
                self.do_pass(taker, "long_pass", rcv, pitch.to_team(rcv.x, rcv.y, east), qualifiers=["goal_kick"])
        elif rs.kind == "penalty":
            self.carrier = taker
            taker.x, taker.y = rs.x, rs.y
            self.do_shot(taker)
            self.set_piece = None                # a rebound is open play
        elif rs.kind == "free_kick":
            self._take_free_kick(rs, taker, team)
        elif rs.kind == "free_kick_indirect":
            near = [b for b in team if not b.is_gk] or team
            rcv = min(near, key=lambda b: (math.hypot(b.x - rs.x, b.y - rs.y), b.slot_index))
            self.do_pass(taker, "short_pass", rcv, pitch.to_team(rcv.x, rcv.y, east))
        elif rs.kind == "corner":
            self.emit("Corner", taker)
            targets = self.corner_box or team
            rcv = targets[0]
            self.do_pass(taker, "cross", rcv, pitch.to_team(rcv.x, rcv.y, east), qualifiers=["corner"])
        self.last_touch = rs.side

    def _take_free_kick(self, rs: Restart, taker: Body, team: list[Body]) -> None:
        """Direct shot, cross into the box, or a short pass (set-pieces-and-discipline.md §1)."""
        r = self.rng["restarts"]
        east = self.east(rs.side)
        tx, ty = pitch.to_team(rs.x, rs.y, east)
        focus = self.style(rs.side)["set_piece_focus"]
        dist = pitch.goal_distance(tx, ty)
        if dist <= config.FREE_KICK_DIRECT_M and abs(ty - pitch.GOAL_Y) < 15 and \
                r.random() < config.FREE_KICK_DIRECT_SHARE * (0.5 + focus):
            self.carrier = taker
            taker.x, taker.y = rs.x, rs.y
            self.do_shot(taker, wall=config.FREE_KICK_WALL)
            return
        if tx > pitch.LENGTH * 0.66 and r.random() < focus:
            box = set_pieces.corner_attackers(self, rs.side)
            rcv = next((b for b in box if b is not taker), None)
            if rcv is not None:
                self.do_pass(taker, "cross", rcv, pitch.to_team(rcv.x, rcv.y, east), qualifiers=["free_kick"])
                return
        long_ball = tx < pitch.LENGTH / 2 and r.random() < self.style(rs.side)["directness"] * 0.6
        cands = decisions.pass_candidates(self, taker, "long_pass" if long_ball else "short_pass")
        if not cands:
            cands = decisions.pass_candidates(self, taker, "short_pass")
        if cands:
            rcv, point = decisions.pick_target(r, taker, cands)
            self.do_pass(taker, "long_pass" if long_ball and cands else "short_pass", rcv, point,
                         qualifiers=["free_kick"])
        else:
            self.give_ball(taker)

    # --- the loop (engine.md §2) ------------------------------------------------------------------------------

    @staticmethod
    def _runs_to_ball(f: Flight, b: Body) -> bool:
        """The receiver or interceptor runs to where the ball will land; so do both players in an aerial duel."""
        if b is f.target and f.result in ("receive", "intercept", "aerial"):
            return True
        return f.result == "aerial" and (b is f.data.get("defender") or b is f.data.get("attacker"))

    def _targets(self) -> list[tuple[Body, tuple[float, float], bool]]:
        out = []
        f = self.flight
        for side in ("home", "away"):
            for b in self.on_pitch(side):
                sprint = False
                t = None
                if self.mode == "dead" and self.restart is not None:
                    t = set_pieces.dead_ball_target(self, self.restart, b)
                elif b is self.carrier:
                    t = self.carry_to if self.carrying else (b.x, b.y)
                    sprint = self.carrying and self.in_counter(side)
                elif self.mode == "held" and b in self.pressers:
                    t, sprint = (self.carrier.x, self.carrier.y), True
                elif self.mode == "flight" and f is not None and self._runs_to_ball(f, b):
                    t, sprint = (f.ex, f.ey), True
                elif self.mode == "loose" and b in self.chasers:
                    t, sprint = (self.ball_x, self.ball_y), True
                if t is None:
                    t = self.shape_of(b)
                    breaking = self.in_counter(side) and movement.ANCHORS[self.formation[side]][b.slot_index][0] >= 40
                    sprint = breaking or math.hypot(t[0] - b.x, t[1] - b.y) > 15
                out.append((b, t, sprint))
        return out

    def _update_lines(self) -> None:
        for side in ("home", "away"):
            east = self.east(side)
            xs = sorted((pitch.team_pct(o.x, o.y, east)[0] for o in self.on_pitch(self.other(side))), reverse=True)
            self.offside_line[side] = max(xs[1] if len(xs) > 1 else 50.0, 50.0)

    def tick(self) -> None:
        self._update_style()
        self._update_lines()
        if self.mode == "dead" and self.restart is not None and self.period_ms >= self.restart.at_period_ms:
            self.take_restart()
        if self.mode == "loose":
            self._pick_chasers()
        targets = self._targets()
        for b, (tx, ty), sprint in targets:
            movement.step_body(b, tx, ty, sprint, self.rng["movement"], self.heat)
        px, py, pz = self.ball_x, self.ball_y, self.ball_z
        if self.mode == "held":
            self.ball_x, self.ball_y = movement.held_ball(self.carrier, self.east(self.carrier.side))
            self.ball_z = 0.0
        elif self.mode == "flight":
            self.ball_x, self.ball_y, self.ball_z = self.flight.at(self.match_ms)
        dt = config.STEP_MS / 1000
        self.ball_speed = math.dist((px, py, pz), (self.ball_x, self.ball_y, self.ball_z)) / dt
        if self.mode == "flight" and self.match_ms >= self.flight.t1:
            self.arrive()
        elif self.mode == "loose":
            self.chase()
        if self.mode == "held":
            self.defend()
        if self.mode == "held" and self.carrying and self.match_ms >= self.carry_until:
            self.end_carry(self.carrier)
            self.decide_at = self.match_ms
        if self.mode == "held" and not self.carrying and self.match_ms >= self.decide_at:
            self.decide()
        if self.mode != "dead" and self.poss_side:
            self.live_steps[self.poss_side] += 1
        if self.keep_frames:
            self.frames.append(movement.frame(self))

    def _place_for_kickoff(self, side: str) -> None:
        self.mode = "dead"
        self.ball_x, self.ball_y, self.ball_z = set_pieces.kickoff_spot() + (0.0,)
        self.restart = Restart("kickoff", side, self.ball_x, self.ball_y, 0)
        self.restart_taker = set_pieces.taker(self, self.restart)
        for s in ("home", "away"):
            for b in self.on_pitch(s):
                b.x, b.y = set_pieces.dead_ball_target(self, self.restart, b)
                b.vx = b.vy = 0.0

    def _period_over(self, end_ms: int) -> bool:
        if self.period_ms < end_ms:
            return False
        if self.mode == "dead" or self.period_ms >= end_ms + config.END_WINDOW_MS:
            return True
        bx = pitch.pct(self.ball_x, self.ball_y)[0]
        return 33 <= bx <= 67

    def run(self) -> MatchResult:
        first = "home" if self.rng["restarts"].random() < 0.5 else "away"
        for period in (1, 2):
            self.period, self.period_ms = period, 0
            self._update_style()
            kick = first if period == 1 else self.other(first)
            for s in ("home", "away"):        # initial positions so shape targets have something to work from
                for i, b in enumerate(self.on_pitch(s)):
                    ax, ay = movement.ANCHORS[self.formation[s]][b.slot_index]
                    b.x, b.y = pitch.to_team(*pitch.from_pct(min(ax, 45), ay), self.east(s))
            self._place_for_kickoff(kick)
            self.gain(kick, "kickoff")
            self.poss_id -= 1                 # take_restart counts the kickoff
            self.emit("PeriodStart")
            self.stoppage_ms = 0
            end_ms = None
            while True:
                self.tick()
                if end_ms is None and self.period_ms >= config.PERIOD_MS:
                    extra = self.rng["restarts"].uniform(*config.ADDED_EXTRA_S) * 1000
                    minutes = math.ceil((self.stoppage_ms + extra) / 60000)
                    minutes = min(max(minutes, config.ADDED_MIN_MINUTES[period]), config.ADDED_MAX_MINUTES)
                    end_ms = config.PERIOD_MS + minutes * 60000
                if end_ms is not None and self._period_over(end_ms):
                    break
                self.period_ms += config.STEP_MS
            if self.mode == "held" and self.carrying:
                self.end_carry(self.carrier)
            self.emit("PeriodEnd")
            self.offset_ms += self.period_ms + config.STEP_MS
            self.mode, self.carrier, self.flight, self.restart, self.carrying = "dead", None, None, None, False
            for s in ("home", "away"):
                for b in self.on_pitch(s):
                    b.stamina += config.HALF_TIME_RECOVERY * (1 - b.stamina)
        return MatchResult(self.setup, self.events, self.frames, dict(self.score), dict(self.conditions),
                           self.summary())

    def summary(self) -> dict:
        ev = self.events
        side_of = {self.team_id[s]: s for s in ("home", "away")}
        out = {"match_id": self.match_id, "seed": self.seed, "score": dict(self.score),
               "conditions": dict(self.conditions), "events": len(ev), "frames": len(self.frames)}
        live = sum(self.live_steps.values()) or 1
        for s in ("home", "away"):
            tid = self.team_id[s]
            passes = [e for e in ev if e["type"] == "Pass" and e.get("team_id") == tid]
            out[s] = {
                "team_id": tid,
                "goals": self.score[s],
                "shots": sum(1 for e in ev if e["type"] == "Shot" and e["team_id"] == tid),
                "xg": round(self.xg_total[s], 2),
                "passes": len(passes),
                "pass_completion": round(sum(1 for e in passes if e["outcome"] == "success") / max(len(passes), 1), 3),
                "possession": round(self.live_steps[s] / live, 3),
            }
        out["scorers"] = [e["player_id"] for e in ev if e["type"] == "Shot" and e["shot_outcome"] == "goal"]
        out["players"] = {b.pid: {"top_kmh": round(b.top_seen * 3.6, 1), "dist_m": round(b.dist),
                                  "started": b.pid in self.starters, "finished": b.on}
                          for s in ("home", "away") for b in self.bodies[s]}
        out["teams"] = side_of
        return out


def play(world_clubs: dict[str, world.Club], home_id: str, away_id: str, *, match_id: str, seed: int,
         kickoff_utc: str = "2026-10-24T19:00:00Z", keep_frames: bool = True, **kw) -> MatchResult:
    """Play one match between two clubs of the world."""
    return Match(world_clubs[home_id], world_clubs[away_id], match_id=match_id, seed=seed, kickoff_utc=kickoff_utc,
                 keep_frames=keep_frames, **kw).run()


if __name__ == "__main__":
    import time

    _, loaded = world.load_reference_clubs()
    clubs = {c.team_id: c for c in loaded}
    t0 = time.perf_counter()
    result = play(clubs, "SKH", "AMH", match_id="SYN-0001", seed=1)
    s = result.summary
    print(f"{s['home']['team_id']} {s['score']['home']}-{s['score']['away']} {s['away']['team_id']} · "
          f"{s['events']} events · {s['frames']} frames · {time.perf_counter() - t0:.1f}s")
    for side in ("home", "away"):
        print(side, s[side])
    print("conditions", s["conditions"], "scorers", s["scorers"])
