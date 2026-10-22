import { describe, expect, it } from "vitest";
import type { ParsedEnvelope } from "@/lib/contracts";
import {
  buildReplayChunk,
  buildReplayIndex,
  cleanStoredDoc,
  findGaps,
  panelRange,
  replayClock,
  SEQ_PER_CHUNK,
  type ReplayIndex,
} from "@/lib/replay-envelopes";
import type { StoredDoc, StoredMatch, TrackingFile } from "@/lib/server/archive-store";
import { makeSetup } from "./fixtures";
import {
  frameAt,
  P1_END,
  P2_END,
  STORED_EVENTS as EVENTS,
  STORED_MATCH as MATCH,
  storedEvent as stored,
  storedGoal as goal,
  storedPanel,
  storedPass as pass,
} from "./replay-fixtures";

const MARKERS = EVENTS.filter((e) => e.type === "PeriodStart" || e.type === "PeriodEnd");
const GOALS = EVENTS.filter((e) => e.type === "Shot");

function index(): ReplayIndex {
  const result = buildReplayIndex(MATCH, MARKERS, GOALS, EVENTS.map((e) => e.seq as number));
  if (!result.ok) throw new Error(`index failed: ${result.error}`);
  return result.index;
}

/** The stored events, panels and frames of one chunk, picked the way archive-store.ts queries them. */
function chunkOf(idx: ReplayIndex, i: number, tracking: TrackingFile | null = null, panels: StoredDoc[] = []) {
  const chunk = idx.manifest.chunks[i];
  const events = EVENTS.filter(
    (e) => e.period === chunk.period && (e.period_ms as number) >= chunk.minute * 60_000 && (e.period_ms as number) < (chunk.minute + 1) * 60_000,
  );
  return buildReplayChunk(idx, chunk, { events, panels, tracking });
}

const summary = (envelopes: ParsedEnvelope[]) =>
  envelopes.map((e) => (e.kind === "event" ? `event:${e.data.type}` : e.kind === "status" ? `status:${e.data.phase}` : e.kind));

describe("buildReplayIndex", () => {
  it("lists periods and one chunk per minute, numbered like the tracking files", () => {
    const { manifest } = index();
    expect(manifest.periods).toEqual([
      { period: 1, start_ms: 0, end_ms: P1_END, end_period_ms: P1_END },
      { period: 2, start_ms: P1_END, end_ms: P1_END + P2_END, end_period_ms: P2_END },
    ]);
    expect(manifest.chunks).toEqual([
      { index: 0, period: 1, minute: 0, from_ms: 0, to_ms: 60_000 },
      { index: 1, period: 1, minute: 1, from_ms: 60_000, to_ms: 120_000 },
      { index: 2, period: 1, minute: 2, from_ms: 120_000, to_ms: P1_END + 1 },
      { index: 3, period: 2, minute: 0, from_ms: P1_END, to_ms: P1_END + 60_000 },
      { index: 4, period: 2, minute: 1, from_ms: P1_END + 60_000, to_ms: P1_END + P2_END + 1 },
    ]);
    expect(manifest.duration_ms).toBe(P1_END + P2_END);
    expect(manifest.status).toBe("finished");
    expect(manifest.result).toEqual({ score: { home: 1, away: 1 }, events: 7 });
    expect(manifest.gaps).toEqual([]);
  });

  it("reports missing event seqs as gaps", () => {
    expect(findGaps([1, 2, 4, 7])).toEqual([3, 5, 6]);
    const result = buildReplayIndex(MATCH, MARKERS, GOALS, [1, 2, 4]);
    expect(result.ok && result.index.manifest.gaps).toEqual([3]);
  });

  it("answers not_ready without a setup, then not_finished for a live match", () => {
    expect(buildReplayIndex({ ...MATCH, setup: undefined }, MARKERS, GOALS, [])).toMatchObject({ ok: false, error: "not_ready" });
    expect(buildReplayIndex({ ...MATCH, status: "live" }, MARKERS, GOALS, [])).toMatchObject({ ok: false, error: "not_finished" });
  });

  it("calls a stored match it can't trust archive_invalid, with a reason", () => {
    const cases: [StoredMatch, StoredDoc[]][] = [
      [{ ...MATCH, setup: { ...makeSetup(), extra: 1 } }, MARKERS],
      [{ ...MATCH, result: undefined }, MARKERS],
      [MATCH, MARKERS.filter((m) => !(m.type === "PeriodEnd" && m.period === 2))],
      [MATCH, [...MARKERS, stored(8, 3, 0, "PeriodStart")]],
    ];
    for (const [match, markers] of cases) {
      const result = buildReplayIndex(match, markers, GOALS, []);
      expect(result).toMatchObject({ ok: false, error: "archive_invalid" });
      expect(!result.ok && result.detail).toBeTruthy();
    }
  });
});

describe("buildReplayChunk", () => {
  it("opens chunk 0 with the pre-match status and setup, then PeriodStart and its live status", () => {
    const { envelopes, rejected } = chunkOf(index(), 0);
    expect(rejected).toEqual({ count: 0, samples: [] });
    expect(summary(envelopes)).toEqual(["status:pre_match", "event:PeriodStart", "status:live", "event:Pass"]);
    const first = envelopes[0];
    expect(first).toMatchObject({ match_ms: 0, clock: "0:00", data: { phase: "pre_match", period: 0, score: { home: 0, away: 0 } } });
    expect(first.kind === "status" && first.data.setup?.match_id).toBe("SYN-0042");
  });

  it("numbers envelopes (index + 1) × 100000 + position, rising across chunks and repeatable", () => {
    const idx = index();
    const zero = chunkOf(idx, 0).envelopes.map((e) => e.seq);
    const three = chunkOf(idx, 3).envelopes.map((e) => e.seq);
    expect(zero).toEqual([SEQ_PER_CHUNK, SEQ_PER_CHUNK + 1, SEQ_PER_CHUNK + 2, SEQ_PER_CHUNK + 3]);
    expect(three[0]).toBe(4 * SEQ_PER_CHUNK);
    expect(Math.min(...three)).toBeGreaterThan(Math.max(...zero));
    expect(chunkOf(idx, 3)).toEqual(chunkOf(idx, 3));
  });

  it("strips the Cosmos fields so the strict schemas accept the stored documents", () => {
    expect(cleanStoredDoc({ id: "x", _rid: "r", _ts: 1, seq: 4, kind: "y" })).toEqual({ seq: 4, kind: "y" });
    const pass = chunkOf(index(), 0).envelopes.find((e) => e.kind === "event" && e.data.type === "Pass");
    expect(pass?.data).not.toHaveProperty("id");
    expect(pass?.data).not.toHaveProperty("_rid");
  });

  it("follows a goal with the new score, half time with half_time, and carries the score into later chunks", () => {
    const idx = index();
    const minute1 = chunkOf(idx, 1).envelopes;
    expect(summary(minute1)).toEqual(["event:Shot", "status:live"]);
    expect(minute1[1]).toMatchObject({ match_ms: 70_000, clock: "1:10", data: { phase: "live", period: 1, score: { home: 0, away: 1 } } });

    const minute2 = chunkOf(idx, 2).envelopes;
    expect(minute2[1]).toMatchObject({ data: { phase: "half_time", period: 1, score: { home: 0, away: 1 } } });

    const secondHalf = chunkOf(idx, 3).envelopes;
    expect(summary(secondHalf)).toEqual(["event:PeriodStart", "status:live", "event:Shot", "status:live"]);
    expect(secondHalf[1]).toMatchObject({ data: { period: 2, score: { home: 0, away: 1 } } });
    expect(secondHalf[3]).toMatchObject({ data: { period: 2, score: { home: 1, away: 1 } } });

    const end = chunkOf(idx, 4).envelopes;
    expect(end[end.length - 1]).toMatchObject({ kind: "status", data: { phase: "full_time", period: 2, score: { home: 1, away: 1 } } });
  });

  it("keeps the first of repeated frames, sorts them and bundles at most 5 per positions envelope", () => {
    const frames = [7, 0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11].map((i) => frameAt(1, 60_000 + i * 200));
    frames.splice(3, 0, frameAt(1, 60_000 + 1 * 200, 99)); // a repeat of the frame at +200 ms, with a different ball
    const { envelopes, rejected } = chunkOf(index(), 1, { frames, unreadable: 0 });
    expect(rejected.count).toBe(0);
    const bundles = envelopes.filter((e) => e.kind === "positions");
    expect(bundles.map((e) => e.kind === "positions" && e.data.frames.length)).toEqual([5, 5, 2]);
    const all = bundles.flatMap((e) => (e.kind === "positions" ? e.data.frames : []));
    expect(all.map((f) => f.match_ms)).toEqual([...Array(12).keys()].map((i) => 60_000 + i * 200));
    expect(all[1].ball.x).toBe(50);
    expect(bundles[0]).toMatchObject({ match_ms: 60_800, clock: "1:00" });
  });

  it("orders ties by event (with its status), then stats, then positions", () => {
    const idx = index();
    const tieMs = 70_000; // the goal in minute 1
    const panel = storedPanel(1, tieMs);
    expect(panel).toMatchObject({ id: "stats-000070000", clock: "1:10" });
    const tracking = { frames: [frameAt(1, 66_000), frameAt(1, 66_200), frameAt(1, 66_400), frameAt(1, 66_600), frameAt(1, tieMs)], unreadable: 0 };
    const { envelopes } = chunkOf(idx, 1, tracking, [panel]);
    expect(summary(envelopes)).toEqual(["event:Shot", "status:live", "stats", "positions"]);
    expect(envelopes.find((e) => e.kind === "stats")?.data).not.toHaveProperty("id");
  });

  it("leaves out what fails the contract, counts it and says why", () => {
    const idx = index();
    const chunk = idx.manifest.chunks[0];
    const broken = { ...pass(2, 1, 30_000), sneaky: true };
    const strangerGoal = goal(9, 1, 40_000, "XYZ");
    const tracking = { frames: [frameAt(1, 1000), frameAt(2, 1200), { nonsense: true }], unreadable: 2 };
    const { envelopes, rejected } = buildReplayChunk(idx, chunk, { events: [EVENTS[0], broken, strangerGoal], panels: [], tracking });

    // pre-match, PeriodStart, its status, one frame bundle; the unknown team's goal shot stays as an event
    expect(summary(envelopes)).toEqual(["status:pre_match", "event:PeriodStart", "status:live", "positions", "event:Shot"]);
    expect(rejected.count).toBe(1 + 1 + 1 + 1 + 2);
    expect(rejected.samples).toHaveLength(5);
    const text = rejected.samples.join(" | ");
    expect(text).toMatch(/unreadable lines/);
    expect(text).toMatch(/another match or period/);
    expect(text).toMatch(/goal by unknown team XYZ/);
  });
});

describe("panelRange", () => {
  it("matches the chunk, but runs a period's last chunk on to take the panel stamped just after the whistle", () => {
    const { manifest } = index();
    expect(panelRange(manifest, manifest.chunks[1])).toEqual([60_000, 120_000]);
    expect(panelRange(manifest, manifest.chunks[2])).toEqual([120_000, P1_END + 1000]);
    expect(panelRange(manifest, manifest.chunks[3])).toEqual([P1_END, P1_END + 60_000]);
    expect(panelRange(manifest, manifest.chunks[4])).toEqual([P1_END + 60_000, P1_END + P2_END + 1000]);
  });
});

describe("replayClock", () => {
  it("formats like the relay, with stoppage time as 45+n and 90+n", () => {
    expect(replayClock(1, 0)).toBe("0:00");
    expect(replayClock(1, 2_820_000)).toBe("45+2:00");
    expect(replayClock(2, 1_034_000)).toBe("62:14");
    expect(replayClock(2, 2_880_000)).toBe("90+3:00");
  });
});
