"""Tool get_team_pressing: the latest archived heavy panel at or before the moment.
Spec: mcp_server/specs/tools.md §2b.

Heavy blocks are written at every whole match minute (CONTRACTS.md §7.4) and archived in Cosmos `stats` as
`stats-<match_ms, 9 digits>`. The tool point-reads the minute at or before the moment and, if that panel is missing,
the minute before; it never reads past the moment. Same period only."""

from __future__ import annotations

from ..data_access import SourceFailure
from ..schema import AsOf, TeamRequest
from .base import AnalystTool, panel_id, pick

MINUTE_MS = 60_000
PRESS_FIELDS = ("ppda_last_10min", "pressures_per_opp_pass_last_10min", "press_height_last_10min_m")


async def heavy_panel(session, moment) -> tuple[dict, str]:
    """The latest archived panel with a heavy block at or before the moment, in the moment's period."""
    minute = (moment.evidence.match_ms // MINUTE_MS) * MINUTE_MS
    for ms in (minute, minute - MINUTE_MS):
        if ms < 0:
            break
        doc_id = panel_id(ms)
        try:
            panel = await session.doc("stats", doc_id)
        except SourceFailure as exc:
            if exc.reason == "not_found":
                continue
            raise
        if panel.get("period") != moment.evidence.period:
            raise SourceFailure("not_found")
        if isinstance(panel.get("heavy"), dict):
            return panel, doc_id
    raise SourceFailure("not_found")


def cursor_of(panel: dict) -> AsOf:
    return AsOf(event_seq=panel["source_seq"], match_ms=panel["match_ms"])


class TeamPressingTool(AnalystTool):
    name = "get_team_pressing"
    description = ("A team's pressing up to the moment: where on the pitch it pressed (grid) and its pressing rates "
                   "over the last 10 minutes, from the latest minute panel at or before the moment. Context only.")
    request_model = TeamRequest

    async def answer(self, requested, moment):
        side = self.session.side_of(moment, requested.team_id)
        panel, doc_id = await heavy_panel(self.session, moment)
        grid = panel["heavy"]["pressing_grid"][side]
        if not (isinstance(grid, list) and all(isinstance(r, list) for r in grid)):
            raise SourceFailure("context_mismatch")
        data = {"team_id": requested.team_id, "clock": panel["clock"], "pressing_grid": grid,
                **pick(panel["teams"][side], PRESS_FIELDS)}
        return self.ok(requested, cursor_of(panel), False, self.session.provenance("stats", doc_id), data)

