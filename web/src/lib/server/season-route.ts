// season-route.ts — Season route answers
//
// Purpose: the shared error answers and cache header of the /api/season routes
// Inputs:  an error code
// Outputs: a JSON Response
// Spec:    web/specs/realtime.md §7

export type SeasonErrorCode =
  | "bad_season_id"
  | "bad_team_id"
  | "bad_player_id"
  | "not_found"
  | "season_unavailable"
  | "season_invalid";

const STATUS: Record<SeasonErrorCode, number> = {
  bad_season_id: 400,
  bad_team_id: 400,
  bad_player_id: 400,
  not_found: 404,
  season_unavailable: 503,
  season_invalid: 500,
};

/** A finished season doesn't change, so browsers and proxies may keep it for five minutes. */
export const SEASON_CACHE = { "Cache-Control": "public, max-age=300" };

export const seasonFail = (code: SeasonErrorCode) =>
  Response.json({ error: code }, { status: STATUS[code], headers: { "Cache-Control": "no-store" } });
