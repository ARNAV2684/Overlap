// archive-store.ts — Match archive reads (server only)
//
// Purpose: read a stored match the way the archiver wrote it: the match document, events, stat panels and the
//          per-minute tracking files. Read-only; never writes or creates anything
// Inputs:  ArchiveSettings from archive-env.ts
// Outputs: createArchiveStore(settings): ArchiveStore. Documents come back as stored (Cosmos fields included,
//          frames unsorted and possibly repeated); replay-envelopes.ts cleans, orders and checks them
// Spec:    web/specs/realtime.md §5.1; CONTRACTS.md §4.1; archiver/specs/storage.md §1–§3
//
// Every call is scoped to one match's partition (/match_id), uses parameterised queries, and gives up after 10 s.
// A failure or timeout becomes an ArchiveStoreError, which the route answers with 502 storage_error. Error messages
// name the operation only, never a setting.

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
        return { match_id: matchId, status: resource.status, setup: resource.setup, result: resource.result };
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
