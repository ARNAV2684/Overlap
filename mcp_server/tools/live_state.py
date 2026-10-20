"""Tool get_live_state: the stats engine's latest match_state. Spec: mcp_server/specs/tools.md §2b.

"Now", not the moment: `after_moment` says whether the numbers include events after the moment being explained.
Context for the analyst, never narration evidence."""

from __future__ import annotations

from ..schema import Identity
from .base import SIDES, AnalystTool, pick, state_cursor

PANEL_TEAM = ("team_id", "possession_pct", "shots", "shots_on_target", "xg", "passes", "pass_completion_pct",
              "ppda_last_10min", "pressures_per_opp_pass_last_10min", "momentum_share_last_10min_pct",
              "press_height_last_10min_m")
TOTALS = ("team_id", "goals", "shots", "shots_on_target", "xg", "big_chances", "possession_pct", "passes",
          "pass_completion_pct", "progressive_passes", "key_passes", "tackles", "interceptions", "high_regains",
          "pressures", "ppda", "pressures_per_opp_pass", "press_height_m", "momentum_share_match_pct", "fouls",
          "yellow_cards", "red_cards", "corners", "low_sample")


class LiveStateTool(AnalystTool):
    name = "get_live_state"
    description = ("Latest match numbers from the stats engine (score, phase, last panel, team totals). It may be "
                   "after the moment (see after_moment). Context only: never cite these numbers.")
    request_model = Identity

    async def answer(self, requested, moment):
        state = await self.session.doc("match_state", "state")
        panel_teams = state["panel"]["teams"]
        data = {"phase": state["phase"], "period": state["period"], "clock": state["clock"],
                "score": {s: state["score"][s] for s in SIDES},
                "panel": {s: pick(panel_teams[s], PANEL_TEAM) for s in SIDES},
                "totals": {s: pick(state["totals"][s], TOTALS) for s in SIDES}}
        cursor = state_cursor(state)
        return self.ok(requested, cursor, cursor.event_seq > moment.source.event_seq,
                       self.session.provenance("match_state", "state"), data)
