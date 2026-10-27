// snapshot.ts — Catch-up snapshot builder
//
// Purpose: turn the screen relay's stored documents for one match into the CONTRACTS.md §7.3 snapshot: the setup,
//          the newest status, and the envelopes in seq order, with the ones that fail the envelope check counted
// Inputs:  a match id; its documents from Cosmos `screen` (functions/specs/screen-relay.md §4), in any order
// Outputs: buildSnapshot(), envelopeProblem(), SnapshotBody, MAX_REJECTION_SAMPLES
// Spec:    web/specs/realtime.md §3.1; CONTRACTS.md §7.3
//
// A port of infra/local/webpubsub_standin/standin/snapshot.py (same checks, same error codes), plus one rule: of the
// stats envelopes only the newest panel and the newest panel with a heavy block are kept. Panels are cumulative and
// the store keeps only those two, so the rest would be thousands of envelopes the browser throws away. Pure: no I/O.

/** A stored document as Cosmos returns it. */
export type ScreenDoc = Record<string, unknown>;

/** One §7 envelope that passed the shape check. Its `data` is checked again in the browser. */
export type StoredEnvelope = {
  seq: number;
  kind: string;
  match_id: string;
  match_ms: number;
  clock: string;
  data: unknown;
};

export type SnapshotBody = {
  match_id: string;
  setup: unknown;
  status: StoredEnvelope;
  envelopes: StoredEnvelope[];
  rejected: { count: number; samples: string[] };
};

export type SnapshotError = "unknown_match" | "setup_pending";

export type SnapshotResult = { ok: true; body: SnapshotBody } | { ok: false; error: SnapshotError };

export const MAX_REJECTION_SAMPLES = 5;

const ENVELOPE_FIELDS = ["clock", "data", "kind", "match_id", "match_ms", "seq"];
const KINDS = new Set(["event", "positions", "stats", "overlay", "player_tag", "recap", "status"]);

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Why a stored envelope can't be sent, or null when it can. The stand-in's checks, in the same order. */
export function envelopeProblem(envelope: unknown, matchId: string): string | null {
  if (!isObject(envelope)) return "not an object";
  const fields = Object.keys(envelope);
  const odd = [
    ...fields.filter((f) => !ENVELOPE_FIELDS.includes(f)),
    ...ENVELOPE_FIELDS.filter((f) => !fields.includes(f)),
  ].sort();
  if (odd.length > 0) return `fields ${JSON.stringify(odd)}`;
  if (typeof envelope.kind !== "string" || !KINDS.has(envelope.kind)) return `unknown kind ${JSON.stringify(envelope.kind)}`;
  if (envelope.match_id !== matchId) return "different match_id";
  if (!Number.isInteger(envelope.seq) || (envelope.seq as number) < 1) return "bad seq";
  return null;
}

/** The later of two panels by match_ms, then seq (a re-sent panel for the same second wins). */
const newer = (a: StoredEnvelope | null, b: StoredEnvelope): StoredEnvelope =>
  a === null || b.match_ms > a.match_ms || (b.match_ms === a.match_ms && b.seq > a.seq) ? b : a;

const hasHeavy = (envelope: StoredEnvelope) => isObject(envelope.data) && envelope.data.heavy !== undefined;

/** Documents of one match → the snapshot, or the stand-in's error code. */
export function buildSnapshot(matchId: string, docs: readonly ScreenDoc[]): SnapshotResult {
  if (docs.length === 0) return { ok: false, error: "unknown_match" };
  const state = docs.find((doc) => doc.id === "state");
  const setup = state?.setup;
  if (!setup) return { ok: false, error: "setup_pending" };

  const kept: StoredEnvelope[] = [];
  const rejected = { count: 0, samples: [] as string[] };
  let latestStats: StoredEnvelope | null = null;
  let heavyStats: StoredEnvelope | null = null;

  for (const doc of docs) {
    if (doc.type !== "envelope" && doc.type !== "positions") continue;
    const problem = envelopeProblem(doc.envelope, matchId);
    if (problem) {
      rejected.count++;
      if (rejected.samples.length < MAX_REJECTION_SAMPLES) rejected.samples.push(`${String(doc.id)}: ${problem}`);
      continue;
    }
    const envelope = doc.envelope as StoredEnvelope;
    if (envelope.kind === "stats") {
      latestStats = newer(latestStats, envelope);
      if (hasHeavy(envelope)) heavyStats = newer(heavyStats, envelope);
    } else {
      kept.push(envelope);
    }
  }
  // The newest panel can also be the newest heavy one
  for (const panel of new Set([latestStats, heavyStats])) if (panel) kept.push(panel);

  kept.sort((a, b) => a.seq - b.seq);
  const status = kept.findLast((envelope) => envelope.kind === "status");
  if (!status) return { ok: false, error: "setup_pending" };
  return { ok: true, body: { match_id: matchId, setup, status, envelopes: kept, rejected } };
}
