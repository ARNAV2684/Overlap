// screen-store.ts — Screen relay store reads (server only)
//
// Purpose: read one match's documents from the screen relay's Cosmos container for the snapshot: its state, its
//          latest positions and its envelopes, but of the stats envelopes only the newest and the newest heavy one
// Inputs:  ScreenSettings from stream-env.ts
// Outputs: createScreenStore(settings): ScreenStore, ScreenStoreError, STORAGE_TIMEOUT_MS
// Spec:    web/specs/realtime.md §3.1; functions/specs/screen-relay.md §4. Plan: plans/active/PLAN_web_realtime-routes.md
//
// Read-only, and every query stays in the match's partition (/match_id). The stats filter is in the queries, so the
// thousands of older panels are never read; snapshot.ts applies the same rule again, so the result is right either
// way. A failure or a call longer than 10 s becomes a ScreenStoreError naming the operation only, never a setting.

import { CosmosClient, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { ScreenDoc } from "@/lib/snapshot";
import type { ScreenSettings } from "@/lib/server/stream-env";

/** How long one Cosmos call may take before the route gives up (realtime.md §3.1). */
export const STORAGE_TIMEOUT_MS = 10_000;

export type ScreenStore = {
  /** The documents the snapshot needs, in no particular order. Empty when the match is unknown. */
  matchDocs(matchId: string): Promise<ScreenDoc[]>;
};

export class ScreenStoreError extends Error {
  constructor(operation: string, options?: { cause?: unknown }) {
    super(`Screen store read failed: ${operation}`, options);
    this.name = "ScreenStoreError";
  }
}

const FIELDS = "c.id, c.type, c.envelope, c.setup";

/** The state, the latest positions and every envelope that is not a stat panel (malformed ones too, to count). */
const DOCS_SQL =
  `SELECT ${FIELDS} FROM c WHERE c.match_id = @match AND (c.type = 'state' OR c.type = 'positions' OR ` +
  "(c.type = 'envelope' AND (NOT IS_DEFINED(c.envelope.kind) OR c.envelope.kind != 'stats')))";

const STATS_SQL =
  `SELECT TOP 1 ${FIELDS} FROM c WHERE c.match_id = @match AND c.type = 'envelope' AND c.envelope.kind = 'stats' ` +
  "ORDER BY c.envelope.match_ms DESC";

const HEAVY_STATS_SQL =
  `SELECT TOP 1 ${FIELDS} FROM c WHERE c.match_id = @match AND c.type = 'envelope' AND c.envelope.kind = 'stats' ` +
  "AND IS_DEFINED(c.envelope.data.heavy) ORDER BY c.envelope.match_ms DESC";

function screenContainer(settings: ScreenSettings): Container {
  const client = settings.key
    ? new CosmosClient({
        endpoint: settings.endpoint,
        key: settings.key,
        // The key is only for the single-region local emulator; endpoint discovery would look for other regions
        connectionPolicy: { enableEndpointDiscovery: false },
      })
    : new CosmosClient({ endpoint: settings.endpoint, aadCredentials: new DefaultAzureCredential() });
  return client.database(settings.database).container(settings.container);
}

/** The reader the snapshot route uses. Creating it makes no network call. */
export function createScreenStore(settings: ScreenSettings): ScreenStore {
  const container = screenContainer(settings);

  async function query(operation: string, sql: string, matchId: string, signal: AbortSignal): Promise<ScreenDoc[]> {
    try {
      const { resources } = await container.items
        .query<ScreenDoc>({ query: sql, parameters: [{ name: "@match", value: matchId }] }, {
          partitionKey: matchId,
          // As few pages as Cosmos allows (it still caps one at 4 MB): the default 100 per page made a full-time
          // match 24 round trips, about 9 s on the local emulator, against 1 s for one page
          maxItemCount: -1,
          abortSignal: signal,
        })
        .fetchAll();
      return resources;
    } catch (error) {
      throw new ScreenStoreError(operation, { cause: error });
    }
  }

  return {
    async matchDocs(matchId) {
      const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS);
      const [docs, stats, heavy] = await Promise.all([
        query("match documents", DOCS_SQL, matchId, signal),
        query("newest stat panel", STATS_SQL, matchId, signal),
        query("newest heavy stat panel", HEAVY_STATS_SQL, matchId, signal),
      ]);
      return [...docs, ...stats, ...heavy];
    },
  };
}
