// route.ts — Negotiate API
//
// Purpose: return a short-lived, receive-only Web PubSub client URL for the viewer's match group
// Inputs:  HTTP GET ?groups=match-<id>[,…]; Web PubSub settings through src/lib/server/stream-env.ts
// Outputs: JSON { baseUrl, url, token }, or { error } (codes in web/specs/realtime.md §1.1)
// Spec:    web/specs/realtime.md §1.1. Plan: plans/active/PLAN_web_realtime-routes.md
//
// Replaces the stream server's GET /negotiate, so the browser only ever calls this app. The token and the URL carry
// the right to connect: neither is logged. Settings never appear in a response or a log line.

import { describeStreamEnvProblems, readPubSubEnv } from "@/lib/server/stream-env";
import { createTokenIssuer, parseGroups, PubSubError, type TokenIssuer } from "@/lib/server/pubsub-token";

let current: { settingsKey: string; issuer: TokenIssuer } | null = null;

type ErrorCode = "bad_groups" | "negotiate_unavailable" | "pubsub_error" | "internal_error";

const STATUS: Record<ErrorCode, number> = {
  bad_groups: 400,
  negotiate_unavailable: 503,
  pubsub_error: 502,
  internal_error: 500,
};

const NO_STORE = { "Cache-Control": "no-store" };

const fail = (code: ErrorCode) => Response.json({ error: code }, { status: STATUS[code], headers: NO_STORE });

/** The issuer for the current settings, or null (and one log line naming the problems) without them. */
function tokenIssuer(): TokenIssuer | null {
  const env = readPubSubEnv();
  if (!env.ok) {
    console.warn(describeStreamEnvProblems(env.problems, "Negotiate"));
    return null;
  }
  // Kept in memory only, to notice changed settings; never logged
  const settingsKey = JSON.stringify(env.settings);
  if (current?.settingsKey !== settingsKey) current = { settingsKey, issuer: createTokenIssuer(env.settings) };
  return current.issuer;
}

export async function GET(request: Request) {
  const groups = parseGroups(new URL(request.url).searchParams.get("groups"));
  if (!groups) return fail("bad_groups");

  const issuer = tokenIssuer();
  if (!issuer) return fail("negotiate_unavailable");

  try {
    return Response.json(await issuer.issue(groups), { headers: NO_STORE });
  } catch (error) {
    if (error instanceof PubSubError) {
      console.error(`negotiate: ${error.message}`);
      return fail("pubsub_error");
    }
    // The error itself may quote a request or a setting, so only its type is logged
    console.error(`negotiate: unexpected ${error instanceof Error ? error.name : typeof error}`);
    return fail("internal_error");
  }
}
