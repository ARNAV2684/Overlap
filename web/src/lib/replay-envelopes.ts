// replay-envelopes.ts — Replay envelopes from the match archive
//
// Purpose: turn a stored match (CONTRACTS.md §4.1) into what the replay route sends: a manifest, and one minute at a
//          time as §7 envelopes, in the same shapes the screen relay sends live
// Inputs:  documents as archive-store.ts reads them (Cosmos fields included, frames unsorted and possibly repeated)
// Outputs: buildReplayIndex() (manifest plus what each chunk needs), buildReplayChunk() (envelopes and rejected count)
// Spec:    web/specs/realtime.md §5.1; CONTRACTS.md §4.1, §7.2, §7.3
//
// Pure: no I/O, no clock, no randomness, so the same stored match always gives the same envelopes and `seq` numbers.
// Status envelopes follow functions/screen_relay.py: one after PeriodStart, after each goal Shot and after PeriodEnd.

import { z } from "zod";
import {
  describeRejection,
  matchSetupSchema,
  parseEnvelope,
  trackingFrameSchema,
  type EnvelopeKind,
  type MatchSetup,
  type ParsedEnvelope,
  type TrackingFrame,
} from "@/lib/contracts";
import type { StoredDoc, StoredMatch, TrackingFile } from "@/lib/server/archive-store";

/** `seq` of a chunk's envelopes: `(index + 1) × SEQ_PER_CHUNK + position` (realtime.md §5.1). */
export const SEQ_PER_CHUNK = 100_000;
/** At most this many frames per `positions` envelope (CONTRACTS.md §7.2). */
export const FRAMES_PER_BUNDLE = 5;
/** At most this many rejection descriptions per response, as in the snapshot (CONTRACTS.md §7.3). */
export const MAX_SAMPLES = 5;
const MINUTE_MS = 60_000;
/** Halves only, like the screen relay (functions/screen_relay.py SUPPORTED_PERIODS). */
const PERIODS = [1, 2] as const;

type Side = "home" | "away";
type Score = { home: number; away: number };

export type ReplayPeriod = { period: number; start_ms: number; end_ms: number; end_period_ms: number };
export type ReplayChunk = { index: number; period: number; minute: number; from_ms: number; to_ms: number };
export type Rejected = { count: number; samples: string[] };

const resultSchema = z.strictObject({
  score: z.strictObject({ home: z.number().int().nonnegative(), away: z.number().int().nonnegative() }),
  events: z.number().int().nonnegative(),
});
export type StoredResult = z.infer<typeof resultSchema>;

export type ReplayManifest = {
  match_id: string;
  status: "finished";
  setup: MatchSetup;
  result: StoredResult;
  periods: ReplayPeriod[];
  chunks: ReplayChunk[];
  duration_ms: number;
  /** Event `seq` values missing from the archive. Replay continues without them. */
  gaps: number[];
};

export type ReplayChunkResponse = {
  match_id: string;
  chunk: number;
  envelopes: ParsedEnvelope[];
  rejected: Rejected;
};

/** Everything a chunk needs besides its own documents. Built once per finished match and cached by the route. */
export type ReplayIndex = {
  manifest: ReplayManifest;
  sideOfTeam: ReadonlyMap<string, Side>;
  /** Goal shots in play order, for the score before a chunk starts. */
  goals: readonly { period: number; period_ms: number; side: Side }[];
};

export type IndexError = "not_ready" | "not_finished" | "archive_invalid";
export type IndexResult = { ok: true; index: ReplayIndex } | { ok: false; error: IndexError; detail?: string };

// ---------------------------------------------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------------------------------------------

/** Removes what Cosmos adds to a stored document: `id` and every field starting with `_`. */
export function cleanStoredDoc(doc: StoredDoc): Record<string, unknown> {
  return Object.fromEntries(Object.entries(doc).filter(([key]) => key !== "id" && !key.startsWith("_")));
}

/** The display clock of a moment in a half (CONTRACTS.md §1.2), as functions/screen_relay.py formats it. */
export function replayClock(period: number, periodMs: number): string {
  const [base, end] = period === 1 ? [0, 45] : [45, 90];
  const totalSeconds = base * 60 + Math.floor(periodMs / 1000);
  const minute = Math.floor(totalSeconds / 60);
  const second = String(totalSeconds % 60).padStart(2, "0");
  return minute >= end ? `${end}+${minute - end}:${second}` : `${minute}:${second}`;
}

/** Event `seq` values missing between 1 and the highest stored one. */
export function findGaps(seqs: readonly number[]): number[] {
  const present = new Set(seqs);
  const highest = seqs.reduce((max, seq) => Math.max(max, seq), 0);
  const gaps: number[] = [];
  for (let seq = 1; seq <= highest; seq++) if (!present.has(seq)) gaps.push(seq);
  return gaps;
}

const num = (doc: Record<string, unknown>, key: string): number | null =>
  typeof doc[key] === "number" && Number.isInteger(doc[key]) ? (doc[key] as number) : null;

// ---------------------------------------------------------------------------------------------------------------
// Index and manifest
// ---------------------------------------------------------------------------------------------------------------

/**
 * Checks a stored match and works out its periods and minute chunks. `markers` are its PeriodStart and PeriodEnd
 * events, `goals` its goal shots, both in `seq` order; `eventSeqs` every stored event `seq`.
 */
export function buildReplayIndex(
  match: StoredMatch,
  markers: readonly StoredDoc[],
  goals: readonly StoredDoc[],
  eventSeqs: readonly number[],
): IndexResult {
  if (match.setup === null || match.setup === undefined) return { ok: false, error: "not_ready" };
  if (match.status !== "finished") return { ok: false, error: "not_finished" };

  const setup = matchSetupSchema.safeParse(match.setup);
  if (!setup.success) return { ok: false, error: "archive_invalid", detail: "the stored setup fails CONTRACTS.md §2" };
  const result = resultSchema.safeParse(match.result);
  if (!result.success) return { ok: false, error: "archive_invalid", detail: "the stored result is missing or malformed" };

  const periods: ReplayPeriod[] = [];
  for (const period of PERIODS) {
    const start = markers.map(cleanStoredDoc).find((e) => e.type === "PeriodStart" && e.period === period);
    const end = markers.map(cleanStoredDoc).find((e) => e.type === "PeriodEnd" && e.period === period);
    const startMs = start && num(start, "match_ms");
    const endMs = end && num(end, "match_ms");
    const endPeriodMs = end && num(end, "period_ms");
    if (startMs == null || endMs == null || endPeriodMs == null || endMs < startMs) {
      return { ok: false, error: "archive_invalid", detail: `period ${period} has no complete start and end` };
    }
    periods.push({ period, start_ms: startMs, end_ms: endMs, end_period_ms: endPeriodMs });
  }
  const others = markers.map(cleanStoredDoc).filter((e) => !PERIODS.includes(e.period as 1 | 2));
  if (others.length > 0) {
    return { ok: false, error: "archive_invalid", detail: "periods other than 1 and 2 are not supported yet" };
  }

  const chunks: ReplayChunk[] = [];
  for (const p of periods) {
    const lastMinute = Math.floor(p.end_period_ms / MINUTE_MS);
    for (let minute = 0; minute <= lastMinute; minute++) {
      chunks.push({
        index: chunks.length,
        period: p.period,
        minute,
        from_ms: p.start_ms + minute * MINUTE_MS,
        to_ms: minute === lastMinute ? p.end_ms + 1 : p.start_ms + (minute + 1) * MINUTE_MS,
      });
    }
  }

  const teams = setup.data.teams;
  const sideOfTeam = new Map<string, Side>([
    [teams.home.team_id, "home"],
    [teams.away.team_id, "away"],
  ]);
  const goalList: { period: number; period_ms: number; side: Side }[] = [];
  for (const goal of goals.map(cleanStoredDoc)) {
    const side = sideOfTeam.get(String(goal.team_id));
    const period = num(goal, "period");
    const periodMs = num(goal, "period_ms");
    // A goal that can't be placed is left to the chunk, which rejects it with a reason
    if (side && period !== null && periodMs !== null) goalList.push({ period, period_ms: periodMs, side });
  }

  return {
    ok: true,
    index: {
      manifest: {
        match_id: match.match_id,
        status: "finished",
        setup: setup.data,
        result: result.data,
        periods,
        chunks,
        duration_ms: periods[periods.length - 1].end_ms,
        gaps: findGaps(eventSeqs),
      },
      sideOfTeam,
      goals: goalList,
    },
  };
}

/** Goals scored before a chunk starts (earlier periods, or earlier minutes of its period). */
function scoreBefore(index: ReplayIndex, chunk: ReplayChunk): Score {
  const score: Score = { home: 0, away: 0 };
  const from = chunk.minute * MINUTE_MS;
  for (const goal of index.goals) {
    if (goal.period < chunk.period || (goal.period === chunk.period && goal.period_ms < from)) score[goal.side]++;
  }
  return score;
}

/**
 * The `match_ms` range of a chunk's stat panels, `[from, to)`. The same as the chunk's, except that a period's last
 * chunk also takes the panel sent for its PeriodEnd: the stats engine stamps that one with the next whole second, up
 * to 999 ms after the whistle, and it carries the half-time or full-time totals (realtime.md §5.1).
 */
export function panelRange(manifest: ReplayManifest, chunk: ReplayChunk): [number, number] {
  const next = manifest.chunks[chunk.index + 1];
  const lastOfPeriod = next === undefined || next.period !== chunk.period;
  return [chunk.from_ms, lastOfPeriod ? chunk.to_ms + 999 : chunk.to_ms];
}

// ---------------------------------------------------------------------------------------------------------------
// One chunk
// ---------------------------------------------------------------------------------------------------------------

/** An envelope before it is numbered and checked. */
type Draft = { match_id: string; kind: EnvelopeKind; match_ms: number; clock: string; data: unknown };
/** One unit of the chunk's order. An event and the status it causes stay together (rank 0). */
type Unit = { match_ms: number; rank: 0 | 1 | 2; order: number; drafts: Draft[] };

/**
 * Builds one minute of envelopes (realtime.md §5.1). `events` and `panels` are the chunk's stored documents as
 * archive-store.ts returns them; `tracking` is its tracking file, or null when the minute has none.
 */
export function buildReplayChunk(
  index: ReplayIndex,
  chunk: ReplayChunk,
  pieces: { events: readonly StoredDoc[]; panels: readonly StoredDoc[]; tracking: TrackingFile | null },
): ReplayChunkResponse {
  const matchId = index.manifest.match_id;
  const rejected: Rejected = { count: 0, samples: [] };
  const reject = (text: string, count = 1) => {
    rejected.count += count;
    if (rejected.samples.length < MAX_SAMPLES) rejected.samples.push(text);
  };
  const units: Unit[] = [];
  const add = (unit: Omit<Unit, "order">) => units.push({ ...unit, order: units.length });
  const base = { match_id: matchId } as const;

  // Events, each followed by the status it causes (CONTRACTS.md §7.2)
  const score = scoreBefore(index, chunk);
  for (const event of pieces.events.map(cleanStoredDoc)) {
    const matchMs = num(event, "match_ms") ?? 0;
    const clock = typeof event.clock === "string" ? event.clock : "0:00";
    const drafts: Draft[] = [{ ...base, kind: "event", match_ms: matchMs, clock, data: event }];
    const status = (phase: string) =>
      drafts.push({
        ...base,
        kind: "status",
        match_ms: matchMs,
        clock,
        data: { phase, period: chunk.period, score: { ...score } },
      });
    if (event.type === "PeriodStart") status("live");
    else if (event.type === "PeriodEnd") status(chunk.period === 1 ? "half_time" : "full_time");
    else if (event.type === "Shot" && event.shot_outcome === "goal") {
      const side = index.sideOfTeam.get(String(event.team_id));
      if (side) {
        score[side]++;
        status("live");
      } else {
        reject(`event seq ${String(event.seq)}: goal by unknown team ${String(event.team_id)}`);
      }
    }
    add({ match_ms: matchMs, rank: 0, drafts });
  }

  // Stat panels, unchanged (CONTRACTS.md §7.4)
  for (const panel of pieces.panels.map(cleanStoredDoc)) {
    const matchMs = num(panel, "match_ms") ?? 0;
    const clock = typeof panel.clock === "string" ? panel.clock : "0:00";
    add({ match_ms: matchMs, rank: 1, drafts: [{ ...base, kind: "stats", match_ms: matchMs, clock, data: panel }] });
  }

  // Frames: each checked, the first kept per match_ms, sorted, then bundled by at most 5 (CONTRACTS.md §4.1, §7.2)
  if (pieces.tracking) {
    if (pieces.tracking.unreadable > 0) {
      reject(`tracking p${chunk.period}/m${chunk.minute}: ${pieces.tracking.unreadable} unreadable lines`, pieces.tracking.unreadable);
    }
    const seen = new Map<number, TrackingFrame>();
    for (const raw of pieces.tracking.frames) {
      const frame = trackingFrameSchema.safeParse(raw);
      if (!frame.success) {
        const issue = frame.error.issues[0];
        reject(`frame in p${chunk.period}/m${chunk.minute}: ${issue ? `${issue.path.join(".")}: ${issue.message}` : "invalid"}`);
      } else if (frame.data.match_id !== matchId || frame.data.period !== chunk.period) {
        reject(`frame at match_ms ${frame.data.match_ms}: belongs to another match or period`);
      } else if (!seen.has(frame.data.match_ms)) {
        seen.set(frame.data.match_ms, frame.data);
      }
    }
    const frames = [...seen.values()].sort((a, b) => a.match_ms - b.match_ms);
    for (let i = 0; i < frames.length; i += FRAMES_PER_BUNDLE) {
      const bundle = frames.slice(i, i + FRAMES_PER_BUNDLE);
      const last = bundle[bundle.length - 1];
      add({
        match_ms: last.match_ms,
        rank: 2,
        drafts: [
          { ...base, kind: "positions", match_ms: last.match_ms, clock: replayClock(last.period, last.period_ms), data: { frames: bundle } },
        ],
      });
    }
  }

  units.sort((a, b) => a.match_ms - b.match_ms || a.rank - b.rank || a.order - b.order);
  const drafts = units.flatMap((unit) => unit.drafts);
  // Chunk 0 opens with the relay's first status: pre-match, with the setup (CONTRACTS.md §7.2)
  if (chunk.index === 0) {
    drafts.unshift({
      ...base,
      kind: "status",
      match_ms: 0,
      clock: "0:00",
      data: { phase: "pre_match", period: 0, score: { home: 0, away: 0 }, setup: index.manifest.setup },
    });
  }

  // Number and check every envelope; one that fails is left out and counted (realtime.md §5.1)
  const envelopes: ParsedEnvelope[] = [];
  drafts.forEach((draft, position) => {
    const parsed = parseEnvelope({ ...draft, seq: (chunk.index + 1) * SEQ_PER_CHUNK + position });
    if (parsed.ok) envelopes.push(parsed.envelope);
    else reject(describeRejection(parsed));
  });

  return { match_id: matchId, chunk: chunk.index, envelopes, rejected };
}
