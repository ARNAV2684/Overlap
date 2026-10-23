// route.ts — Match list API
//
// Purpose: list the archived matches, live and finished, for the match picker: clubs, status, phase, score and clock
// Inputs:  HTTP GET; Cosmos `matches` and `match_state` through src/lib/server/archive-store.ts (settings:
//          archive-env.ts, the same as the replay route)
// Outputs: JSON { matches: [...] }, or { error } (codes in web/specs/realtime.md §5.3)
// Spec:    web/specs/realtime.md §5.3. Plan: vedant-frontend/plans/active/PLAN_web_match-list.md
//
// Replaces the mock's GET /mock/matches. The picker asks every 5 s, so only failures and left-out documents are
// logged. Settings and keys never appear in a response or a log line; storage errors are logged by operation only.

import { connection } from "next/server";
import { buildMatchList, liveMatchIds, MATCH_LIST_LIMIT, parseMatchRows } from "@/lib/match-list";
import { describeArchiveEnvProblems, readArchiveEnv } from "@/lib/server/archive-env";
import { ArchiveStoreError, createMatchListStore, type MatchListStore } from "@/lib/server/archive-store";

let current: { settingsKey: string; store: MatchListStore } | null = null;

type ErrorCode = "matches_unavailable" | "storage_error" | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  matches_unavailable: 503,
  storage_error: 502,
  internal_error: 500,
};

const NO_STORE = { "Cache-Control": "no-store" };

const fail = (code: ErrorCode) => Response.json({ error: code }, { status: STATUS[code], headers: NO_STORE });

/** The reader for the current settings, or null (and one log line naming the problems) without them. */
function matchListStore(): MatchListStore | null {
  const env = readArchiveEnv();
  if (!env.ok) {
    console.warn(describeArchiveEnvProblems(env.problems, "The match list"));
    return null;
  }
  // Kept in memory only, to notice changed settings; never logged
  const settingsKey = JSON.stringify(env.settings);
  if (current?.settingsKey !== settingsKey) current = { settingsKey, store: createMatchListStore(env.settings) };
  return current.store;
}

export async function GET() {
  // Nothing here reads the request, so with Cache Components the build would prerender the first answer (often 503,
  // with no settings at build time). This keeps the route at request time
  await connection();
  const store = matchListStore();
  if (!store) return fail("matches_unavailable");

  try {
    const { rows, leftOut } = parseMatchRows(await store.recentMatches(MATCH_LIST_LIMIT));
    if (leftOut.length > 0) console.warn(`match list: left out ${leftOut.length} documents (${leftOut.join(", ")})`);

    // A live match without numbers is still worth listing, so one failed read only blanks its own row
    const ids = liveMatchIds(rows);
    const reads = await Promise.allSettled(ids.map((id) => store.matchState(id)));
    const states = new Map<string, unknown>();
    reads.forEach((read, i) => {
      if (read.status === "fulfilled") states.set(ids[i], read.value);
      else console.error(`match list ${ids[i]}: match state read failed`);
    });

    return Response.json(buildMatchList(rows, states), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ArchiveStoreError) {
      console.error(`match list: ${error.message}`);
      return fail("storage_error");
    }
    // The error itself may quote a request or a setting, so only its type is logged
    console.error(`match list: unexpected ${error instanceof Error ? error.name : typeof error}`);
    return fail("internal_error");
  }
}
