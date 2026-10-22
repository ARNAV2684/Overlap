// route.ts — Snapshot API
//
// Purpose: return the current match state for late joiners and reconnects (CONTRACTS.md §7.3), read from the screen
//          relay's Cosmos container
// Inputs:  HTTP GET; Cosmos `screen` through src/lib/server/screen-store.ts (settings: stream-env.ts)
// Outputs: JSON { match_id, setup, status, envelopes, rejected }, or { error } (codes in web/specs/realtime.md §3.1)
// Spec:    web/specs/realtime.md §3.1; CONTRACTS.md §7.3. Plan: vedant-frontend/plans/active/PLAN_web_realtime-routes.md
//
// Replaces the stream server's snapshot route, so the browser only ever calls this app. Of the stat panels only the
// newest and the newest heavy one are sent (snapshot.ts). Settings never appear in a response or a log line; storage
// errors are logged by operation only.

import { isMatchId } from "@/lib/contracts";
import { buildSnapshot } from "@/lib/snapshot";
import { describeStreamEnvProblems, readScreenEnv } from "@/lib/server/stream-env";
import { createScreenStore, ScreenStoreError, type ScreenStore } from "@/lib/server/screen-store";

let current: { settingsKey: string; store: ScreenStore } | null = null;

type ErrorCode =
  | "bad_match_id"
  | "unknown_match"
  | "setup_pending"
  | "snapshot_unavailable"
  | "storage_error"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_match_id: 400,
  unknown_match: 404,
  setup_pending: 503,
  snapshot_unavailable: 503,
  storage_error: 502,
  internal_error: 500,
};

const NO_STORE = { "Cache-Control": "no-store" };

const fail = (code: ErrorCode) => Response.json({ error: code }, { status: STATUS[code], headers: NO_STORE });

/** The reader for the current settings, or null (and one log line naming the problems) without them. */
function screenStore(): ScreenStore | null {
  const env = readScreenEnv();
  if (!env.ok) {
    console.warn(describeStreamEnvProblems(env.problems, "The snapshot"));
    return null;
  }
  // Kept in memory only, to notice changed settings; never logged
  const settingsKey = JSON.stringify(env.settings);
  if (current?.settingsKey !== settingsKey) current = { settingsKey, store: createScreenStore(env.settings) };
  return current.store;
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = performance.now();
  const { id } = await params;
  if (!isMatchId(id)) return fail("bad_match_id");

  const store = screenStore();
  if (!store) return fail("snapshot_unavailable");

  try {
    const result = buildSnapshot(id, await store.matchDocs(id));
    if (!result.ok) return fail(result.error);
    const { envelopes, rejected } = result.body;
    console.info(
      `snapshot ${id}: ${envelopes.length} envelopes, ${rejected.count} rejected, ` +
        `${Math.round(performance.now() - started)} ms`,
    );
    return Response.json(result.body, { headers: NO_STORE });
  } catch (error) {
    if (error instanceof ScreenStoreError) {
      console.error(`snapshot ${id}: ${error.message}`);
      return fail("storage_error");
    }
    // The error itself may quote a request or a setting, so only its type is logged
    console.error(`snapshot ${id}: unexpected ${error instanceof Error ? error.name : typeof error}`);
    return fail("internal_error");
  }
}
