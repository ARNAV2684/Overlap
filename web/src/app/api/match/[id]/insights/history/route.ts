// route.ts — Insights history API
//
// Purpose: every card, player tag and recap one audience group received in a match, for replays
// Inputs:  HTTP GET ?group=match-<id>-<audience>-<lang>; Cosmos `overlays` through overlays-store.ts
// Outputs: JSON { match_id, group, envelopes } (envelopes in seq order), or { error }
// Spec:    web/specs/realtime.md §6

import { isMatchId } from "@/lib/contracts";
import { createOverlaysStore, type OverlaysStore } from "@/lib/server/overlays-store";
import { isViewerGroup } from "@/lib/server/pubsub-token";
import { describeStreamEnvProblems, readScreenEnv } from "@/lib/server/stream-env";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

let current: { key: string; store: OverlaysStore } | null = null;

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMatchId(id)) return fail("bad_match_id", 400);
  const group = new URL(request.url).searchParams.get("group") ?? "";
  if (!group.startsWith(`match-${id}-`) || !isViewerGroup(group)) return fail("bad_group", 400);

  const env = readScreenEnv();
  if (!env.ok) {
    console.warn(describeStreamEnvProblems(env.problems, "Insights history"));
    return fail("insights_unavailable", 503);
  }
  const key = JSON.stringify(env.settings);
  if (current?.key !== key) current = { key, store: createOverlaysStore(env.settings) };

  try {
    const envelopes = await current.store.groupEnvelopes(id, group);
    envelopes.sort((a, b) => ((a as { seq?: number }).seq ?? 0) - ((b as { seq?: number }).seq ?? 0));
    return Response.json({ match_id: id, group, envelopes }, { headers: NO_STORE });
  } catch (error) {
    console.error(`insights history: ${error instanceof Error ? error.message : "unexpected error"}`);
    return fail("storage_error", 502);
  }
}
