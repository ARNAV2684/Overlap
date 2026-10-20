"""Tool get_player_context: one player's match numbers from match_state. Spec: mcp_server/specs/tools.md §2b.

For player-focus lines and player tags (speed, distance). The player must belong to one of the match's teams."""

from __future__ import annotations

from ..data_access import SourceFailure
from ..schema import PlayerRequest
from .base import AnalystTool, OutOfScope, pick, state_cursor

PLAYER = ("name", "pos", "side", "minutes", "goals", "shots", "xg", "assists", "key_passes", "passes",
          "pass_completion_pct", "progressive_passes", "take_ons", "tackles", "interceptions", "pressures",
          "distance_km", "top_speed_kmh", "sprints", "sprint_m", "high_intensity_m")


class PlayerContextTool(AnalystTool):
    name = "get_player_context"
    description = ("One player's match numbers so far (minutes, goals, shots, xG, passes, distance, top speed, "
                   "sprints). Latest state, may be after the moment. Context only: never cite these numbers.")
    request_model = PlayerRequest

    async def answer(self, requested, moment):
        teams = {moment.context.teams.home.team_id, moment.context.teams.away.team_id}
        if requested.player_id[:3] not in teams:
            raise OutOfScope
        state = await self.session.doc("match_state", "state")
        player = state["players"].get(requested.player_id)
        if not isinstance(player, dict):
            raise SourceFailure("not_found")
        cursor = state_cursor(state)
        data = {"player_id": requested.player_id, **pick(player, PLAYER)}
        return self.ok(requested, cursor, cursor.event_seq > moment.source.event_seq,
                       self.session.provenance("match_state", "state"), data)
