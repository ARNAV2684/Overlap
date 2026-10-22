// replay-client.ts — Replay API client (browser)
//
// Purpose: fetch a replay's manifest and its chunks from this app's own route, /api/replay/<id>. Every response is
//          checked; every failure becomes a ReplayError
// Inputs:  a match id, a chunk index, an optional AbortSignal
// Outputs: createReplayClient(), replayClient, ReplayError
// Spec:    web/specs/realtime.md §5.1 (shapes, error codes), §5.2 (10 s timeout; retries are the player's job)
//
// One attempt per call. The route is same-origin, so the stream server's CORS limits (api.ts) don't apply here.

import { z } from "zod";
import { matchSetupSchema, parseEnvelope, describeRejection, type ParsedEnvelope } from "@/lib/contracts";
import type { ReplayManifest, Rejected } from "@/lib/replay-envelopes";

/** How long one request may take (realtime.md §5.2). */
export const REPLAY_TIMEOUT_MS = 10_000;
const MAX_SAMPLES = 5;

export type ReplayErrorKind =
  | "network"
  | "timeout"
  /** The caller cancelled. Not a failure worth showing. */
  | "aborted"
  /** The route answered an error status; `code` is its `error` field when it sent one. */
  | "http"
  /** A 200 whose body isn't the expected shape. */
  | "invalid-response";

export class ReplayError extends Error {
  readonly kind: ReplayErrorKind;
  readonly status?: number;
  /** The route's error code (realtime.md §5.1), for example "not_found". */
  readonly code?: string;

  constructor(kind: ReplayErrorKind, message: string, details: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, { cause: details.cause });
    this.name = "ReplayError";
    this.kind = kind;
    this.status = details.status;
    this.code = details.code;
  }
}

const ms = z.number().int().nonnegative();
const manifestSchema = z.object({
  match_id: z.string(),
  status: z.literal("finished"),
  setup: matchSetupSchema,
  result: z.object({
    score: z.object({ home: ms, away: ms }),
    events: ms,
  }),
  periods: z.array(z.object({ period: z.number().int(), start_ms: ms, end_ms: ms, end_period_ms: ms })).min(1),
  chunks: z
    .array(z.object({ index: ms, period: z.number().int(), minute: ms, from_ms: ms, to_ms: ms }))
    .min(1),
  duration_ms: ms,
  gaps: z.array(z.number().int()),
});

const chunkSchema = z.object({
  match_id: z.string(),
  chunk: ms,
  envelopes: z.array(z.unknown()),
  rejected: z.object({ count: ms, samples: z.array(z.string()) }),
});

/** A chunk after the browser's own check: envelopes that fail are counted with the route's rejections. */
export type ReplayChunkData = { chunk: number; envelopes: ParsedEnvelope[]; rejected: Rejected };

export type ReplayClient = {
  manifest(matchId: string, signal?: AbortSignal): Promise<ReplayManifest>;
  chunk(matchId: string, index: number, signal?: AbortSignal): Promise<ReplayChunkData>;
};

export function createReplayClient(
  options: { baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
): ReplayClient {
  const { baseUrl = "", timeoutMs = REPLAY_TIMEOUT_MS } = options;
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function get<T>(what: string, path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let response: Response;
    let body: unknown;
    try {
      response = await doFetch(`${baseUrl}${path}`, { signal: combined });
      body = await response.json().catch(() => null);
    } catch (error) {
      if (signal?.aborted) throw new ReplayError("aborted", `${what}: cancelled`, { cause: error });
      if (timeout.aborted) throw new ReplayError("timeout", `${what}: no answer in time`, { cause: error });
      throw new ReplayError("network", `${what}: cannot reach the replay route`, { cause: error });
    }
    if (!response.ok) {
      const code = body && typeof body === "object" && "error" in body ? String(body.error) : undefined;
      throw new ReplayError("http", `${what}: answered ${response.status}${code ? ` ${code}` : ""}`, {
        status: response.status,
        code,
      });
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      throw new ReplayError("invalid-response", `${what}: unexpected response (${first?.path.join(".") || "root"})`, {
        cause: parsed.error,
      });
    }
    return parsed.data;
  }

  const base = (matchId: string) => `/api/replay/${encodeURIComponent(matchId)}`;

  return {
    async manifest(matchId, signal) {
      const manifest = await get(`replay of ${matchId}`, base(matchId), manifestSchema, signal);
      if (manifest.match_id !== matchId) {
        throw new ReplayError("invalid-response", `replay of ${matchId}: the route sent ${manifest.match_id}`);
      }
      return manifest as ReplayManifest;
    },

    async chunk(matchId, index, signal) {
      const raw = await get(`chunk ${index} of ${matchId}`, `${base(matchId)}?chunk=${index}`, chunkSchema, signal);
      if (raw.match_id !== matchId || raw.chunk !== index) {
        throw new ReplayError("invalid-response", `chunk ${index} of ${matchId}: the route sent another chunk`);
      }
      const rejected: Rejected = { count: raw.rejected.count, samples: raw.rejected.samples.slice(0, MAX_SAMPLES) };
      const envelopes: ParsedEnvelope[] = [];
      for (const value of raw.envelopes) {
        const result = parseEnvelope(value);
        if (result.ok) envelopes.push(result.envelope);
        else {
          rejected.count++;
          if (rejected.samples.length < MAX_SAMPLES) rejected.samples.push(describeRejection(result));
        }
      }
      return { chunk: index, envelopes, rejected };
    },
  };
}

/** The client for this app's own replay route. */
export const replayClient = createReplayClient();
