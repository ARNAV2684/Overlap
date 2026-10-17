# storylines.py — Storylines
#
# Purpose: load storyline files, decide when each one starts, apply their bounded odds changes during a match, and
#          record each one's answer key
# Inputs:  storylines/*.yaml; the match state
# Outputs: style deltas and multipliers the engine and discipline read; answer keys for the match summary
# Spec:    generator/specs/storylines.md
#
# A storyline never writes an event: it only tilts inputs the engine already has, inside a window, within limits.

from __future__ import annotations

import random
from dataclasses import dataclass, field
from pathlib import Path

import yaml

import world

STORYLINES_DIR = Path(__file__).with_name("storylines")
MAX_PER_MATCH = 2
STYLE_LIMIT = 0.25
MULTIPLIER_LIMITS = {"shot_appetite": (0.7, 1.5), "foul_rate": (0.5, 2.5), "card_rate": (0.5, 2.0),
                     "stamina_drain": (0.8, 1.3)}
PLAYER_FORM_LIMIT = 5
PLAYER_FORM_ATTRS = ("finishing", "composure", "dribbling")
TEAMS = ("home", "away", "trailing", "leading")
AFTER = ("conceding", "red_card_against", "leading_by_2")
SIGNALS = ("pressures_per_5min_up", "high_regains_up", "shots_per_5min_up", "momentum_share_up",
           "fouls_per_5min_up", "cards_up", "red_card", "player_shots", "player_goals", "counter_share",
           "shots_conceded_per_5min_up")
FIELDS = {"name", "summary", "team", "player", "starts", "ends", "ramp_min", "effects", "answer_key"}
WINDOW_MS = 15 * 60_000            # before / after windows for measured signals


class StorylineError(ValueError):
    pass


@dataclass(frozen=True)
class Storyline:
    name: str
    summary: str
    team: str
    starts: dict
    ends: dict
    ramp_min: float
    effects: dict
    signals: tuple[str, ...]
    detect_within_min: float
    player: int | None = None


def _problems(raw: dict, name: str) -> list[str]:
    p = []
    if unknown := set(raw) - FIELDS:
        p.append(f"unknown fields {sorted(unknown)}")
    if raw.get("name") != name:
        p.append(f"name {raw.get('name')!r} must match the file name {name!r}")
    team = raw.get("team")
    if team not in TEAMS and not (isinstance(team, str) and world.TEAM_ID.match(team)):
        p.append(f"team must be one of {', '.join(TEAMS)} or a club id")
    starts = raw.get("starts") or {}
    if not ({"minute"} <= set(starts) <= {"minute", "jitter_min"} or
            ({"after"} <= set(starts) <= {"after", "jitter_min"} and starts.get("after") in AFTER)):
        p.append(f"starts needs a minute or after: {', '.join(AFTER)}")
    ends = (raw.get("ends") or {}).get("minute")
    if ends != "full_time" and not isinstance(ends, (int, float)):
        p.append("ends needs a minute or full_time")
    effects = raw.get("effects") or {}
    for key, value in effects.items():
        if key == "style":
            for trait, delta in value.items():
                if trait not in world.STYLE_KEYS:
                    p.append(f"unknown style trait {trait}")
                elif abs(delta) > STYLE_LIMIT:
                    p.append(f"style {trait} {delta:+} is beyond ±{STYLE_LIMIT}")
        elif key in MULTIPLIER_LIMITS:
            lo, hi = MULTIPLIER_LIMITS[key]
            if not lo <= value <= hi:
                p.append(f"{key} {value} is outside {lo}-{hi}")
        elif key == "player_form":
            if not 0 < value <= PLAYER_FORM_LIMIT:
                p.append(f"player_form must be 1-{PLAYER_FORM_LIMIT}")
            if not isinstance(raw.get("player"), int) or not world.TEAM_ID.match(str(team)):
                p.append("player_form needs a club id as team and a player shirt number")
        else:
            p.append(f"effect {key} is not allowed")
    key = raw.get("answer_key") or {}
    if bad := [s for s in key.get("signals", []) if s not in SIGNALS]:
        p.append(f"unknown signals {bad}")
    return p


def load(name: str, directory: Path = STORYLINES_DIR) -> Storyline:
    path = directory / f"{name}.yaml"
    if not path.exists():
        raise StorylineError(f"no storyline file {path.name}")
    raw = yaml.safe_load(path.read_text(encoding="utf-8"))
    if problems := _problems(raw, name):
        raise StorylineError(f"{name}: " + "; ".join(problems))
    key = raw.get("answer_key") or {}
    return Storyline(name=name, summary=raw["summary"], team=raw["team"], starts=raw["starts"], ends=raw["ends"],
                     ramp_min=float(raw.get("ramp_min", 0)), effects=raw.get("effects") or {},
                     signals=tuple(key.get("signals", ())), detect_within_min=float(key.get("detect_within_min", 10)),
                     player=raw.get("player"))


def available(directory: Path = STORYLINES_DIR) -> list[str]:
    return sorted(p.stem for p in directory.glob("*.yaml"))


@dataclass
class Running:
    story: Storyline
    planned_minute: float | None
    side: str | None = None
    onset_ms: int | None = None
    end_ms: int | None = None
    form_applied: dict = field(default_factory=dict)


class Director:
    """Runs a match's storylines (storylines.md §1-§2)."""

    def __init__(self, m, names, rng: random.Random):
        names = list(names)
        if len(names) > MAX_PER_MATCH:
            raise StorylineError(f"at most {MAX_PER_MATCH} storylines per match, got {len(names)}")
        self.running = []
        for name in names:
            s = load(name)
            jitter = float(s.starts.get("jitter_min", 0))
            minute = s.starts.get("minute")
            planned = None if minute is None else float(minute) + (rng.uniform(-jitter, jitter) if jitter else 0.0)
            self.running.append(Running(s, planned))
        self._fixed_side = {}
        for r in self.running:
            team = r.story.team
            if team in ("home", "away"):
                self._fixed_side[r.story.name] = team
            elif world.TEAM_ID.match(team):
                side = next((s for s in ("home", "away") if m.team_id[s] == team), None)
                self._fixed_side[r.story.name] = side          # None: that club isn't playing, so it never starts

    # --- timing -------------------------------------------------------------------------------------------------

    def _side_now(self, m, r: Running) -> str | None:
        team = r.story.team
        if r.story.name in self._fixed_side:
            return self._fixed_side[r.story.name]
        diff = m.score["home"] - m.score["away"]
        if diff == 0:
            return None
        if team == "trailing":
            return "away" if diff > 0 else "home"
        return "home" if diff > 0 else "away"              # leading

    def _triggered(self, m, r: Running, side: str) -> bool:
        after = r.story.starts.get("after")
        if after is None:
            return m.minute() >= max(r.planned_minute, 0.0)
        other = m.other(side)
        if after == "conceding":
            return m.score[other] > 0
        if after == "red_card_against":
            return m.reds[side] > 0
        return m.score[side] - m.score[other] >= 2           # leading_by_2

    def update(self, m) -> None:
        for r in self.running:
            if r.onset_ms is None:
                side = self._side_now(m, r)
                if side is not None and self._triggered(m, r, side):
                    r.side, r.onset_ms = side, m.match_ms
            elif r.end_ms is None:
                ends = r.story.ends.get("minute")
                if ends != "full_time" and m.minute() >= float(ends):
                    r.end_ms = m.match_ms
            self._apply_form(m, r)

    def scale(self, m, r: Running) -> float:
        if r.onset_ms is None or r.end_ms is not None:
            return 0.0
        if r.story.ramp_min <= 0:
            return 1.0
        return min(1.0, (m.match_ms - r.onset_ms) / (r.story.ramp_min * 60_000))

    # --- effects the engine reads ---------------------------------------------------------------------------------

    def style_deltas(self, m, side: str) -> dict[str, float]:
        out: dict[str, float] = {}
        for r in self.running:
            if r.side != side:
                continue
            k = self.scale(m, r)
            for trait, delta in r.story.effects.get("style", {}).items():
                out[trait] = out.get(trait, 0.0) + delta * k
        return {t: max(-STYLE_LIMIT, min(STYLE_LIMIT, v)) for t, v in out.items()}

    def multiplier(self, m, side: str, key: str) -> float:
        f = 1.0
        for r in self.running:
            if r.side == side and key in r.story.effects:
                f *= 1 + (r.story.effects[key] - 1) * self.scale(m, r)
        lo, hi = MULTIPLIER_LIMITS[key]
        return max(lo, min(hi, f))

    def _apply_form(self, m, r: Running) -> None:
        form = r.story.effects.get("player_form")
        if not form or r.side is None:
            return
        target = next((b for b in m.on_pitch(r.side) if b.player.shirt == r.story.player), None)
        want = form * self.scale(m, r) if target is not None else 0.0
        for b in m.bodies[r.side]:
            if b.player.shirt != r.story.player:
                continue
            for a in PLAYER_FORM_ATTRS:
                before = r.form_applied.get(a, 0.0) if b is target else 0.0
                b.bonus[a] = b.bonus.get(a, 0.0) - before + (want if b is target else 0.0)
            if b is target:
                r.form_applied = {a: want for a in PLAYER_FORM_ATTRS}

    # --- answer keys (storylines.md §4) ---------------------------------------------------------------------------

    def answer_keys(self, m) -> list[dict]:
        out = []
        for r in self.running:
            s = r.story
            entry = {"name": s.name, "summary": s.summary, "triggered": r.onset_ms is not None,
                     "team_id": m.team_id[r.side] if r.side else None, "onset_ms": r.onset_ms,
                     "full_ms": None if r.onset_ms is None else r.onset_ms + int(s.ramp_min * 60_000),
                     "end_ms": r.end_ms, "signals": list(s.signals), "detect_within_min": s.detect_within_min,
                     "measured": {}}
            if r.onset_ms is not None:
                end = r.end_ms if r.end_ms is not None else m.events[-1]["match_ms"]
                entry["measured"] = {sig: measure(m.events, sig, m.team_id[r.side], m.team_id[m.other(r.side)],
                                                  r.onset_ms, end, s.player) for sig in s.signals}
            out.append(entry)
        return out


# --- measured signals ----------------------------------------------------------------------------------------------

MOMENTUM = {"goal": 5, "on_target": 3, "shot": 1.5, "key_pass": 2, "take_on": 1, "red": 3, "yellow": 1, "sub": 0.5}


def _momentum(e: dict) -> float:
    t = e["type"]
    if t == "Shot":
        return MOMENTUM["goal"] if e["shot_outcome"] == "goal" else \
            MOMENTUM["on_target"] if e["shot_outcome"] == "saved" else MOMENTUM["shot"]
    if t == "Pass" and "key_pass" in e.get("qualifiers", []):
        return MOMENTUM["key_pass"]
    if t == "TakeOn" and e.get("outcome") == "success":
        return MOMENTUM["take_on"]
    if t == "Card":
        return MOMENTUM["red"] if e["card"] in ("red", "second_yellow") else MOMENTUM["yellow"]
    if t == "Substitution":
        return MOMENTUM["sub"]
    return 0.0


def measure(events: list[dict], signal: str, tid: str, opp: str, onset: int, end: int, player: int | None) -> dict:
    """Before and after onset for a signal; whole-match storylines (onset at 0) report after only."""
    after_end = min(end, onset + WINDOW_MS)
    windows = {"after": (onset, after_end)}
    if onset > 0:
        windows["before"] = (max(0, onset - WINDOW_MS), onset)

    def per5(pred, lo, hi):
        n = sum(1 for e in events if lo <= e["match_ms"] < hi and pred(e))
        return round(5 * n / max((hi - lo) / 60_000, 1e-9), 2)

    def in_win(lo, hi):
        return [e for e in events if lo <= e["match_ms"] < hi]

    out: dict = {}
    for k, (lo, hi) in windows.items():
        ev = in_win(lo, hi)
        if signal == "pressures_per_5min_up":
            out[k] = per5(lambda e: e["type"] == "Pressure" and e.get("team_id") == tid, lo, hi)
        elif signal == "high_regains_up":
            out[k] = per5(lambda e: e.get("team_id") == tid and e.get("x", 0) >= 60 and (
                e["type"] in ("BallRecovery", "Interception") or (e["type"] == "Tackle" and e["outcome"] == "success")),
                lo, hi)
        elif signal == "shots_per_5min_up":
            out[k] = per5(lambda e: e["type"] == "Shot" and e["team_id"] == tid, lo, hi)
        elif signal == "shots_conceded_per_5min_up":
            out[k] = per5(lambda e: e["type"] == "Shot" and e["team_id"] == opp, lo, hi)
        elif signal == "fouls_per_5min_up":
            out[k] = per5(lambda e: e["type"] == "Foul" and e["team_id"] == tid, lo, hi)
        elif signal == "cards_up":
            out[k] = per5(lambda e: e["type"] == "Card" and e["team_id"] == tid, lo, hi)
        elif signal == "red_card":
            out[k] = any(e["type"] == "Card" and e["team_id"] == tid and e["card"] in ("red", "second_yellow")
                         for e in ev)
        elif signal == "momentum_share_up":
            mine = sum(_momentum(e) for e in ev if e.get("team_id") == tid)
            both = sum(_momentum(e) for e in ev if e.get("team_id") in (tid, opp))
            out[k] = round(mine / both, 3) if both else None
        elif signal in ("player_shots", "player_goals"):
            pid = f"{tid}-{player:02d}" if player else None
            out[k] = sum(1 for e in ev if e["type"] == "Shot" and e.get("player_id") == pid and
                         (signal == "player_shots" or e["shot_outcome"] == "goal"))
        elif signal == "counter_share":
            shots = [e for e in ev if e["type"] == "Shot" and e["team_id"] == tid]
            out[k] = round(sum(e["situation"] == "counter" for e in shots) / len(shots), 3) if shots else None
    numbers = [out.get(k) for k in ("before", "after")]
    if all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in numbers):
        out["up"] = out["after"] > out["before"]
    return out
