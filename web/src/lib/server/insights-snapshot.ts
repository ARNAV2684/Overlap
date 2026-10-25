// insights-snapshot.ts — Catch-up for one insight audience, read from Cosmos
//
// Purpose: the newest still-live cards for one audience group and the group's cursor, so a viewer who joins
//          mid-match sees the current card at once. On Azure the web app reads this itself; locally the Web PubSub
//          stand-in serves the same answer (infra/local/webpubsub_standin/standin/insights.py, the rule this mirrors)
// Inputs:  ScreenSettings (same database); Cosmos `overlays` (the publisher's deliveries) and `match_state` (playhead)
// Outputs: audienceGroup(), buildInsightsSnapshot() (pure), createInsightsSnapshotReader()
// Spec:    web/specs/realtime.md §4; CONTRACTS.md §10.4, §10.6
//
// Read-only. A card is live in the playhead's period for 300,000 match ms after it shows; recaps count from full time;
// player tags never expire. At most the two newest live cards are returned, in seq order.

import { CosmosClient, type Container } from "@azure/cosmos";
import { DefaultAzureCredential } from "@azure/identity";
import type { ScreenSettings } from "@/lib/server/stream-env";
import { STORAGE_TIMEOUT_MS } from "@/lib/server/screen-store";

export const LIVE_WINDOW_MS = 300_000;
export const MAX_CARDS = 2;

export type Audience = { mode: "casual" | "analyst" | "club" | "player"; lang: string; club?: string | null; player?: string | null };

/** The audience group name the publisher sends to (CONTRACTS.md §10.4). */
export function audienceGroup(matchId: string, a: Audience): string {
  if (a.mode === "club") return `match-${matchId}-club-${a.club}-${a.lang}`;
  if (a.mode === "player") return `match-${matchId}-player-${a.player}-${a.lang}`;
  return `match-${matchId}-${a.mode}-${a.lang}`;
}

type State = { phase?: string; period?: number; source?: { match_ms?: unknown } } | null;
type Doc = Record<string, unknown>;

function live(d: Doc, state: NonNullable<State>): boolean {
  const kind = d.envelope_kind;
  if (kind === "player_tag") return true;
  if (kind === "recap") return state.phase === "full_time";
  if (state.phase === "full_time" || state.period !== d.period) return false;
  const playhead = state.source?.match_ms as number;
  const showAt = d.show_at_ms as number;
  return showAt <= playhead && playhead <= showAt + LIVE_WINDOW_MS;
}

export type SnapshotResult = { status: number; body: Record<string, unknown> };

/** The group's documents and the match state → HTTP status and body (the stand-in's answer, field for field). */
export function buildInsightsSnapshot(matchId: string, group: string, state: State, docs: readonly Doc[]): SnapshotResult {
  if (state === null && docs.length === 0) return { status: 404, body: { error: "unknown_match" } };
  if (state === null || !Number.isInteger(state.source?.match_ms)) return { status: 503, body: { error: "playhead_unknown" } };
  let cursor = 0;
  let rejected = 0;
  const samples: string[] = [];
  const deliveries: Doc[] = [];
  for (const d of docs) {
    if (d.group !== group) continue;
    if (d.kind === "audience_counter") {
      cursor = Math.max(cursor, Number(d.last_seq ?? 0));
      continue;
    }
    if (d.kind !== "audience_delivery" || (d.state !== "pending" && d.state !== "sent")) continue;
    const env = d.envelope as Doc | undefined;
    if (!env || typeof env !== "object" || env.match_id !== matchId || env.seq !== d.seq) {
      rejected += 1;
      if (samples.length < 5) samples.push(String(d.id));
      continue;
    }
    cursor = Math.max(cursor, d.seq as number);
    if (live(d, state)) deliveries.push(d);
  }
  deliveries.sort((a, b) => (a.seq as number) - (b.seq as number));
  return {
    status: 200,
    body: { match_id: matchId, group, cursor, envelopes: deliveries.slice(-MAX_CARDS).map((d) => d.envelope), rejected: { count: rejected, samples } },
  };
}

export type InsightsSnapshotReader = { read(matchId: string, group: string): Promise<SnapshotResult> };

function database(settings: ScreenSettings) {
  const client = settings.key
    ? new CosmosClient({ endpoint: settings.endpoint, key: settings.key, connectionPolicy: { enableEndpointDiscovery: false } })
    : new CosmosClient({ endpoint: settings.endpoint, aadCredentials: new DefaultAzureCredential() });
  return client.database(settings.database);
}

export function createInsightsSnapshotReader(settings: ScreenSettings): InsightsSnapshotReader {
  const db = database(settings);
  const overlays: Container = db.container("overlays");
  const states: Container = db.container("match_state");
  return {
    async read(matchId, group) {
      const signal = AbortSignal.timeout(STORAGE_TIMEOUT_MS);
      let state: State = null;
      try {
        const { resource } = await states.item("state", matchId).read({ abortSignal: signal });
        state = (resource as State) ?? null;
      } catch (error) {
        if ((error as { code?: number }).code !== 404) throw error;
      }
      // `group` is a reserved word in Cosmos SQL, so it is read with the bracket form
      const { resources } = await overlays.items
        .query<Doc>(
          { query: 'SELECT * FROM c WHERE c["group"] = @g', parameters: [{ name: "@g", value: group }] },
          { partitionKey: matchId, maxItemCount: -1, abortSignal: signal },
        )
        .fetchAll();
      return buildInsightsSnapshot(matchId, group, state, resources);
    },
  };
}
