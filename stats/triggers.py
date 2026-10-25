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
COOLDOWN_MS = {"shot_cluster": 5 * MIN, "momentum_swing": 10 * MIN, "press_change": 10 * MIN,
               "head_to_head": 15 * MIN, "connection": 20 * MIN, "workhorse": 15 * MIN}
PRESS_EVENTS = frozenset({"Pressure", "Tackle", "Interception", "Foul", "BallRecovery"})
ORDER = ("goal", "red_card", "penalty", "big_chance", "shot_cluster", "momentum_swing", "press_change", "milestone",
         "head_to_head", "connection", "workhorse")
PRIORITY = {"goal": "high", "red_card": "high", "penalty": "high", "big_chance": "normal", "shot_cluster": "normal",
            "momentum_swing": "normal", "press_change": "normal", "milestone": "normal", "head_to_head": "normal",
            "connection": "normal", "workhorse": "normal"}

# Head-to-head (triggers.md §2.8): each side's leading player in a role, by the role score below
HEAD_TO_HEAD_FROM_MS = 20 * MIN
HEAD_TO_HEAD_MIN_SCORE = 3.0
HEAD_TO_HEAD_LEAD = 1.25          # the leader's score at least this many times the other side's leader's
HEAD_TO_HEAD_GAP_MS = 5 * MIN     # and never two head-to-heads (any roles) closer than this
DEFENDERS = frozenset({"CB", "LB", "RB", "LWB", "RWB"})
MIDFIELDERS = frozenset({"DM", "CM", "AM", "LM", "RM"})
FORWARDS = frozenset({"LW", "RW", "ST"})
# Connection (§2.9): a team's top passing pair over the last 15 minutes of the period
CONNECTION_WINDOW_MS = 15 * MIN
CONNECTION_FROM_PERIOD_MS = 15 * MIN
CONNECTION_MIN_PASSES = 8
CONNECTION_MIN_PROGRESSIVE = 2
# Workhorse (§2.10): the outfield player with the highest work score
WORKHORSE_FROM_MS = 25 * MIN
WORKHORSE_LEAD = 1.10
WORK_EVENTS = frozenset({"Tackle", "TakeOn", "Aerial", "Interception", "BallRecovery", "Pressure"})
WORK_WEIGHTS = {"km": 2.0, "sprints": 0.5, "duels_won": 1.5, "recoveries": 1.0, "interceptions": 1.0,
                "pressures": 0.3}


def role_of(pos: str) -> str:
    """The broad role of a lineup position: keeper, defender, midfielder or forward (unknown: midfielder)."""
    if pos == "GK":
        return "keeper"
    if pos in DEFENDERS:
        return "defender"
    if pos in FORWARDS:
        return "forward"
    return "midfielder"


def duels_won(c) -> int:
    return c["tackles_won"] + c["take_ons_completed"] + c["aerials_won"]


def role_score(role: str, player) -> float:
    """How much a player is shaping the match in their role (the same formulas as the web's head-to-head card)."""
    c = player.counts
    if role == "forward":
        return (c["goals"] * 3 + player.xg * 4 + c["on_target"] + c["shots"] * 0.5 + c["take_ons_completed"] * 0.5
                + c["key_passes"])
    if role == "midfielder":
        return (c["completed"] * 0.05 + c["progressive"] * 0.6 + c["key_passes"] * 1.5 + c["recoveries"] * 0.4
                + c["goals"] * 2)
    if role == "defender":
        return (c["tackles_won"] + c["interceptions"] + c["aerials_won"] + c["clearances"] * 0.5
                + c["recoveries"] * 0.5 + c["progressive"] * 0.2)
    return 0.0


def work_parts(player) -> dict[str, float]:
    """The work score's parts before weighting (km and sprints are zero without tracking)."""
    c = player.counts
    return {"km": player.motion.distance_m / 1000, "sprints": player.motion.sprints, "duels_won": duels_won(c),
            "recoveries": c["recoveries"], "interceptions": c["interceptions"], "pressures": c["pressures"]}


def work_score(player) -> float:
    return sum(WORK_WEIGHTS[k] * v for k, v in work_parts(player).items())


def pair_score(passes: list[dict], shot_moves: set) -> float:
    return sum(1 + 2 * p["progressive"] + p["final_third"] + 3 * (p["possession_id"] in shot_moves) for p in passes)


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
        self.announced: dict[str, object] = {}     # role, team or "match" -> the leader or pair last announced

    def _cooled(self, trigger: str, side: str, event: dict) -> bool:
        """`side` is the cooldown's key: a side, or a role for head_to_head and "match" for workhorse."""
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
        actor = state.players.get(event.get("player_id"))
        if actor is not None and role_of(actor.pos) != "keeper":
            battle = self._head_to_head(role_of(actor.pos), event)
            if battle is not None:
                fired.append(battle)
        if kind in ("Pass", "Shot"):
            pair = self._connection(side, event)
            if pair is not None:
                fired.append(pair)
        if kind in WORK_EVENTS:
            worker = self._workhorse(event)
            if worker is not None:
                fired.append(worker)
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

    # --- insight triggers (triggers.md §2.8–§2.10) ----------------------------------------------------------------

    def _leader(self, role: str, side: str):
        """A side's player in a role with the highest role score (anyone who has played), and that score."""
        best, score = None, 0.0
        for p in self.state.players.values():
            if p.side != side or p.on_ms is None or role_of(p.pos) != role:
                continue
            s = role_score(role, p)
            if s > score:
                best, score = p, s
        return best, score

    def _head_to_head(self, role: str, event: dict) -> Fired | None:
        if event["match_ms"] < HEAD_TO_HEAD_FROM_MS:
            return None
        (home, hs), (away, as_) = self._leader(role, "home"), self._leader(role, "away")
        if home is None or away is None:
            return None
        side, leader, rival, top, other = ("home", home, away, hs, as_) if hs >= as_ else ("away", away, home, as_, hs)
        if top < HEAD_TO_HEAD_MIN_SCORE or top < HEAD_TO_HEAD_LEAD * other:
            return None
        key = f"head_to_head:{role}"
        if self.announced.get(key) == leader.player_id or not self._cooled("head_to_head", role, event):
            return None
        last_any = self.announced.get("head_to_head:last_ms")
        if isinstance(last_any, int) and event["match_ms"] - last_any < HEAD_TO_HEAD_GAP_MS:
            return None
        self.announced[key] = leader.player_id
        self.announced["head_to_head:last_ms"] = event["match_ms"]
        self._mark("head_to_head", role, event)
        return Fired("head_to_head", side, event, {"role": role, "player": leader.player_id,
                                                   "rival": rival.player_id})

    def _connection(self, side: str, event: dict) -> Fired | None:
        if event["period_ms"] < CONNECTION_FROM_PERIOD_MS:
            return None
        team, t = self.state.teams[side], event["match_ms"]
        recent = [p for p in team.pair_log if p["period"] == event["period"] and t - CONNECTION_WINDOW_MS < p["match_ms"] <= t]
        if not recent:
            return None
        shot_moves = {s["possession_id"] for s in self.state.shots
                      if s["team_id"] == team.team_id and s["period"] == event["period"]
                      and t - CONNECTION_WINDOW_MS < s["match_ms"] <= t}
        pairs: dict[tuple, list[dict]] = {}
        for p in recent:
            pairs.setdefault(p["pair"], []).append(p)
        pair, passes = max(pairs.items(), key=lambda kv: (pair_score(kv[1], shot_moves), len(kv[1]), kv[0]))
        progressive = sum(p["progressive"] for p in passes)
        moves = sum(p["possession_id"] in shot_moves for p in passes)
        if len(passes) < CONNECTION_MIN_PASSES or (progressive < CONNECTION_MIN_PROGRESSIVE and moves < 1):
            return None
        key = f"connection:{side}"
        if self.announced.get(key) == pair or not self._cooled("connection", side, event):
            return None
        self.announced[key] = pair
        self._mark("connection", side, event)
        return Fired("connection", side, event, {"pair": pair, "passes": passes, "shot_moves": shot_moves})

    def _workhorse(self, event: dict) -> Fired | None:
        if event["match_ms"] < WORKHORSE_FROM_MS:
            return None
        ranked = sorted((p for p in self.state.players.values() if p.on_ms is not None and role_of(p.pos) != "keeper"),
                        key=lambda p: (work_score(p), p.player_id), reverse=True)
        if len(ranked) < 2:
            return None
        top, nxt = work_score(ranked[0]), work_score(ranked[1])
        if top <= 0 or top < WORKHORSE_LEAD * nxt:
            return None
        leader = ranked[0]
        if self.announced.get("workhorse") == leader.player_id or not self._cooled("workhorse", "match", event):
            return None
        self.announced["workhorse"] = leader.player_id
        self._mark("workhorse", "match", event)
        return Fired("workhorse", leader.side, event, {"player": leader.player_id})
