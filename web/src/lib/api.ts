// api.ts — Stream API client
//
// Purpose: the HTTP calls the viewer makes to the stream server (the local mock for now): negotiate, snapshot, match
//          list. Every response is validated; every failure becomes an ApiError
// Inputs:  the stream base URL (src/lib/env.ts), match ids, group names
// Outputs: negotiate(), getSnapshot(), listMatches(), createApiClient(), ApiError
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 4.2. Response shapes are PROVISIONAL (from the mock: mock/README.md)
//
// No custom request headers on purpose: the mock allows any origin but answers no CORS preflight, and a header such
// as Cache-Control would trigger one and block the call from the browser. The snapshot response carries no cache
// validators, so the browser does not reuse it.
//
// Real Azure: negotiate must go through this app's own route (src/app/api/negotiate/route.ts, managed identity,
// server side). negotiate() is the one place to switch. Never log the negotiate token.

import axios, { isAxiosError, isCancel, type AxiosInstance } from "axios";
import { z } from "zod";
import { env } from "@/lib/env";
import {
  matchSetupSchema,
  parseEnvelope,
  statusDataSchema,
  describeRejection,
  type MatchSetup,
  type ParsedEnvelope,
} from "@/lib/contracts";

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

function toApiError(error: unknown, what: string): ApiError {
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
    return new ApiError("network", `${what}: cannot reach the stream server`, undefined, { cause: error });
  }
  return new ApiError("network", `${what}: ${error instanceof Error ? error.message : "unknown error"}`, undefined, {
    cause: error,
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Response shapes (PROVISIONAL: they describe the mock's endpoints, not CONTRACTS.md)
// ---------------------------------------------------------------------------------------------------------------

/** `GET /negotiate`: what the Web PubSub SDK returns. `url` is the WebSocket address to open; `token` is a secret. */
export const negotiateResponseSchema = z.strictObject({
  baseUrl: z.string().min(1),
  url: z.string().min(1),
  token: z.string().min(1),
});
export type NegotiateResponse = z.infer<typeof negotiateResponseSchema>;

/** `GET /mock/matches`: one row per match the mock is playing. `phase`, `score` and `clock` are null before the first message. */
export const matchSummarySchema = z.strictObject({
  match_id: z.string().regex(/^SYN-\d{4}$/),
  group: z.string().min(1),
  phase: statusDataSchema.shape.phase.nullable(),
  score: statusDataSchema.shape.score.nullable(),
  clock: z.string().nullable(),
});
export type MatchSummary = z.infer<typeof matchSummarySchema>;

/** `GET /api/match/{id}/snapshot` as sent. The envelopes are checked one by one afterwards, so one bad message does not hide the rest. */
const rawSnapshotSchema = z.strictObject({
  match_id: z.string().regex(/^SYN-\d{4}$/),
  setup: matchSetupSchema,
  status: z.unknown(),
  envelopes: z.array(z.unknown()),
});

/** A snapshot after validation: only envelopes that passed, plus a count of those that did not. */
export type Snapshot = {
  matchId: string;
  setup: MatchSetup;
  /** The newest status envelope, or null before the match has started. */
  status: ParsedEnvelope | null;
  /** Every envelope that passed validation, in the order the server sent them (seq order). */
  envelopes: ParsedEnvelope[];
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
  /** The matches the server is playing, with phase, score and clock. */
  listMatches(signal?: AbortSignal): Promise<MatchSummary[]>;
};

export function createApiClient(baseURL: string, timeoutMs = 7000): ApiClient {
  const http: AxiosInstance = axios.create({
    baseURL,
    timeout: timeoutMs,
    // Makes a timeout report ETIMEDOUT instead of the generic ECONNABORTED
    transitional: { clarifyTimeoutError: true },
  });

  async function get<T>(what: string, url: string, schema: z.ZodType<T>, signal?: AbortSignal, params?: object) {
    let data: unknown;
    try {
      ({ data } = await http.get<unknown>(url, { signal, params }));
    } catch (error) {
      throw toApiError(error, what);
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
  }

  return {
    negotiate: (groups, signal) =>
      get("negotiate", "/negotiate", negotiateResponseSchema, signal, { groups: groups.join(",") }),

    listMatches: (signal) => get("match list", "/mock/matches", z.array(matchSummarySchema), signal),

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
      const accept = (value: unknown): ParsedEnvelope | null => {
        const result = parseEnvelope(value);
        if (result.ok) return result.envelope;
        rejected.count++;
        if (rejected.samples.length < MAX_REJECTION_SAMPLES) rejected.samples.push(describeRejection(result));
        return null;
      };
      for (const value of raw.envelopes) {
        const envelope = accept(value);
        if (envelope) envelopes.push(envelope);
      }
      return {
        matchId,
        setup: raw.setup,
        status: raw.status == null ? null : accept(raw.status),
        envelopes,
        rejected,
      };
    },
  };
}

/** The client for the configured stream server. */
export const api = createApiClient(env.streamBaseUrl);
export const { negotiate, getSnapshot, listMatches } = api;
