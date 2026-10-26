// jobs-store.ts — Reader for the agents' job records
//
// Purpose: read one moment's `insight_job` document (the record the seven agents share, agents/specs/workflow.md §2)
//          for the "How this card was made" drawer
// Inputs:  ScreenSettings from stream-env.ts (same database; container `moments`); a match id and a moment id
// Outputs: createJobsStore(): { job(matchId, momentId) }; JobsStoreError
// Spec:    web/specs/realtime.md §5.4
//
// Read-only, one point read by id and partition key (`job:<moment id>`, partition `match_id`). The web app's identity
// has Cosmos DB Built-in Data Reader on the database (infra/modules/cosmos.bicep).

import { CosmosClient, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { ScreenSettings } from "@/lib/server/stream-env";
import { STORAGE_TIMEOUT_MS } from "@/lib/server/screen-store";

export const MOMENTS_CONTAINER = "moments";

export class JobsStoreError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Job record read failed", options);
    this.name = "JobsStoreError";
  }
}

export type JobsStore = { job(matchId: string, momentId: string): Promise<unknown | null> };

function container(settings: ScreenSettings): Container {
  const client = settings.key
    ? new CosmosClient({ endpoint: settings.endpoint, key: settings.key, connectionPolicy: { enableEndpointDiscovery: false } })
    : new CosmosClient({ endpoint: settings.endpoint, aadCredentials: new DefaultAzureCredential() });
  return client.database(settings.database).container(MOMENTS_CONTAINER);
}

export function createJobsStore(settings: ScreenSettings): JobsStore {
  const c = container(settings);
  return {
    async job(matchId, momentId) {
      try {
        const { resource, statusCode } = await c
          .item(`job:${momentId}`, matchId)
          .read({ abortSignal: AbortSignal.timeout(STORAGE_TIMEOUT_MS) });
        return statusCode === 404 || resource === undefined ? null : resource;
      } catch (error) {
        if ((error as { code?: number }).code === 404) return null;
        throw new JobsStoreError({ cause: error });
      }
    },
  };
}
