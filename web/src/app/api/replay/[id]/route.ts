// route.ts — Replay API
//
// Purpose: serve a finished, archived match for replay: a manifest, or one minute of §7 envelopes (?chunk=<index>)
// Inputs:  HTTP GET; the match archive through src/lib/server/archive-store.ts (settings: archive-env.ts)
// Outputs: JSON: the manifest, a chunk, or { error } (codes in web/specs/realtime.md §5.1)
// Spec:    web/specs/realtime.md §5.1. Plan: vedant-frontend/plans/active/PLAN_web_replay.md
//
// Stored overlays are not served yet: nothing produces them (CONTRACTS.md §10). Settings and keys never appear in a
// response or a log line; storage errors are logged by operation only.

import { isMatchId } from "@/lib/contracts";
import {
  buildReplayChunk,
  buildReplayIndex,
  panelRange,
  type IndexError,
  type ReplayIndex,
} from "@/lib/replay-envelopes";
import { describeArchiveEnvProblems, readArchiveEnv } from "@/lib/server/archive-env";
import { ArchiveStoreError, createArchiveStore, type ArchiveStore } from "@/lib/server/archive-store";

/** Finished matches never change, so their index is kept in memory: at most this many, least recently used out. */
const INDEX_CACHE_LIMIT = 20;
const indexes = new Map<string, ReplayIndex>();
let current: { settingsKey: string; store: ArchiveStore } | null = null;

type ErrorCode =
  | "bad_match_id"
  | "bad_chunk"
  | "not_found"
  | IndexError
  | "replay_unavailable"
  | "storage_error"
  | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_match_id: 400,
  bad_chunk: 400,
  not_found: 404,
  not_ready: 503,
  not_finished: 409,
  archive_invalid: 500,
  replay_unavailable: 503,
  storage_error: 502,
  internal_error: 500,
};

const fail = (code: ErrorCode) =>
  Response.json({ error: code }, { status: STATUS[code], headers: { "Cache-Control": "no-store" } });

const ok = (body: unknown) => Response.json(body, { headers: { "Cache-Control": "private, max-age=3600" } });

/** The archive reader for the current settings, or null (and one log line naming the problems) without them. */
function archiveStore(): ArchiveStore | null {
  const env = readArchiveEnv();
  if (!env.ok) {
    console.warn(describeArchiveEnvProblems(env.problems));
    return null;
  }
  // Kept in memory only, to notice changed settings; never logged
  const settingsKey = JSON.stringify(env.settings);
  if (current?.settingsKey !== settingsKey) {
    current = { settingsKey, store: createArchiveStore(env.settings) };
    indexes.clear();
  }
  return current.store;
}

async function loadIndex(store: ArchiveStore, matchId: string): Promise<ReplayIndex | ErrorCode> {
  const cached = indexes.get(matchId);
  if (cached) {
    indexes.delete(matchId);
    indexes.set(matchId, cached);
    return cached;
  }

  const match = await store.match(matchId);
  if (!match) return "not_found";
  // Answer a match that isn't ready or finished before reading any of its events
  if (match.setup === null || match.setup === undefined) return "not_ready";
  if (match.status !== "finished") return "not_finished";

  const [markers, goals, seqs] = await Promise.all([
    store.periodMarkers(matchId),
    store.goals(matchId),
    store.eventSeqs(matchId),
  ]);
  const result = buildReplayIndex(match, markers, goals, seqs);
  if (!result.ok) {
    if (result.detail) console.error(`replay ${matchId}: ${result.error}: ${result.detail}`);
    return result.error;
  }
  indexes.set(matchId, result.index);
  if (indexes.size > INDEX_CACHE_LIMIT) indexes.delete(indexes.keys().next().value as string);
  return result.index;
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const started = performance.now();
  const { id } = await params;
  if (!isMatchId(id)) return fail("bad_match_id");
  const chunkParam = new URL(request.url).searchParams.get("chunk");
  if (chunkParam !== null && !/^\d+$/.test(chunkParam)) return fail("bad_chunk");

  const store = archiveStore();
  if (!store) return fail("replay_unavailable");

  try {
    const index = await loadIndex(store, id);
    if (typeof index === "string") return fail(index);

    if (chunkParam === null) {
      console.info(`replay ${id} manifest: ${index.manifest.chunks.length} chunks, ${Math.round(performance.now() - started)} ms`);
      return ok(index.manifest);
    }

    const chunk = index.manifest.chunks[Number(chunkParam)];
    if (!chunk) return fail("bad_chunk");
    const [panelsFrom, panelsTo] = panelRange(index.manifest, chunk);
    const [events, panels, tracking] = await Promise.all([
      store.events(id, chunk.period, chunk.minute * 60_000, (chunk.minute + 1) * 60_000),
      store.panels(id, chunk.period, panelsFrom, panelsTo),
      store.trackingFile(id, chunk.period, chunk.minute),
    ]);
    const body = buildReplayChunk(index, chunk, { events, panels, tracking });
    const frames = body.envelopes.reduce((n, e) => n + (e.kind === "positions" ? e.data.frames.length : 0), 0);
    console.info(
      `replay ${id} chunk ${chunk.index}: ${events.length} events, ${frames} frames, ${panels.length} panels, ` +
        `${body.rejected.count} rejected, ${Math.round(performance.now() - started)} ms`,
    );
    return ok(body);
  } catch (error) {
    if (error instanceof ArchiveStoreError) {
      console.error(`replay ${id}: ${error.message}`);
      return fail("storage_error");
    }
    // The error itself may quote a request or a setting, so only its type is logged
    console.error(`replay ${id}: unexpected ${error instanceof Error ? error.name : typeof error}`);
    return fail("internal_error");
  }
}
