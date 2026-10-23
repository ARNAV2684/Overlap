// route.ts — Season player API
//
// Purpose: one player's scout card: attributes, role, per-90 output, percentiles, maps, peers and the group median
// Inputs:  HTTP GET /api/season/<id>/player/<playerId>; the season document (src/lib/server/season-store.ts)
// Outputs: JSON PlayerView (src/lib/season.ts), or { error } (codes in web/specs/realtime.md §7)
// Spec:    web/specs/realtime.md §7
//
// Players of the reference clubs are not in the document (stats/specs/season.md §6), so they answer not_found.

import { PLAYER_ID, playerView, SEASON_ID } from "@/lib/season";
import { seasonFail, SEASON_CACHE } from "@/lib/server/season-route";
import { readSeason } from "@/lib/server/season-store";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; playerId: string }> }) {
  const { id, playerId } = await params;
  if (!SEASON_ID.test(id)) return seasonFail("bad_season_id");
  if (!PLAYER_ID.test(playerId)) return seasonFail("bad_player_id");
  const read = await readSeason(id);
  if (!read.ok) return seasonFail(read.reason === "not_found" ? "season_unavailable" : "season_invalid");
  const view = playerView(read.doc, playerId);
  return view ? Response.json(view, { headers: SEASON_CACHE }) : seasonFail("not_found");
}
