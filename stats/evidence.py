# evidence.py — Evidence packs
#
# Purpose: build the evidence pack for each moment, and the moment document that carries it
# Inputs:  a fired trigger (triggers.Fired), the match state right after the triggering event, the moment's ordinal
# Outputs: a moment document (CONTRACTS.md §10.2, with context.players) holding a §5 evidence pack
# Spec:    stats/specs/evidence-packs.md; stats/specs/publishing.md §3; CONTRACTS.md §5, §10.1–§10.2
#
# Facts are the only numbers an agent may cite. A fact whose value is missing or below its minimum sample is left
# out, never sent as zero. `event_ids` are ascending by seq and end with the triggering event, so `source` (the last
# event the evidence was computed from) is that event.

from __future__ import annotations

import rolling
from state import MatchState
from triggers import SHOT_CLUSTER_WINDOW_MS, Fired

MIN = 60_000
SCHEMA_VERSION = 1
EVIDENCE_VERSION = 1
MAX_ORDINAL = 9999
MAX_PRESS_EVENTS = 20


class OrdinalOverflow(RuntimeError):
    """A match produced more than 9,999 moments (publishing.md §3): fail loudly."""


def moment_id(match_id: str, ordinal: int) -> str:
    if not 1 <= ordinal <= MAX_ORDINAL:
        raise OrdinalOverflow(f"{match_id}: moment ordinal {ordinal} is out of range")
    return f"MO-{match_id[4:]}-{ordinal:04d}"


def fact(key: str, value, decimals: int, label: str, unit: str | None = None) -> dict:
    """One fact. `unit` is left out entirely when there is none (CONTRACTS.md §10.1 forbids an empty one)."""
    out = {"key": key, "value": round(value, decimals) if decimals else round(value), "decimals": decimals,
           "label": label}
    if unit is not None:
        out["unit"] = unit
    return out


def _seq(event_id: str) -> int:
    return int(event_id.rsplit("-", 1)[1])


def _ordered(ids: list[str], last: str) -> list[str]:
    """Unique ids ascending by seq, ending with the triggering event."""
    rest = sorted({i for i in ids if i != last}, key=_seq)
    return [i for i in rest if _seq(i) < _seq(last)] + [last]


class Builder:
    def __init__(self, state: MatchState):
        self.state = state

    def name(self, side: str) -> str:
        return self.state.teams[side].name

    def player_name(self, player_id: str) -> str:
        p = self.state.players.get(player_id)
        return p.name if p else player_id

    # --- the document -----------------------------------------------------------------------------------------

    def document(self, fired: Fired, ordinal: int) -> dict:
        s, e = self.state, fired.event
        mid = moment_id(s.match_id, ordinal)
        body = getattr(self, f"_{fired.trigger}")(fired)
        event_ids = _ordered(body.pop("event_ids"), e["event_id"])
        player_ids = list(dict.fromkeys(p for p in body.pop("player_ids") if p))
        team_id = s.teams[fired.side].team_id
        evidence = {"moment_id": mid, "match_id": s.match_id, "trigger": fired.trigger, "period": e["period"],
                    "match_ms": e["match_ms"], "clock": e["clock"], "team_id": team_id, "player_ids": player_ids,
                    "event_ids": event_ids, "window": body.pop("window"), "facts": body.pop("facts")}
        teams = {side: {"team_id": t.team_id, "name": t.name} for side, t in s.teams.items()}
        players = [{"player_id": p, "name": s.players[p].name, "pos": s.players[p].pos}
                   for p in player_ids if p in s.players]
        return {"id": mid, "moment_id": mid, "match_id": s.match_id, "kind": "moment",
                "schema_version": SCHEMA_VERSION, "evidence_version": EVIDENCE_VERSION, "evidence": evidence,
                "source": {"event_seq": e["seq"], "period": e["period"], "match_ms": e["match_ms"]},
                "context": {"phase": "live", "score": dict(s.score), "teams": teams, "players": players}}

    # --- facts per trigger (evidence-packs.md §1) ---------------------------------------------------------------

    def _possession_window(self, shot: dict) -> tuple[dict, list[str]]:
        events = [x for x in self.state.possession_events if x.get("team_id") == shot["team_id"]]
        start = events[0]["match_ms"] if events else shot["match_ms"]
        passes = [x["event_id"] for x in events if x["type"] == "Pass"]
        return {"from_ms": start, "to_ms": shot["match_ms"]}, passes

    def _score_facts(self, side: str) -> list[dict]:
        s = self.state
        return [fact("team_goals_match", s.score[side], 0, f"{self.name(side)} goals so far"),
                fact("opponent_goals_match", s.score[s.other(side)], 0,
                     f"{self.name(s.other(side))} goals so far")]

    def _goal(self, f: Fired) -> dict:
        s, e, n = self.state, f.event, f.data["numbers"]
        window, passes = self._possession_window(e)
        scorer = s.players.get(e.get("player_id"))
        facts = [fact("shot_xg", n["xg"], 2, f"Expected goals of {self.player_name(e['player_id'])}'s shot", "xG"),
                 fact("shot_distance_m", n["distance_m"], 0, "Distance of the shot from the goal centre", "m"),
                 *self._score_facts(f.side),
                 fact("player_goals_match", scorer.counts["goals"] if scorer else 1, 0,
                      f"{self.player_name(e['player_id'])}'s goals in this match"),
                 fact("team_shots_match", s.teams[f.side].counts["shots"], 0, f"{self.name(f.side)} shots so far"),
                 fact("shot_is_penalty", 1 if e.get("situation") == "penalty" else 0, 0,
                      "Whether the goal was a penalty (1) or not (0)")]
        return {"window": window, "event_ids": passes, "player_ids": [e.get("player_id"), e.get("assisted_by")],
                "facts": facts}

    def _penalty(self, f: Fired) -> dict:
        e, n = f.event, f.data["numbers"]
        foul = self.state.last_foul_by_side.get(self.state.other(f.side))
        start = foul["match_ms"] if foul and foul["period"] == e["period"] else e["match_ms"]
        facts = [fact("shot_xg", n["xg"], 2, "Expected goals of a penalty", "xG"), *self._score_facts(f.side)]
        return {"window": {"from_ms": start, "to_ms": e["match_ms"]},
                "event_ids": [foul["event_id"]] if foul and foul["period"] == e["period"] else [],
                "player_ids": [e.get("player_id")], "facts": facts}

    def _big_chance(self, f: Fired) -> dict:
        s, e, n = self.state, f.event, f.data["numbers"]
        window, passes = self._possession_window(e)
        t = s.teams[f.side]
        facts = [fact("shot_xg", n["xg"], 2, f"Expected goals of {self.player_name(e['player_id'])}'s shot", "xG"),
                 fact("shot_distance_m", n["distance_m"], 0, "Distance of the shot from the goal centre", "m"),
                 fact("team_shots_match", t.counts["shots"], 0, f"{self.name(f.side)} shots so far"),
                 fact("team_xg_match", t.xg, 2, f"{self.name(f.side)} expected goals so far", "xG")]
        return {"window": window, "event_ids": passes, "player_ids": [e.get("player_id"), e.get("assisted_by")],
                "facts": facts}

    def _red_card(self, f: Fired) -> dict:
        s, e = self.state, f.event
        foul = s.last_foul.get(e.get("player_id"))
        foul = foul if foul and foul["period"] == e["period"] else None
        c = s.teams[f.side].counts
        facts = [fact("team_players_on_pitch", s.on_pitch(f.side), 0, f"{self.name(f.side)} players left on the pitch"),
                 fact("team_fouls_match", c["fouls"], 0, f"{self.name(f.side)} fouls so far"),
                 fact("team_cards_match", c["yellows"] + c["reds"], 0, f"{self.name(f.side)} cards so far")]
        return {"window": {"from_ms": foul["match_ms"] if foul else e["match_ms"], "to_ms": e["match_ms"]},
                "event_ids": [foul["event_id"]] if foul else [], "player_ids": [e.get("player_id")], "facts": facts}

    def _shot_cluster(self, f: Fired) -> dict:
        """CONTRACTS.md §10.1 exactly: two facts, every counted shot, shooters in first-appearance order."""
        shots, e = f.data["shots"], f.event
        facts = [fact("shots_last_5min", len(shots), 0, f"{self.name(f.side)} shots in this five-minute window"),
                 fact("window_duration_min", SHOT_CLUSTER_WINDOW_MS // MIN, 0,
                      "Duration of the evidence window in minutes", "min")]
        return {"window": {"from_ms": e["match_ms"] - SHOT_CLUSTER_WINDOW_MS, "to_ms": e["match_ms"]},
                "event_ids": [s["event_id"] for s in shots], "player_ids": [s["player_id"] for s in shots],
                "facts": facts}

    def _recent_window(self, e: dict) -> dict:
        return {"from_ms": e["match_ms"] - 5 * MIN, "to_ms": e["match_ms"]}

    def _momentum_swing(self, f: Fired) -> dict:
        s, e = self.state, f.event
        at = rolling.At(e["period"], e["period_ms"])
        team_id = s.teams[f.side].team_id
        own = [i for i in rolling.event_ids(s, f.side, "momentum", at, rolling.LAST_5)
               if self._player_of(i).startswith(team_id)]          # opponent cards also credit momentum
        facts = [fact("momentum_share_last_5min_pct", f.data["recent_pct"], 0,
                      f"{self.name(f.side)} share of weighted attacking actions in the last 5 minutes", "%"),
                 fact("momentum_share_previous_10min_pct", f.data["baseline_pct"], 0,
                      f"{self.name(f.side)} share in the 10 minutes before that", "%"),
                 fact("team_shots_last_5min", rolling.shots(s, f.side, at, rolling.LAST_5), 0,
                      f"{self.name(f.side)} shots in the last 5 minutes"),
                 fact("window_duration_min", 5, 0, "Duration of the recent window in minutes", "min")]
        return {"window": self._recent_window(e), "event_ids": own,
                "player_ids": [self._player_of(i) for i in own], "facts": facts}

    def _press_change(self, f: Fired) -> dict:
        s, e, d = self.state, f.event, f.data
        at = rolling.At(e["period"], e["period_ms"])
        pressures = rolling.event_ids(s, f.side, "pressures", at, rolling.LAST_5)[-MAX_PRESS_EVENTS:]
        word = "more" if d["direction"] == "higher" else "less"
        facts = [fact("pressures_per_opp_pass_last_5min", d["recent"], 2,
                      f"{self.name(f.side)} pressures per opponent pass in the last 5 minutes (pressing {word})"),
                 fact("pressures_per_opp_pass_previous_10min", d["baseline"], 2,
                      f"{self.name(f.side)} pressures per opponent pass in the 10 minutes before that"),
                 fact("team_pressures_last_5min", rolling.count(s, f.side, "pressures", at, rolling.LAST_5), 0,
                      f"{self.name(f.side)} pressures in the last 5 minutes"),
                 fact("team_high_regains_last_5min", rolling.count(s, f.side, "high_regains", at, rolling.LAST_5), 0,
                      f"{self.name(f.side)} ball wins in the opponent's half in the last 5 minutes"),
                 fact("window_duration_min", 5, 0, "Duration of the recent window in minutes", "min")]
        height = rolling.press_height_m(s, f.side, at, rolling.LAST_5)
        if height is not None:
            facts.append(fact("press_height_last_5min_m", height, 0,
                              f"{self.name(f.side)} average height of defensive actions in the last 5 minutes", "m"))
        return {"window": self._recent_window(e), "event_ids": pressures,
                "player_ids": [self._player_of(i) for i in pressures], "facts": facts}

    def _milestone(self, f: Fired) -> dict:
        e, n = f.event, f.data["numbers"]
        scorer = self.state.players[e["player_id"]]
        facts = [fact("player_goals_match", scorer.counts["goals"], 0,
                      f"{scorer.name}'s goals in this match"),
                 fact("shot_xg", n["xg"], 2, f"Expected goals of {scorer.name}'s shot", "xG")]
        return {"window": {"from_ms": e["match_ms"], "to_ms": e["match_ms"]}, "event_ids": [],
                "player_ids": [e["player_id"]], "facts": facts}

    # --- helpers --------------------------------------------------------------------------------------------------

    def _player_of(self, event_id: str) -> str:
        return self.state.event_players.get(event_id, "")
