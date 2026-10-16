# state.py — Match state
#
# Purpose: hold everything the engine knows during a match: players on the pitch, the ball in flight, the restart
#          waiting to be taken, and the finished match
# Inputs:  -
# Outputs: the dataclasses the engine, movement, decisions and outcomes share
# Spec:    generator/specs/engine.md §1
#
# Positions are pitch-frame metres (x 0-105 west to east, y 0-68 north to south). Times are match_ms.

from __future__ import annotations

import math
from dataclasses import dataclass, field

import config
import world


def top_speed_ms(pace: int) -> float:
    """movement.md §2: about 30 km/h at 70 pace, 35 km/h at 99."""
    return 6.9 + 2.9 * (pace - 40) / 59


def acceleration_ms2(acceleration: int) -> float:
    return 2.5 + 2.0 * (acceleration - 40) / 59


@dataclass
class Body:
    """A player on the pitch."""
    pid: str
    side: str                       # "home" or "away"
    slot: str                       # the position he plays in this match
    slot_index: int                 # his slot in the formation, which picks his anchor
    player: world.Player
    x: float
    y: float
    vx: float = 0.0
    vy: float = 0.0
    stamina: float = 1.0
    dist: float = 0.0
    top_seen: float = 0.0
    on: bool = True
    last_pressure_ms: int = -10**9
    stunned_until: int = -10**9     # a beaten defender can't tackle again straight away
    bonus: dict = field(default_factory=dict)   # match-only adjustments, e.g. home composure (engine.md §9)
    top_speed: float = field(init=False)
    accel: float = field(init=False)

    def __post_init__(self) -> None:
        self.top_speed = top_speed_ms(self.player.attr["pace"])
        self.accel = acceleration_ms2(self.player.attr["acceleration"])

    def attr(self, key: str) -> float:
        return self.player.attr[key] + self.bonus.get(key, 0)

    @property
    def role(self) -> str:
        return self.player.role

    @property
    def speed(self) -> float:
        return math.hypot(self.vx, self.vy)

    @property
    def is_gk(self) -> bool:
        return self.slot == "GK"

    def fatigue(self) -> float:
        """1.0 when fresh; falls to 1 - TIRED_MAX_LOSS as stamina drops below TIRED (engine.md §6)."""
        if self.stamina >= config.TIRED:
            return 1.0
        return 1.0 - config.TIRED_MAX_LOSS * (config.TIRED - self.stamina) / config.TIRED


@dataclass
class Flight:
    """The ball travelling from one place to another, with its result already decided at the kick."""
    kind: str                       # pass action, "shot", "clearance", "goal_kick", "throw_in", "header"
    sx: float
    sy: float
    ex: float
    ey: float
    t0: int
    t1: int
    peak: float                     # metres; 0 for a ground ball
    result: str                     # receive, intercept, loose, out, aerial, goal, save, block, miss, woodwork
    actor: Body
    target: Body | None = None      # receiver, interceptor, blocker or the keeper
    data: dict = field(default_factory=dict)

    def at(self, t: int) -> tuple[float, float, float]:
        """Ball position (x, y, z) at match_ms t."""
        span = max(self.t1 - self.t0, 1)
        s = min(max((t - self.t0) / span, 0.0), 1.0)
        if self.peak <= 0:
            s = 1 - (1 - s) ** 1.6     # a rolling ball slows down
        x = self.sx + (self.ex - self.sx) * s
        y = self.sy + (self.ey - self.sy) * s
        z = 4 * self.peak * s * (1 - s) if self.peak > 0 else 0.0
        return x, y, z


@dataclass
class Restart:
    kind: str                       # kickoff, throw_in, goal_kick, corner
    side: str                       # the side taking it
    x: float
    y: float
    at_period_ms: int


@dataclass
class MatchResult:
    setup: dict
    events: list[dict]
    frames: list[dict]
    score: dict[str, int]
    conditions: dict
    summary: dict
