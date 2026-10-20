"""Tool compare_periods: a team's panel numbers at the moment and 10 match minutes earlier.
Spec: mcp_server/specs/tools.md §2b.

Both are archived light panels (`stats-<match_ms>`, one per match second). The earlier panel must be in the same
period; otherwise the comparison is unavailable rather than mixing halves. Values only; no differences are
computed here."""

from __future__ import annotations

from ..data_access import SourceFailure
from ..schema import TeamRequest
from .base import AnalystTool, panel_id, pick
from .live_state import PANEL_TEAM
from .pressing import cursor_of

GAP_MS = 600_000


class ComparePeriodsTool(AnalystTool):
    name = "compare_periods"
    description = ("A team's panel numbers at the moment and 10 match minutes earlier in the same half "
                   "(possession, shots, xG, passing, pressing, momentum). Context only.")
    request_model = TeamRequest

    async def answer(self, requested, moment):
        side = self.session.side_of(moment, requested.team_id)
        now_ms = (moment.evidence.match_ms // 1000) * 1000
        then_ms = now_ms - GAP_MS
        if then_ms < 0:
            raise SourceFailure("not_found")
        now = await self.session.doc("stats", panel_id(now_ms))
        then = await self.session.doc("stats", panel_id(then_ms))
        if now.get("period") != moment.evidence.period or then.get("period") != moment.evidence.period:
            raise SourceFailure("not_found")
        data = {"team_id": requested.team_id, "minutes_between": GAP_MS // 60_000,
                "now": {"clock": now["clock"], **pick(now["teams"][side], PANEL_TEAM)},
                "earlier": {"clock": then["clock"], **pick(then["teams"][side], PANEL_TEAM)}}
        return self.ok(requested, cursor_of(now), False, self.session.provenance("stats", panel_id(now_ms)), data)
