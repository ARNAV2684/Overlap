// archive-store.ts — Match archive reads (server only)
//
// Purpose: read a stored match the way the archiver wrote it: the match document, events, stat panels and the
//          per-minute tracking files; and, for the match list, the recent match documents and each live match's
//          match_state. Read-only; never writes or creates anything
// Inputs:  ArchiveSettings from archive-env.ts
// Outputs: createArchiveStore(settings): ArchiveStore, createMatchListStore(settings): MatchListStore. Documents come
//          back as stored (Cosmos fields included, frames unsorted and possibly repeated); replay-envelopes.ts and
//          match-list.ts clean, order and check them
// Spec:    web/specs/realtime.md §5.1, §5.3; CONTRACTS.md §4.1, §4.2; archiver/specs/storage.md §1–§3
//
// Every replay call is scoped to one match's partition (/match_id); the match list's one query reads across
// partitions on purpose. All queries are parameterised and give up after 10 s. A failure or timeout becomes an
// ArchiveStoreError, which the routes answer with 502 storage_error. Error messages name the operation only, never a
// setting.

import { gunzipSync } from "node:zlib";
import { CosmosClient, type Container, type SqlParameter } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import { BlobServiceClient, RestError, type ContainerClient } from "@azure/storage-blob";
import type { ArchiveSettings } from "@/lib/server/archive-env";

/** How long one storage call may take before the route gives up (realtime.md §5.1). */
export const STORAGE_TIMEOUT_MS = 10_000;

/** A stored document as Cosmos returns it, system fields included. */
export type StoredDoc = Record<string, unknown>;

/** The `matches` document (CONTRACTS.md §4.1). `setup` and `result` are checked by the caller. */
export type StoredMatch = {
  match_id: string;
  status: unknown;
  setup: unknown;
  result: unknown;
  /** When the document was last written (Cosmos `_ts`), in ms; absent when unknown. */
  updated_ms?: number;
};

/** One tracking file, decompressed. `frames` are in file order, which can repeat a frame after a redelivery. */
export type TrackingFile = {
  frames: unknown[];
  /** Lines that were not JSON. Counted, not thrown, so one bad line doesn't lose the minute. */
  unreadable: number;
};

export type ArchiveStore = {
  /** The match document, or null when the match was never archived. */
  match(matchId: string): Promise<StoredMatch | null>;
  /** The match's `PeriodStart` and `PeriodEnd` events, in `seq` order. */
  periodMarkers(matchId: string): Promise<StoredDoc[]>;
  /** The match's goal shots (`Shot` with `shot_outcome: "goal"`), in `seq` order. */
  goals(matchId: string): Promise<StoredDoc[]>;
  /** Every stored event `seq`, ascending, to find gaps. */
  eventSeqs(matchId: string): Promise<number[]>;
  /** Events of one period with `fromPeriodMs ≤ period_ms < toPeriodMs`, in `seq` order. */
  events(matchId: string, period: number, fromPeriodMs: number, toPeriodMs: number): Promise<StoredDoc[]>;
  /** Stat panels of one period with `fromMatchMs ≤ match_ms < toMatchMs`, in `match_ms` order. */
  panels(matchId: string, period: number, fromMatchMs: number, toMatchMs: number): Promise<StoredDoc[]>;
  /** The tracking file for one minute of one period, or null when there is none. */
  trackingFile(matchId: string, period: number, minute: number): Promise<TrackingFile | null>;
};

/** The reads behind the match list (realtime.md §5.3). */
export type MatchListStore = {
  /** The most recently written `matches` documents, newest first, projected to the list's fields (see below). */
  recentMatches(limit: number): Promise<StoredDoc[]>;
  /** The stats engine's `match_state` document (CONTRACTS.md §4.2), or null when there is none yet. */
  matchState(matchId: string): Promise<StoredDoc | null>;
};

/** Only what the list shows: never the full setup, which carries 36 players per match. */
const RECENT_MATCHES_SQL =
  "SELECT TOP @limit c.match_id, c.status, c.result, c._ts, " +
  "c.setup.teams.home.team_id AS home_id, c.setup.teams.home.name AS home_name, " +
  "c.setup.teams.away.team_id AS away_id, c.setup.teams.away.name AS away_name " +
  "FROM c ORDER BY c._ts DESC";

export class ArchiveStoreError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Match archive read failed: ${operation}`, options);
    this.name = "ArchiveStoreError";
  }
}

/** Blob name of a tracking file, as archiver/tracking_chunks.py writes it: `<match_id>/p<period>/m<MMM>.ndjson.gz`. */
export function trackingBlobName(matchId: string, period: number, minute: number): string {
  return `${matchId}/p${period}/m${String(minute).padStart(3, "0")}.ndjson.gz`;
}

/** Decompresses a tracking file (several gzip members joined together are fine) and parses one frame per line. */
export function parseTrackingFile(gzipped: Uint8Array): TrackingFile {
  const frames: unknown[] = [];
  let unreadable = 0;
  for (const line of gunzipSync(gzipped).toString("utf8").split("\n")) {
    if (!line.trim()) continue;
    try {
      frames.push(JSON.parse(line));
    } catch {
      unreadable++;
    }
  }
  return { frames, unreadable };
}

function blobContainer(settings: ArchiveSettings["blob"]): ContainerClient {
  const service =
    settings.kind === "endpoint"
      ? new BlobServiceClient(settings.endpoint, new DefaultAzureCredential())
      : BlobServiceClient.fromConnectionString(settings.connectionString);
  return service.getContainerClient("tracking");
}

function cosmosContainers(settings: ArchiveSettings["cosmos"]) {
  const client = settings.key
    ? new CosmosClient({
        endpoint: settings.endpoint,
        key: settings.key,
        // The key is only for the single-region local emulator; endpoint discovery would look for other regions
        connectionPolicy: { enableEndpointDiscovery: false },
      })
    : new CosmosClient({ endpoint: settings.endpoint, aadCredentials: new DefaultAzureCredential() });
  const database = client.database(settings.database);
  return {
    matches: database.container("matches"),
    events: database.container("events"),
    stats: database.container("stats"),
    // Written by the stats engine, not the archiver; same database and partition key
    matchState: database.container("match_state"),
  };
}

async function guarded<T>(operation: string, run: (signal: AbortSignal) => Promise<T>): Promise<T> {
  try {
    return await run(AbortSignal.timeout(STORAGE_TIMEOUT_MS));
  } catch (error) {
    throw new ArchiveStoreError(operation, { cause: error });
  }
}

async function query<T>(
  container: Container,
  matchId: string,
  sql: string,
  parameters: SqlParameter[],
  signal: AbortSignal,
): Promise<T[]> {
  const { resources } = await container.items
    .query<T>({ query: sql, parameters: [{ name: "@match", value: matchId }, ...parameters] }, {
      partitionKey: matchId,
      abortSignal: signal,
    })
    .fetchAll();
  return resources;
}

/** The archive reader the replay route uses. Creating it makes no network call. */
export function createArchiveStore(settings: ArchiveSettings): ArchiveStore {
  const cosmos = cosmosContainers(settings.cosmos);
  const tracking = blobContainer(settings.blob);

  return {
    match: (matchId) =>
      guarded("match document", async (signal) => {
        const { resource } = await cosmos.matches.item(matchId, matchId).read<StoredDoc>({ abortSignal: signal });
        if (!resource) return null;
        const ts = resource._ts;
        return { match_id: matchId, status: resource.status, setup: resource.setup, result: resource.result,
          ...(typeof ts === "number" ? { updated_ms: ts * 1000 } : {}) };
      }),

    periodMarkers: (matchId) =>
      guarded("period markers", (signal) =>
        query<StoredDoc>(
          cosmos.events,
          matchId,
          "SELECT * FROM c WHERE c.match_id = @match AND (c.type = 'PeriodStart' OR c.type = 'PeriodEnd') ORDER BY c.seq",
          [],
          signal,
        ),
      ),

    goals: (matchId) =>
      guarded("goals", (signal) =>
        query<StoredDoc>(
          cosmos.events,
          matchId,
          "SELECT * FROM c WHERE c.match_id = @match AND c.type = 'Shot' AND c.shot_outcome = 'goal' ORDER BY c.seq",
          [],
          signal,
        ),
      ),

    eventSeqs: (matchId) =>
      guarded("event seqs", (signal) =>
        query<number>(cosmos.events, matchId, "SELECT VALUE c.seq FROM c WHERE c.match_id = @match ORDER BY c.seq", [], signal),
      ),

    events: (matchId, period, fromPeriodMs, toPeriodMs) =>
      guarded("events", (signal) =>
        query<StoredDoc>(
          cosmos.events,
          matchId,
          "SELECT * FROM c WHERE c.match_id = @match AND c.period = @period " +
            "AND c.period_ms >= @from AND c.period_ms < @to ORDER BY c.seq",
          [
            { name: "@period", value: period },
            { name: "@from", value: fromPeriodMs },
            { name: "@to", value: toPeriodMs },
          ],
          signal,
        ),
      ),

    panels: (matchId, period, fromMatchMs, toMatchMs) =>
      guarded("stat panels", (signal) =>
        query<StoredDoc>(
          cosmos.stats,
          matchId,
          "SELECT * FROM c WHERE c.match_id = @match AND c.period = @period " +
            "AND c.match_ms >= @from AND c.match_ms < @to ORDER BY c.match_ms",
          [
            { name: "@period", value: period },
            { name: "@from", value: fromMatchMs },
            { name: "@to", value: toMatchMs },
          ],
          signal,
        ),
      ),

    trackingFile: (matchId, period, minute) =>
      guarded("tracking file", async (signal) => {
        const blob = tracking.getBlobClient(trackingBlobName(matchId, period, minute));
        try {
          return parseTrackingFile(await blob.downloadToBuffer(0, undefined, { abortSignal: signal }));
        } catch (error) {
          // A minute without frames has no file (realtime.md §5.1)
          if (error instanceof RestError && error.statusCode === 404) return null;
          throw error;
        }
      }),
  };
}

/** The match list's reader. Creating it makes no network call. */
export function createMatchListStore(settings: ArchiveSettings): MatchListStore {
  const cosmos = cosmosContainers(settings.cosmos);

  return {
    recentMatches: (limit) =>
      guarded("match list", async (signal) => {
        const { resources } = await cosmos.matches.items
          .query<StoredDoc>({ query: RECENT_MATCHES_SQL, parameters: [{ name: "@limit", value: limit }] }, {
            abortSignal: signal,
          })
          .fetchAll();
        return resources;
      }),

    matchState: (matchId) =>
      guarded("match state", async (signal) => {
        // A missing document (or a container the stats engine hasn't created yet) reads as 404, not an error
        const { resource } = await cosmos.matchState.item("state", matchId).read<StoredDoc>({ abortSignal: signal });
        return resource ?? null;
      }),
  };
}

/** Seed durable public allocation from the highest archived ID, not only the newest 100 writes. */
export async function highestArchivedMatchId(settings: ArchiveSettings): Promise<string | null> {
  const matches = cosmosContainers(settings.cosmos).matches;
  return guarded("highest match id", async (signal) => {
    const { resources } = await matches.items.query<{ match_id: string }>({
      query: "SELECT TOP 1 c.match_id FROM c WHERE STARTSWITH(c.match_id, @prefix) ORDER BY c.match_id DESC",
      parameters: [{ name: "@prefix", value: "SYN-" }],
    }, { abortSignal: signal }).fetchAll();
    const id = resources[0]?.match_id;
    if (id !== undefined && !/^SYN-\d{4}$/.test(id)) throw new Error("Invalid archive match identity");
    return id ?? null;
  });
}
