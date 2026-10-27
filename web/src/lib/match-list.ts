// match-list.ts — Match list
//
// Purpose: turn the archive's recent `matches` documents and the stats engine's `match_state` documents into the
//          match picker's list, and define the list's shape, which the browser checks again
// Inputs:  projected `matches` rows (archive-store.ts createMatchListStore), match_state documents by match id
// Outputs: parseMatchRows(), liveMatchIds(), buildMatchList(), parseShowcaseIds(), matchListSchema, MatchListItem,
//          MATCH_LIST_LIMIT
// Spec:    web/specs/realtime.md §5.3; CONTRACTS.md §4.1, §4.2
//
// Pure: no I/O. Shared by the route (server) and api.ts (browser), so it imports nothing server-only. Stored rows are
// read loosely (Cosmos adds fields); what the route sends is strict, like every other shape the browser checks.

import { z } from "zod";
import { isMatchId, statusDataSchema } from "@/lib/contracts";

/** How many of the most recently written matches the list holds. */
export const MATCH_LIST_LIMIT = 50;

const matchIdSchema = z.string().refine(isMatchId, "match id looks like SYN-0042");
/** The same rule as contracts.ts (CONTRACTS.md §1). */
const teamIdSchema = z.string().regex(/^[A-Z]{3}$/, "team id is 3 capital letters");
const phaseSchema = statusDataSchema.shape.phase;
const scoreSchema = statusDataSchema.shape.score;
/** Display only, as everywhere (CONTRACTS.md §1.2). */
const clockSchema = z.string().min(1);

const teamSchema = z.strictObject({ team_id: teamIdSchema, name: z.string().min(1) });

/** One match as the route sends it (realtime.md §5.3). */
export const matchListItemSchema = z.strictObject({
  match_id: matchIdSchema,
  status: z.enum(["live", "finished"]),
  home: teamSchema,
  away: teamSchema,
  /** Live: from match_state, all three null until the stats engine has written one. Finished: full_time, the result. */
  phase: phaseSchema.nullable(),
  score: scoreSchema.nullable(),
  clock: clockSchema.nullable(),
  /** Finished matches only: one of the replays chosen to show first (OVERLAP_SHOWCASE_MATCH_IDS). Absent otherwise. */
  showcase: z.literal(true).optional(),
});
export type MatchListItem = z.infer<typeof matchListItemSchema>;

export const matchListSchema = z.strictObject({ matches: z.array(matchListItemSchema) });
export type MatchList = z.infer<typeof matchListSchema>;

/** A `matches` row as the store's query projects it. A finished match must carry its result. */
const storedRowSchema = z
  .object({
    match_id: matchIdSchema,
    status: z.enum(["live", "finished"]),
    home_id: teamIdSchema,
    home_name: z.string().min(1),
    away_id: teamIdSchema,
    away_name: z.string().min(1),
    result: z.object({ score: scoreSchema }).optional(),
    _ts: z.number(),
  })
  .refine((row) => row.status !== "finished" || row.result !== undefined, "a finished match has a result");
type StoredRow = z.infer<typeof storedRowSchema>;

/** The parts of a match_state document the list shows. */
const matchStateSchema = z.object({ phase: phaseSchema, score: scoreSchema, clock: clockSchema });

export type ParsedRows = {
  rows: StoredRow[];
  /** Ids of rows left out; "(no id)" when the row has no usable id. Logged, never sent. */
  leftOut: string[];
};

/** Checks the stored rows. Rows without a setup, with another status or without a result when finished are left out. */
export function parseMatchRows(raw: readonly unknown[]): ParsedRows {
  const rows: StoredRow[] = [];
  const leftOut: string[] = [];
  for (const value of raw) {
    const parsed = storedRowSchema.safeParse(value);
    if (parsed.success) {
      rows.push(parsed.data);
    } else {
      const id = (value as { match_id?: unknown } | null)?.match_id;
      leftOut.push(isMatchId(id) ? id : "(no id)");
    }
  }
  return { rows, leftOut };
}

/** The ids whose match_state the route should read: the live ones. */
export const liveMatchIds = (rows: readonly StoredRow[]): string[] =>
  rows.filter((row) => row.status === "live").map((row) => row.match_id);

/** The match ids in OVERLAP_SHOWCASE_MATCH_IDS ("SYN-3012, SYN-3013"); anything that is not a match id is ignored. */
export function parseShowcaseIds(raw: string | undefined): Set<string> {
  return new Set((raw ?? "").split(",").map((s) => s.trim()).filter(isMatchId));
}

/**
 * The list: live matches first, then finished ones, each newest first. `states` holds the match_state documents of
 * live matches; one that is missing or fails its check leaves that match's phase, score and clock null. A finished
 * match in `showcase` is marked `showcase: true`; the order does not change.
 */
export function buildMatchList(
  rows: readonly StoredRow[],
  states: ReadonlyMap<string, unknown>,
  showcase: ReadonlySet<string> = new Set(),
): MatchList {
  const ordered = [...rows].sort((a, b) => {
    if (a.status !== b.status) return a.status === "live" ? -1 : 1;
    return b._ts - a._ts;
  });
  return {
    matches: ordered.map((row): MatchListItem => {
      const teams = {
        home: { team_id: row.home_id, name: row.home_name },
        away: { team_id: row.away_id, name: row.away_name },
      };
      if (row.status === "finished") {
        // parseMatchRows guarantees the result
        const item: MatchListItem = { match_id: row.match_id, status: "finished", ...teams, phase: "full_time", score: row.result!.score, clock: null };
        return showcase.has(row.match_id) ? { ...item, showcase: true } : item;
      }
      const state = matchStateSchema.safeParse(states.get(row.match_id));
      return state.success
        ? { match_id: row.match_id, status: "live", ...teams, phase: state.data.phase, score: state.data.score, clock: state.data.clock }
        : { match_id: row.match_id, status: "live", ...teams, phase: null, score: null, clock: null };
    }),
  };
}

/** Omit stale live candidates without changing archived status or fabricating results.
 * Cosmos _ts is seconds. Recent setup gets a grace period before the first stats snapshot.
 */
export const LIVE_FRESHNESS_MS = 180_000;
export function currentMatchRows(rows: readonly StoredRow[], states: ReadonlyMap<string, unknown>, now = Date.now()) {
  return rows.filter((row) => {
    if (row.status === "finished") return true;
    const state = states.get(row.match_id) as { _ts?: unknown; phase?: unknown } | undefined;
    if (state?.phase === "full_time") return false; // wait for the archive's real final result
    const updated = typeof state?._ts === "number" ? state._ts : row._ts;
    const age = now - updated * 1000;
    return Number.isFinite(age) && age >= -60_000 && age <= LIVE_FRESHNESS_MS;
  });
}
