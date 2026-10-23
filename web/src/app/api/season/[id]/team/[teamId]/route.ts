// route.ts — Season club API
//
// Purpose: one club's season: table line, designed against measured style, pressing, chances, goal timing, squad
// Inputs:  HTTP GET /api/season/<id>/team/<teamId>; the season document (src/lib/server/season-store.ts)
// Outputs: JSON TeamView (src/lib/season.ts), or { error } (codes in web/specs/realtime.md §7)
// Spec:    web/specs/realtime.md §7
//
// The reference clubs answer not_found: they stay in the table only (stats/specs/season.md §6).

import { SEASON_ID, TEAM_ID, teamView } from "@/lib/season";
import { seasonFail, SEASON_CACHE } from "@/lib/server/season-route";
import { readSeason } from "@/lib/server/season-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; teamId: string }> }) {
  const { id, teamId } = await params;
  if (!SEASON_ID.test(id)) return seasonFail("bad_season_id");
  if (!TEAM_ID.test(teamId)) return seasonFail("bad_team_id");
  const read = await readSeason(id);
  if (!read.ok) return seasonFail(read.reason === "not_found" ? "season_unavailable" : "season_invalid");
  const view = teamView(read.doc, teamId);
  return view ? Response.json(view, { headers: SEASON_CACHE }) : seasonFail("not_found");
}
