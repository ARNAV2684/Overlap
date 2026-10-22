// pubsub-token.ts — Web PubSub client tokens (server only)
//
// Purpose: check the groups a viewer asks for, and make a short-lived, receive-only client URL for them
// Inputs:  PubSubSettings from stream-env.ts; the `groups` query parameter
// Outputs: parseGroups(), createTokenIssuer(settings): TokenIssuer, PubSubError, TOKEN_LIFETIME_MINUTES, MAX_GROUPS
// Spec:    web/specs/realtime.md §1.1. Plan: plans/active/PLAN_web_realtime-routes.md
//
// The token may join and leave only the requested groups and may not send; the relay stays the only sender on
// match-<id> (CONTRACTS.md §7.1). The local stand-in accepts any token, so locally it is signed with a fixed,
// non-secret key, the same rule as functions/relay_store.py. Anywhere else the service makes it, signed in with
// DefaultAzureCredential. Neither the token nor the URL is ever logged.

import { DefaultAzureCredential } from "@azure/identity";
import { AzureKeyCredential, WebPubSubServiceClient } from "@azure/web-pubsub";
import { isMatchId } from "@/lib/contracts";
import type { PubSubSettings } from "@/lib/server/stream-env";

/** How long a token can be used to open a connection. socket.ts negotiates again on every reconnect. */
export const TOKEN_LIFETIME_MINUTES = 10;

/** The most groups one connection may ask for. The live screen asks for one. */
export const MAX_GROUPS = 4;

/** How long the service may take to make a token (Azure only; locally nothing is called). */
export const PUBSUB_TIMEOUT_MS = 10_000;

/** Not a secret: the stand-in checks no signature (functions/relay_store.py uses the same text). */
const LOCAL_KEY = "local-development-only-not-a-real-key";

/** What the browser receives: the shape the Web PubSub SDK returns. */
export type NegotiateBody = { baseUrl: string; url: string; token: string };

export type TokenIssuer = {
  /** A client URL that can join only `groups`. Fails with a PubSubError. */
  issue(groups: string[]): Promise<NegotiateBody>;
};

export class PubSubError extends Error {
  constructor(options?: { cause?: unknown }) {
    super("Web PubSub token request failed", options);
    this.name = "PubSubError";
  }
}

/** "match-SYN-0042,match-SYN-0043" → the groups, or null when any is not a match group or there are too many. */
export function parseGroups(param: string | null): string[] | null {
  if (param === null) return null;
  const groups = [...new Set(param.split(","))];
  if (groups.length === 0 || groups.length > MAX_GROUPS) return null;
  const valid = groups.every((group) => group.startsWith("match-") && isMatchId(group.slice("match-".length)));
  return valid ? groups : null;
}

/** The issuer for one set of settings. Creating it makes no network call. */
export function createTokenIssuer(settings: PubSubSettings): TokenIssuer {
  const credential = settings.local ? new AzureKeyCredential(LOCAL_KEY) : new DefaultAzureCredential();
  const client = new WebPubSubServiceClient(settings.endpoint, credential, settings.hub);

  return {
    async issue(groups) {
      try {
        const { baseUrl, url, token } = await client.getClientAccessToken({
          roles: groups.map((group) => `webpubsub.joinLeaveGroup.${group}`),
          groups,
          expirationTimeInMinutes: TOKEN_LIFETIME_MINUTES,
          abortSignal: AbortSignal.timeout(PUBSUB_TIMEOUT_MS),
        });
        return { baseUrl, url, token };
      } catch (error) {
        throw new PubSubError({ cause: error });
      }
    },
  };
}
