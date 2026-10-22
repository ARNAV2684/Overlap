import { describe, expect, it } from "vitest";
import { buildSnapshot, envelopeProblem, MAX_REJECTION_SAMPLES, type ScreenDoc } from "@/lib/snapshot";

// The cases of infra/local/webpubsub_standin/standin/snapshot.py, plus the stats rule (realtime.md §3.1)

const MATCH = "SYN-0042";
const SETUP = { match_id: MATCH, seed: 42 };

const envelope = (seq: number, kind: string, matchMs: number, data: unknown = {}) => ({
  seq,
  kind,
  match_id: MATCH,
  match_ms: matchMs,
  clock: "0:00",
  data,
});
const envDoc = (env: ReturnType<typeof envelope> | unknown, id?: string): ScreenDoc => ({
  id: id ?? `env-${String((env as { seq: number }).seq).padStart(8, "0")}`,
  type: "envelope",
  envelope: env,
});
const state: ScreenDoc = { id: "state", type: "state", setup: SETUP };
const panel = (seq: number, matchMs: number, heavy = false) =>
  envelope(seq, "stats", matchMs, { match_ms: matchMs, ...(heavy ? { heavy: { zones: [] } } : {}) });

describe("envelopeProblem", () => {
  it("accepts a well-formed envelope", () => {
    expect(envelopeProblem(envelope(1, "event", 0), MATCH)).toBeNull();
  });

  it("names what is wrong, in the stand-in's order", () => {
    expect(envelopeProblem([], MATCH)).toBe("not an object");
    expect(envelopeProblem({ ...envelope(1, "event", 0), extra: 1 }, MATCH)).toBe('fields ["extra"]');
    const noClock: Record<string, unknown> = envelope(1, "event", 0);
    delete noClock.clock;
    expect(envelopeProblem(noClock, MATCH)).toBe('fields ["clock"]');
    expect(envelopeProblem(envelope(1, "goal", 0), MATCH)).toBe('unknown kind "goal"');
    expect(envelopeProblem({ ...envelope(1, "event", 0), match_id: "SYN-0043" }, MATCH)).toBe("different match_id");
    expect(envelopeProblem(envelope(0, "event", 0), MATCH)).toBe("bad seq");
    expect(envelopeProblem(envelope(1.5, "event", 0), MATCH)).toBe("bad seq");
  });
});

describe("buildSnapshot", () => {
  it("answers unknown_match for no documents and setup_pending without a setup or a status", () => {
    expect(buildSnapshot(MATCH, [])).toEqual({ ok: false, error: "unknown_match" });
    expect(buildSnapshot(MATCH, [{ id: "state", type: "state" }, envDoc(envelope(1, "status", 0))])).toEqual({
      ok: false,
      error: "setup_pending",
    });
    expect(buildSnapshot(MATCH, [state, envDoc(envelope(2, "event", 10))])).toEqual({
      ok: false,
      error: "setup_pending",
    });
  });

  it("sends the setup, every envelope in seq order, the latest positions and the newest status", () => {
    const docs = [
      envDoc(envelope(5, "status", 300)),
      { id: "positions-latest", type: "positions", envelope: envelope(7, "positions", 400, { frames: [] }) },
      state,
      envDoc(envelope(1, "status", 0)),
      envDoc(envelope(3, "event", 200)),
    ];
    const result = buildSnapshot(MATCH, docs);
    expect(result.ok && result.body).toEqual({
      match_id: MATCH,
      setup: SETUP,
      status: envelope(5, "status", 300),
      envelopes: [envelope(1, "status", 0), envelope(3, "event", 200), envelope(5, "status", 300), envelope(7, "positions", 400, { frames: [] })],
      rejected: { count: 0, samples: [] },
    });
  });

  it("leaves out and counts bad envelopes, with at most five samples", () => {
    const bad = Array.from({ length: MAX_REJECTION_SAMPLES + 2 }, (_, i) => envDoc({ seq: i + 10 }, `env-bad-${i}`));
    const result = buildSnapshot(MATCH, [state, envDoc(envelope(1, "status", 0)), ...bad]);
    expect(result.ok && result.body.rejected.count).toBe(MAX_REJECTION_SAMPLES + 2);
    expect(result.ok && result.body.rejected.samples).toHaveLength(MAX_REJECTION_SAMPLES);
    expect(result.ok && result.body.rejected.samples[0]).toMatch(/^env-bad-0: fields /);
    expect(result.ok && result.body.envelopes.map((e) => e.seq)).toEqual([1]);
  });

  it("keeps only the newest stat panel and the newest one with a heavy block", () => {
    const docs = [
      state,
      envDoc(envelope(1, "status", 0)),
      envDoc(panel(2, 1000)),
      envDoc(panel(3, 60000, true)),
      envDoc(panel(4, 61000)),
      envDoc(panel(6, 62000)),
      envDoc(panel(5, 120000, true)),
    ];
    const result = buildSnapshot(MATCH, docs);
    // seq 5 is both the newest panel by match_ms and the newest heavy one, so it is sent once
    expect(result.ok && result.body.envelopes.map((e) => e.seq)).toEqual([1, 5]);

    const later = buildSnapshot(MATCH, [...docs, envDoc(panel(7, 121000))]);
    expect(later.ok && later.body.envelopes.map((e) => e.seq)).toEqual([1, 5, 7]);
  });

  it("prefers the later seq when a panel for the same second was sent again", () => {
    const result = buildSnapshot(MATCH, [state, envDoc(envelope(1, "status", 0)), envDoc(panel(9, 5000)), envDoc(panel(4, 5000))]);
    expect(result.ok && result.body.envelopes.map((e) => e.seq)).toEqual([1, 9]);
  });

  it("does not count the same stored panel twice when a store returns it from two reads", () => {
    const newest = envDoc(panel(3, 60000, true));
    const result = buildSnapshot(MATCH, [state, envDoc(envelope(1, "status", 0)), newest, newest]);
    expect(result.ok && result.body.envelopes.map((e) => e.seq)).toEqual([1, 3]);
  });
});
