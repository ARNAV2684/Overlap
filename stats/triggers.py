# triggers.py — Moment triggers
#
# Purpose: flag moments worth explaining, from the event prefix only
# Inputs:  state.MatchState after each ordered event, and that event's numbers (per_event.annotate)
# Outputs: the triggers fired by the event, in the order triggers.md §1 lists them
# Spec:    stats/specs/triggers.md; CONTRACTS.md §10.1 (shot cluster)
#
# Never looks past the event being processed, never merges across trigger types. `sprint` is deferred (triggers.md):
# frames arrive independently of events, so its moments couldn't keep stable IDs.

from __future__ import annotations

from dataclasses import dataclass, field

import rolling
import xg
from state import MatchState

MIN = 60_000
SHOT_CLUSTER_WINDOW_MS = 5 * MIN
SHOT_CLUSTER_SHOTS = 3
SWING_POINTS = 25                 # percentage points, recent 5 min v the 10 before
SWING_MIN_SHARE = 60
PRESS_RATIO = 1.5
COOLDOWN_MS = {"shot_cluster": 5 * MIN, "momentum_swing": 10 * MIN, "press_change": 10 * MIN}
PRESS_EVENTS = frozenset({"Pressure", "Tackle", "Interception", "Foul", "BallRecovery"})
ORDER = ("goal", "red_card", "penalty", "big_chance", "shot_cluster", "momentum_swing", "press_change", "milestone")
PRIORITY = {"goal": "high", "red_card": "high", "penalty": "high", "big_chance": "normal", "shot_cluster": "normal",
            "momentum_swing": "normal", "press_change": "normal", "milestone": "normal"}


@dataclass
class Fired:
    trigger: str
    side: str                     # the team the moment is about
    event: dict                   # the triggering event
    data: dict = field(default_factory=dict)   # what the evidence needs that the state doesn't keep


class Triggers:
    """One match's trigger state: cooldowns per (trigger, side, period)."""

    def __init__(self, state: MatchState):
        self.state = state
        self.last_fired: dict[tuple[str, str, int], int] = {}

    def _cooled(self, trigger: str, side: str, event: dict) -> bool:
        last = self.last_fired.get((trigger, side, event["period"]))
        return last is None or event["match_ms"] - last >= COOLDOWN_MS[trigger]

    def _mark(self, trigger: str, side: str, event: dict) -> None:
        self.last_fired[(trigger, side, event["period"])] = event["match_ms"]

    def evaluate(self, event: dict, numbers: dict) -> list[Fired]:
        """Call after state.apply(event). Returns what fired, in ORDER."""
        state = self.state
        side = state.side_of.get(event.get("team_id"))
        if side is None or event["period"] not in (1, 2):
            return []
        kind = event["type"]
        fired: list[Fired] = []
        if kind == "Shot":
            outcome, penalty = event["shot_outcome"], event.get("situation") == "penalty"
            if outcome == "goal":
                fired.append(Fired("goal", side, event, {"numbers": numbers}))
            if penalty and outcome != "goal":
                fired.append(Fired("penalty", side, event, {"numbers": numbers}))
            if not penalty and outcome != "goal" and numbers["xg"] >= xg.BIG_CHANCE_XG:
                fired.append(Fired("big_chance", side, event, {"numbers": numbers}))
            cluster = self._shot_cluster(side, event)
            if cluster is not None:
                fired.append(cluster)
        if kind == "Card" and event.get("card") in ("red", "second_yellow"):
            fired.append(Fired("red_card", side, event))
        for team in (side, state.other(side)):
            swing = self._momentum_swing(team, event)
            if swing is not None:
                fired.append(swing)
        if kind in PRESS_EVENTS:
            press = self._press_change(side, event)
            if press is not None:
                fired.append(press)
        if kind == "Shot" and event["shot_outcome"] == "goal":
            scorer = state.players.get(event.get("player_id"))
            if scorer is not None and scorer.counts["goals"] in (2, 3):
                fired.append(Fired("milestone", side, event, {"numbers": numbers}))
        return sorted(fired, key=lambda f: ORDER.index(f.trigger))

    # --- comparison and count triggers ---------------------------------------------------------------------------

    def _shot_cluster(self, side: str, event: dict) -> Fired | None:
        """CONTRACTS.md §10.1: 3+ of the team's shots in (t − 5 min, t], same period, after 5 min of it."""
        if event["period_ms"] < SHOT_CLUSTER_WINDOW_MS or not self._cooled("shot_cluster", side, event):
            return None
        t, team_id = event["match_ms"], event["team_id"]
        shots = [s for s in self.state.shots if s["team_id"] == team_id and s["period"] == event["period"]
                 and t - SHOT_CLUSTER_WINDOW_MS < s["match_ms"] <= t and s["seq"] <= event["seq"]]
        if len(shots) < SHOT_CLUSTER_SHOTS:
            return None
        self._mark("shot_cluster", side, event)
        return Fired("shot_cluster", side, event, {"shots": shots})

    def _momentum_swing(self, side: str, event: dict) -> Fired | None:
        at = rolling.At(event["period"], event["period_ms"])
        change = rolling.momentum_change_pp(self.state, side, at)
        if change is None or not self._cooled("momentum_swing", side, event):
            return None
        recent, baseline = change
        if recent - baseline < SWING_POINTS or recent < SWING_MIN_SHARE:
            return None
        self._mark("momentum_swing", side, event)
        return Fired("momentum_swing", side, event, {"recent_pct": recent, "baseline_pct": baseline})

    def _press_change(self, side: str, event: dict) -> Fired | None:
        at = rolling.At(event["period"], event["period_ms"])
        change = rolling.pressing_rate_change(self.state, side, at)
        if change is None or not self._cooled("press_change", side, event):
            return None
        recent, baseline = change
        if baseline <= 0:
            return None
        ratio = recent / baseline if recent > 0 else 0.0
        if ratio >= PRESS_RATIO:
            direction = "higher"
        elif ratio <= 1 / PRESS_RATIO:
            direction = "deeper"
        else:
            return None
        self._mark("press_change", side, event)
        return Fired("press_change", side, event, {"recent": recent, "baseline": baseline, "direction": direction})
