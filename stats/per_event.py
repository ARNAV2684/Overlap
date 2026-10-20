# per_event.py — Per-event metrics
#
# Purpose: compute the metrics attached to each event, and each player's speed, distance and sprints from frames
# Inputs:  events (with the pass a shot names as its key pass); tracking frames
# Outputs: per-event metrics; per-player motion totals
# Spec:    stats/specs/metrics.md §1–§3

from __future__ import annotations

from dataclasses import dataclass

import pass_difficulty
import xg

SPRINT_KMH = 25.2                # CALIBRATION.md sprint threshold
SPRINT_MIN_FRAMES = 5            # 1 s at 5 Hz
HIGH_INTENSITY_KMH = 19.8


def annotate(event: dict, key_pass: dict | None = None) -> dict:
    """The numbers this event carries (empty for most types). Never changes the event itself."""
    kind = event["type"]
    if kind == "Shot":
        value = xg.shot_xg(event, key_pass)
        return {"xg": value, "distance_m": xg.goal_distance_m(event["x"], event["y"]),
                "big_chance": event.get("situation") != "penalty" and value >= xg.BIG_CHANCE_XG,
                "assist_type": xg.assist_type(key_pass)}
    if kind == "Pass" and "end_x" in event:
        d = pass_difficulty.difficulty(event)
        complete = event.get("outcome") == "success"
        return {"length_m": pass_difficulty.length_m(event), "difficulty": d,
                "progressive": pass_difficulty.is_progressive(event),
                "difficult_completion": complete and d >= pass_difficulty.DIFFICULT}
    return {}


@dataclass
class Motion:
    """One player's running totals from tracking frames (metrics.md §3)."""
    top_speed_kmh: float = 0.0
    distance_m: float = 0.0
    sprints: int = 0
    sprint_m: float = 0.0
    high_intensity_m: float = 0.0
    _fast_frames: int = 0
    _last_dist: float | None = None
    _run_m: float = 0.0

    def add(self, speed_kmh: float, dist_m: float) -> bool:
        """Adds one frame; returns True when this frame completes a new sprint."""
        step = 0.0 if self._last_dist is None else max(dist_m - self._last_dist, 0.0)
        self._last_dist = dist_m
        self.distance_m = dist_m
        self.top_speed_kmh = max(self.top_speed_kmh, speed_kmh)
        if speed_kmh >= HIGH_INTENSITY_KMH:
            self.high_intensity_m += step
        new_sprint = False
        if speed_kmh >= SPRINT_KMH:
            self._fast_frames += 1
            self._run_m += step
            if self._fast_frames == SPRINT_MIN_FRAMES:
                self.sprints += 1
                self.sprint_m += self._run_m
                new_sprint = True
            elif self._fast_frames > SPRINT_MIN_FRAMES:
                self.sprint_m += step
        else:
            self._fast_frames = 0
            self._run_m = 0.0
        return new_sprint
