// api.ts — Stream API client
//
// Purpose: the HTTP calls the viewer makes, all to this app's own routes: negotiate, snapshot and the match list.
//          Every response is validated; every failure becomes an ApiError
// Inputs:  match ids, group names
// Outputs: negotiate(), getSnapshot(), listMatches(), createApiClient(), createMatchListClient(), ApiError
// Spec:    web/specs/realtime.md §1.1 (negotiate), §3.1 (snapshot), §5.3 (match list)
//
// Same origin: the base URL is empty in the browser; tests pass a fake server's address. No custom request headers,
// so nothing here depends on CORS. The routes answer with Cache-Control: no-store. Never log the negotiate token.

import axios, { isAxiosError, isCancel, type AxiosInstance } from "axios";
import { z } from "zod";
import {
  matchSetupSchema,
  parseEnvelope,
  describeRejection,
  type MatchSetup,
  type ParsedEnvelope,
} from "@/lib/contracts";
import { matchListSchema, type MatchListItem } from "@/lib/match-list";

// ---------------------------------------------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------------------------------------------

export type ApiErrorKind =
  /** The server could not be reached (not running, wrong URL, blocked by CORS). */
  | "network"
  | "timeout"
  /** The caller cancelled with an AbortSignal. Not a failure worth showing. */
  | "aborted"
  /** The server answered with an error status, for example 404 for an unknown match. */
  | "http"
  /** The server answered 200 but the body is not what we expect (contract drift). */
  | "invalid-response";

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number, options?: ErrorOptions) {
    super(message, options);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function toApiError(error: unknown, what: string, server: string): ApiError {
  if (error instanceof ApiError) return error;
  if (isCancel(error)) return new ApiError("aborted", `${what}: cancelled`, undefined, { cause: error });
  if (isAxiosError(error)) {
    if (error.response) {
      return new ApiError("http", `${what}: server answered ${error.response.status}`, error.response.status, {
        cause: error,
      });
    }
    if (error.code === "ETIMEDOUT" || error.code === "ECONNABORTED") {
      return new ApiError("timeout", `${what}: no answer in time`, undefined, { cause: error });
    }
    return new ApiError("network", `${what}: cannot reach ${server}`, undefined, { cause: error });
  }
  return new ApiError("network", `${what}: ${error instanceof Error ? error.message : "unknown error"}`, undefined, {
    cause: error,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Response shapes (negotiate: realtime.md §1.1; snapshot: CONTRACTS.md §7.3; the match list's shape lives in
// match-list.ts, shared with its route)
// ---------------------------------------------------------------------------------------------------------------

/** `GET /api/negotiate`: what the Web PubSub SDK returns. `url` is the WebSocket address to open; `token` is a secret. */
export const negotiateResponseSchema = z.strictObject({
  baseUrl: z.string().min(1),
  url: z.string().min(1),
  token: z.string().min(1),
});
export type NegotiateResponse = z.infer<typeof negotiateResponseSchema>;

/**
 * `GET /api/match/{id}/snapshot` as sent (CONTRACTS.md §7.3). The envelopes are checked one by one afterwards, so one
 * bad message does not hide the rest. `rejected` counts envelopes the server itself left out; the route always sends
 * it, so it is optional only for older servers.
 */
const rawSnapshotSchema = z.strictObject({
  match_id: z.string().regex(/^SYN-\d{4}$/),
  setup: matchSetupSchema,
  status: z.unknown(),
  envelopes: z.array(z.unknown()),
  rejected: z
    .strictObject({ count: z.number().int().nonnegative(), samples: z.array(z.string()) })
    .optional(),
});

/** A snapshot after validation: only envelopes that passed, plus a count of those that did not. */
export type Snapshot = {
  matchId: string;
  setup: MatchSetup;
  /** The newest status envelope, or null before the match has started. */
  status: ParsedEnvelope | null;
  /** Every envelope that passed validation, in the order the server sent them (seq order). */
  envelopes: ParsedEnvelope[];
  /** Envelopes left out, by the server or by this client's validation. */
  rejected: {
    count: number;
    /** The first few reasons, for the console. */
    samples: string[];
  };
};

const MAX_REJECTION_SAMPLES = 3;

// ---------------------------------------------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------------------------------------------

export type ApiClient = {
  /** Asks for a WebSocket address that receives the given groups, for example `match-SYN-9001`. */
  negotiate(groups: string[], signal?: AbortSignal): Promise<NegotiateResponse>;
  /** Everything needed to catch up on a match: the setup, the current status and every envelope so far. */
  getSnapshot(matchId: string, signal?: AbortSignal): Promise<Snapshot>;
};

export type MatchListClient = {
  /** The archived matches, live first, with clubs, phase, score and clock (realtime.md §5.3). */
  listMatches(signal?: AbortSignal): Promise<MatchListItem[]>;
};

type Get = <T>(what: string, url: string, schema: z.ZodType<T>, signal?: AbortSignal, params?: object) => Promise<T>;

/** A validating GET against one server. `server` names it in network errors. */
function createGet(baseURL: string, timeoutMs: number, server: string): Get {
  const http: AxiosInstance = axios.create({
    baseURL,
    timeout: timeoutMs,
    // Makes a timeout report ETIMEDOUT instead of the generic ECONNABORTED
    transitional: { clarifyTimeoutError: true },
  });

  return async function get<T>(what: string, url: string, schema: z.ZodType<T>, signal?: AbortSignal, params?: object) {
    let data: unknown;
    try {
      ({ data } = await http.get<unknown>(url, { signal, params }));
    } catch (error) {
      throw toApiError(error, what, server);
    }
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ApiError(
        "invalid-response",
        `${what}: unexpected response (${first.path.join(".") || "root"}: ${first.message})`,
        undefined,
        { cause: parsed.error },
      );
    }
    return parsed.data;
  };
}

/** Negotiate and snapshot from this app's own routes. `baseURL` is empty in the browser (same origin). */
export function createApiClient(baseURL = "", timeoutMs = 7000): ApiClient {
  const get = createGet(baseURL, timeoutMs, "this app's stream routes");

  return {
    negotiate: (groups, signal) =>
      get("negotiate", "/api/negotiate", negotiateResponseSchema, signal, { groups: groups.join(",") }),

    async getSnapshot(matchId, signal) {
      const raw = await get(
        `snapshot of ${matchId}`,
        `/api/match/${encodeURIComponent(matchId)}/snapshot`,
        rawSnapshotSchema,
        signal,
      );
      if (raw.match_id !== matchId) {
        throw new ApiError("invalid-response", `snapshot of ${matchId}: the server sent ${raw.match_id}`);
      }

      const envelopes: ParsedEnvelope[] = [];
      const rejected = { count: 0, samples: [] as string[] };
      const addSample = (sample: string) => {
        if (rejected.samples.length < MAX_REJECTION_SAMPLES) rejected.samples.push(sample);
      };
      const accept = (value: unknown): ParsedEnvelope | null => {
        const result = parseEnvelope(value);
        if (result.ok) return result.envelope;
        rejected.count++;
        addSample(describeRejection(result));
        return null;
      };
      for (const value of raw.envelopes) {
        const envelope = accept(value);
        if (envelope) envelopes.push(envelope);
      }
      const status = raw.status == null ? null : accept(raw.status);
      // The server's rejections are contract drift too, so they count towards the number shown on screen
      if (raw.rejected) {
        rejected.count += raw.rejected.count;
        for (const sample of raw.rejected.samples) addSample(`Rejected by the server: ${sample}`);
      }
      return { matchId, setup: raw.setup, status, envelopes, rejected };
    },
  };
}

/** The match list from this app's own route. `baseURL` is empty in the browser (same origin). */
export function createMatchListClient(baseURL = "", timeoutMs = 7000): MatchListClient {
  const get = createGet(baseURL, timeoutMs, "this app's match list");
  return {
    listMatches: async (signal) => (await get("match list", "/api/matches", matchListSchema, signal)).matches,
  };
}

/** The clients the app uses: same origin. */
export const api = createApiClient();
export const { negotiate, getSnapshot } = api;
export const { listMatches } = createMatchListClient();
