// route.ts — Insights snapshot API
//
// Purpose: catch-up for one insight audience (CONTRACTS.md §10.4/§10.6): the newest live cards and the group cursor,
//          so a viewer who joins mid-match sees the current card at once
// Inputs:  HTTP GET ?mode=casual|analyst|club|player&lang=en|es|hi|fr(&club=TEAM|&player=TEAM-NN)
// Outputs: the stand-in's JSON { match_id, group, cursor, envelopes, rejected } unchanged, or { error }
// Spec:    web/specs/realtime.md §4
//
// Locally the Web PubSub stand-in serves this endpoint (it reads Cosmos `overlays`), so the route forwards to it.
// On Azure there is no stand-in; until the overlays read is built here the route answers 501 and the screen shows
// live cards only.

import { isMatchId } from "@/lib/contracts";
import { describeStreamEnvProblems, readPubSubEnv } from "@/lib/server/stream-env";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => Response.json({ error }, { status, headers: NO_STORE });

const MODES = new Set(["casual", "analyst", "club", "player"]);
const LANGS = new Set(["en", "es", "hi", "fr"]);

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isMatchId(id)) return fail("bad_match_id", 400);

  const query = new URL(request.url).searchParams;
  const mode = query.get("mode") ?? "";
  const lang = query.get("lang") ?? "";
  const club = query.get("club");
  const player = query.get("player");
  if (!MODES.has(mode) || !LANGS.has(lang)) return fail("bad_audience", 400);
  if (mode === "club" && !/^[A-Z]{3}$/.test(club ?? "")) return fail("bad_audience", 400);
  if (mode === "player" && !/^[A-Z]{3}-\d{2}$/.test(player ?? "")) return fail("bad_audience", 400);

  const env = readPubSubEnv();
  if (!env.ok) {
    console.warn(describeStreamEnvProblems(env.problems, "Insights snapshot"));
    return fail("insights_unavailable", 503);
  }
  if (!env.settings.local) return fail("not_implemented", 501);

  const forward = new URLSearchParams({ mode, lang });
  if (mode === "club" && club) forward.set("club", club);
  if (mode === "player" && player) forward.set("player", player);
  const url = `${env.settings.endpoint.replace(/\/$/, "")}/api/match/${id}/insights/snapshot?${forward}`;
  try {
    const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(7000) });
    const body = await response.text();
    return new Response(body, {
      status: response.status,
      headers: { ...NO_STORE, "Content-Type": response.headers.get("Content-Type") ?? "application/json" },
    });
  } catch (error) {
    console.error(`insights snapshot: stand-in unreachable (${error instanceof Error ? error.name : typeof error})`);
    return fail("insights_unavailable", 503);
  }
}
