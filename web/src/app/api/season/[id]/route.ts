// route.ts — Season league API
//
// Purpose: the league view of one season: table, deserved table, title race, style values, results, player rows
// Inputs:  HTTP GET /api/season/<id>; the season document (src/lib/server/season-store.ts)
// Outputs: JSON LeagueView (src/lib/season.ts), or { error } (codes in web/specs/realtime.md §7)
// Spec:    web/specs/realtime.md §7

import { leagueView, SEASON_ID } from "@/lib/season";
import { seasonFail, SEASON_CACHE } from "@/lib/server/season-route";
import { readSeason } from "@/lib/server/season-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!SEASON_ID.test(id)) return seasonFail("bad_season_id");
  const read = await readSeason(id);
  if (!read.ok) return seasonFail(read.reason === "not_found" ? "season_unavailable" : "season_invalid");
  return Response.json(leagueView(read.doc), { headers: SEASON_CACHE });
}
