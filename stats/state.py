# state.py — Match state
#
# Purpose: keep score, clock, players, possessions and running totals in memory, one event at a time
# Inputs:  the match setup, then ordered events (dedupe.Orderer) and tracking frames
# Outputs: the current match state, read by whole_match.py, rolling.py and publish.py (and triggers, stats S3)
# Spec:    stats/specs/metrics.md §4–§6; stats/specs/windows.md; stats/specs/publishing.md §1
#
# Events are in their acting team's frame (CONTRACTS.md §1.1), so every position here is in that team's frame.

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass, field

import per_event

SIDES = ("home", "away")
OWNING_TYPES = frozenset({"Pass", "Carry", "TakeOn", "Shot"})
PPDA_ACTIONS = frozenset({"Tackle", "Interception", "Foul"})
PRESS_ACTIONS = frozenset({"Tackle", "Interception", "Foul", "BallRecovery", "Pressure"})
PPDA_PASS_MAX_X = 60.0
PPDA_ACTION_MIN_X = 40.0
HIGH_REGAIN_X = 60.0

# Momentum weights (metrics.md §5; CONTRACTS.md §8)
MOMENTUM = {"goal": 5.0, "saved": 3.0, "other_shot": 1.5, "key_pass": 2.0, "take_on": 1.0, "red": 3.0, "yellow": 1.0}

# Grids (metrics.md §4, §6), in each team's own frame
GRID_COLS, GRID_ROWS = 9, 6           # pressing grid: x columns from own goal, y rows from own left
ZONE_COLS, ZONE_CHANNELS = 6, 3       # touch zones


def cell(x: float, y: float, cols: int, rows: int) -> tuple[int, int]:
    return min(int(x * cols / 100), cols - 1), min(int(y * rows / 100), rows - 1)


@dataclass
class Player:
    player_id: str
    name: str
    pos: str
    side: str
    on_ms: int | None = None       # match_ms he came on (0 for a starter)
    off_ms: int | None = None      # match_ms he went off (substitution or red card)
    counts: Counter = field(default_factory=Counter)
    xg: float = 0.0
    motion: per_event.Motion = field(default_factory=per_event.Motion)


@dataclass
class Team:
    team_id: str
    name: str
    side: str
    counts: Counter = field(default_factory=Counter)
    xg: float = 0.0
    possession_ms: int = 0
    momentum: float = 0.0
    press_x_sum: float = 0.0       # metres from own goal, summed over PRESS_ACTIONS
    # Timelines for windows (windows.md): name -> [(period, period_ms, value)], in event order
    timeline: dict[str, list[tuple[int, int, float]]] = field(default_factory=dict)
    # Pass network (starting XI until the team's first substitution), zones and pressing grid (metrics.md §4, §6)
    first_sub_ms: int | None = None
    pass_nodes: dict[str, list[float]] = field(default_factory=dict)      # player_id -> [sum x, sum y, passes]
    pass_links: Counter = field(default_factory=Counter)                   # (passer, receiver) -> completed passes
    zones: list[list[int]] = field(default_factory=lambda: [[0] * ZONE_COLS for _ in range(ZONE_CHANNELS)])
    pressing_grid: list[list[int]] = field(default_factory=lambda: [[0] * GRID_ROWS for _ in range(GRID_COLS)])

    def log(self, name: str, event: dict, value: float = 1.0) -> None:
        self.timeline.setdefault(name, []).append((event["period"], event["period_ms"], value))


class MatchState:
    def __init__(self, setup: dict):
        self.match_id = setup["match_id"]
        self.setup = setup
        self.teams = {s: Team(setup["teams"][s]["team_id"], setup["teams"][s]["name"], s) for s in SIDES}
        self.side_of = {t.team_id: s for s, t in self.teams.items()}
        self.players: dict[str, Player] = {}
        for s in SIDES:
            team = setup["teams"][s]
            for p in team["lineup"]:
                self.players[p["player_id"]] = Player(p["player_id"], p["name"], p["pos"], s, on_ms=0)
            for p in team.get("bench", []):
                self.players[p["player_id"]] = Player(p["player_id"], p["name"], p["pos"], s)
        self.score = {s: 0 for s in SIDES}
        self.period = 0
        self.clock = "0:00"
        self.match_ms = 0
        self.source_seq = 0
        self.phase = "pre_match"
        self.passes: dict[str, dict] = {}            # event_id -> Pass, so a shot can find its key pass
        self.shots: list[dict] = []                   # shot events with their numbers, in order
        self.momentum_log: list[tuple[int, int, int, str, float]] = []   # (match_ms, period, period_ms, side, weight)
        self.period_ms = 0
        self.period_start_ms: dict[int, int] = {}                  # period -> match_ms of its PeriodStart
        self.period_length_ms: dict[int, int] = {}                 # period -> period_ms of its PeriodEnd
        self.unknown_types = 0
        self._poss: tuple[int, int, int] | None = None   # (possession_id, start match_ms, period)
        self._poss_owner: str | None = None
        self._poss_first_team: str | None = None

    # --- helpers ------------------------------------------------------------------------------------------------

    def other(self, side: str) -> str:
        return "away" if side == "home" else "home"

    def _team_of(self, event: dict) -> str | None:
        return self.side_of.get(event.get("team_id"))

    def _momentum(self, side: str, weight: float, event: dict) -> None:
        self.teams[side].momentum += weight
        self.teams[side].log("momentum", event, weight)
        self.momentum_log.append((event["match_ms"], event["period"], event["period_ms"], side, weight))

    def _close_possession(self, end_ms: int) -> None:
        if self._poss is None:
            return
        _, start, _ = self._poss
        owner = self._poss_owner or self._poss_first_team
        if owner is not None:
            self.teams[owner].possession_ms += max(end_ms - start, 0)
        self._poss = None

    def _possession(self, event: dict, side: str | None) -> None:
        pid = event.get("possession_id")
        if pid is None:
            return
        if self._poss is None or self._poss[0] != pid or self._poss[2] != event["period"]:
            self._close_possession(event["match_ms"])
            self._poss = (pid, event["match_ms"], event["period"])
            self._poss_owner, self._poss_first_team = None, None
        if side is not None:
            self._poss_first_team = self._poss_first_team or side
            if self._poss_owner is None and event["type"] in OWNING_TYPES:
                self._poss_owner = side

    def possession_ms(self, side: str) -> int:
        """Possession time so far, the open possession included up to the latest event."""
        total = self.teams[side].possession_ms
        if self._poss is not None and (self._poss_owner or self._poss_first_team) == side:
            total += max(self.match_ms - self._poss[1], 0)
        return total

    # --- events -------------------------------------------------------------------------------------------------

    def apply(self, event: dict) -> dict:
        """Applies one ordered event; returns its numbers (per_event.annotate)."""
        self.source_seq = event["seq"]
        self.match_ms = event["match_ms"]
        self.period = event["period"]
        self.period_ms = event["period_ms"]
        self.clock = event["clock"]
        kind = event["type"]
        side = self._team_of(event)
        if kind == "PeriodStart":
            self.phase = "live"
            self.period_start_ms[event["period"]] = event["match_ms"] - event["period_ms"]
        elif kind == "PeriodEnd":
            self.period_length_ms[event["period"]] = event["period_ms"]
            self._close_possession(event["match_ms"])
            self.phase = "half_time" if event["period"] == 1 else "full_time"
            if self.phase == "full_time":
                for p in self.players.values():
                    if p.on_ms is not None and p.off_ms is None:
                        p.off_ms = event["match_ms"]
        self._possession(event, side)
        key_pass = self.passes.get(event.get("key_pass_event_id")) if kind == "Shot" else None
        numbers = per_event.annotate(event, key_pass)
        if side is None:
            return numbers
        team, opp = self.teams[side], self.teams[self.other(side)]
        player = self.players.get(event.get("player_id"))
        pc = player.counts if player else Counter()
        tc = team.counts
        x = event.get("x")
        if x is not None and event.get("y") is not None:
            col, ch = cell(x, event["y"], ZONE_COLS, ZONE_CHANNELS)
            team.zones[ch][col] += 1

        if kind == "Pass":
            self.passes[event["event_id"]] = event
            done = event.get("outcome") == "success"
            team.log("passes", event)
            if x is not None and x <= PPDA_PASS_MAX_X:
                team.log("passes_own_60", event)
            if team.first_sub_ms is None and player is not None and x is not None:
                node = team.pass_nodes.setdefault(player.player_id, [0.0, 0.0, 0])
                node[0] += x
                node[1] += event.get("y", 50.0)
                node[2] += 1
                if done and event.get("receiver_id"):
                    team.pass_links[(player.player_id, event["receiver_id"])] += 1
            quals = set(event.get("qualifiers", ()))
            for c in (tc, pc):
                c["passes"] += 1
                c["completed"] += done
                c["progressive"] += numbers.get("progressive", False)
                c["difficult_completions"] += numbers.get("difficult_completion", False)
                c["crosses"] += "cross" in quals
            if x is not None and x <= PPDA_PASS_MAX_X:
                opp.counts["ppda_opp_passes"] += 1
            opp.counts["opp_passes"] += 1
        elif kind == "Shot":
            outcome = event["shot_outcome"]
            team.xg += numbers["xg"]
            if player:
                player.xg += numbers["xg"]
            for c in (tc, pc):
                c["shots"] += 1
                c["on_target"] += outcome in ("goal", "saved")
                c["blocked"] += outcome == "blocked"
                c["big_chances"] += numbers["big_chance"]
                c["goals"] += outcome == "goal"
            if outcome == "goal":
                self.score[side] += 1
            team.log("shots", event)
            self._momentum(side, MOMENTUM["goal"] if outcome == "goal" else MOMENTUM["saved"] if outcome == "saved"
                           else MOMENTUM["other_shot"], event)
            if key_pass is not None:
                tc["key_passes"] += 1
                passer = self.players.get(key_pass.get("player_id"))
                if passer:
                    passer.counts["key_passes"] += 1
                    if outcome == "goal" and event.get("assisted_by") == passer.player_id:
                        passer.counts["assists"] += 1
                self._momentum(side, MOMENTUM["key_pass"], event)
            self.shots.append({**event, **numbers})
        elif kind == "TakeOn":
            won = event.get("outcome") == "success"
            for c in (tc, pc):
                c["take_ons"] += 1
                c["take_ons_completed"] += won
            if won:
                self._momentum(side, MOMENTUM["take_on"], event)
        elif kind == "Tackle":
            won = event.get("outcome") == "success"
            for c in (tc, pc):
                c["tackles"] += 1
                c["tackles_won"] += won
            if won and x is not None and x >= HIGH_REGAIN_X:
                tc["high_regains"] += 1
                team.log("high_regains", event)
        elif kind in ("Interception", "BallRecovery"):
            for c in (tc, pc):
                c["interceptions" if kind == "Interception" else "recoveries"] += 1
            if x is not None and x >= HIGH_REGAIN_X:
                tc["high_regains"] += 1
                team.log("high_regains", event)
        elif kind == "Clearance":
            tc["clearances"] += 1
        elif kind == "Aerial":
            tc["aerials"] += 1
            tc["aerials_won"] += event.get("outcome") == "success"
        elif kind == "Pressure":
            for c in (tc, pc):
                c["pressures"] += 1
            team.log("pressures", event)
            if x is not None:
                col, row = cell(x, event.get("y", 50.0), GRID_COLS, GRID_ROWS)
                team.pressing_grid[col][row] += 1
        elif kind == "Foul":
            for c in (tc, pc):
                c["fouls"] += 1
        elif kind == "Card":
            red = event["card"] in ("red", "second_yellow")
            for c in (tc, pc):
                c["reds" if red else "yellows"] += 1
            if red and player:
                player.off_ms = event["match_ms"]
            self._momentum(self.other(side), MOMENTUM["red" if red else "yellow"], event)
        elif kind == "Corner":
            tc["corners"] += 1
        elif kind == "Offside":
            tc["offsides"] += 1
        elif kind == "Substitution":
            tc["substitutions"] += 1
            if team.first_sub_ms is None:
                team.first_sub_ms = event["match_ms"]
            if player:
                player.off_ms = event["match_ms"]
            sub = self.players.get(event.get("player_on_id"))
            if sub:
                sub.on_ms = event["match_ms"]
        elif kind not in ("Carry", "Save"):
            self.unknown_types += 1

        if kind in PPDA_ACTIONS and x is not None and x >= PPDA_ACTION_MIN_X:
            tc["ppda_actions"] += 1
            team.log("ppda_actions", event)
        if kind in PRESS_ACTIONS and x is not None:
            tc["press_actions"] += 1
            team.press_x_sum += x * 1.05
            team.log("press_m", event, x * 1.05)
        return numbers

    # --- tracking -----------------------------------------------------------------------------------------------

    def apply_frame(self, frame: dict) -> list[str]:
        """Applies one tracking frame; returns the players who completed a new sprint in it."""
        sprinted = []
        for p in frame.get("players", ()):
            player = self.players.get(p["player_id"])
            if player is not None and player.motion.add(p.get("speed_kmh", 0.0), p.get("dist_m", 0.0)):
                sprinted.append(p["player_id"])
        return sprinted

    def has_tracking(self) -> bool:
        return any(p.motion.top_speed_kmh > 0 for p in self.players.values())
