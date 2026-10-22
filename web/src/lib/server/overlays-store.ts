// overlays-store.ts — Reader for the insights publisher's deliveries
//
// Purpose: read every envelope the insights publisher numbered for one audience group of one match, so a replay
//          can show the same AI cards, player tags and recap at the moments they went out live
// Inputs:  ScreenSettings from stream-env.ts (same database; container `overlays`); a match id and a group
// Outputs: createOverlaysStore(): { groupEnvelopes(matchId, group) }
// Spec:    web/specs/realtime.md §4; CONTRACTS.md §10.4 (the `overlays` container)
//
// Read-only. Deliveries that expired before they were numbered carry no envelope and are skipped.

import { CosmosClient, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { ScreenSettings } from "@/lib/server/stream-env";
import { STORAGE_TIMEOUT_MS } from "@/lib/server/screen-store";

export const OVERLAYS_CONTAINER = "overlays";

export class OverlaysStoreError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Overlays read failed", options);
    this.name = "OverlaysStoreError";
  }
}

// `group` is a reserved word in Cosmos SQL, so it is read with the bracket form
const SQL =
  "SELECT c.envelope FROM c WHERE c.match_id = @match AND c.kind = 'audience_delivery' AND c[\"group\"] = @group " +
  "AND IS_DEFINED(c.envelope)";

export type OverlaysStore = { groupEnvelopes(matchId: string, group: string): Promise<unknown[]> };

function container(settings: ScreenSettings): Container {
  const client = settings.key
    ? new CosmosClient({ endpoint: settings.endpoint, key: settings.key, connectionPolicy: { enableEndpointDiscovery: false } })
    : new CosmosClient({ endpoint: settings.endpoint, aadCredentials: new DefaultAzureCredential() });
  return client.database(settings.database).container(OVERLAYS_CONTAINER);
}

export function createOverlaysStore(settings: ScreenSettings): OverlaysStore {
  const c = container(settings);
  return {
    async groupEnvelopes(matchId, group) {
      try {
        const { resources } = await c.items
          .query<{ envelope: unknown }>(
            { query: SQL, parameters: [{ name: "@match", value: matchId }, { name: "@group", value: group }] },
            { partitionKey: matchId, maxItemCount: -1, abortSignal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) },
          )
          .fetchAll();
        return resources.map((r) => r.envelope);
      } catch (error) {
        throw new OverlaysStoreError({ cause: error });
      }
    },
  };
}
