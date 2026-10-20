"""Tool get_pass_network: a team's pass network from the latest archived heavy panel at or before the moment.
Spec: mcp_server/specs/tools.md §2b."""

from __future__ import annotations

from ..schema import TeamRequest
from .base import AnalystTool
from .pressing import cursor_of, heavy_panel

MAX_LINKS = 40


class PassNetworkTool(AnalystTool):
    name = "get_pass_network"
    description = ("A team's pass network up to the moment (most frequent passing links between players), from the "
                   "latest minute panel at or before the moment. Context only.")
    request_model = TeamRequest

    async def answer(self, requested, moment):
        side = self.session.side_of(moment, requested.team_id)
        panel, doc_id = await heavy_panel(self.session, moment)
        network = panel["heavy"]["pass_network"][side]
        links = sorted((link for link in network.get("links", []) if isinstance(link, dict)),
                       key=lambda link: -link.get("count", 0))[:MAX_LINKS]
        data = {"team_id": requested.team_id, "clock": panel["clock"],
                "links": [{"from": link["from"], "to": link["to"], "count": link["count"]} for link in links]}
        return self.ok(requested, cursor_of(panel), False, self.session.provenance("stats", doc_id), data)
