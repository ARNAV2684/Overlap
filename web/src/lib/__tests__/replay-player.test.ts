import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedEnvelope } from "@/lib/contracts";
import { ReplayError, type ReplayChunkData, type ReplayClient } from "@/lib/replay-client";
import { buildReplayChunk, buildReplayIndex, type ReplayManifest } from "@/lib/replay-envelopes";
import { createReplayPlayer, replayNotices, type ReplayPlayer } from "@/lib/replay-player";
import { createMatchStore, type MatchStore } from "@/lib/store";
import { frameAt, P1_END, P2_END, STORED_EVENTS, STORED_MATCH } from "./replay-fixtures";

// The stored match of replay-fixtures.ts as the route would serve it: five one-minute chunks, 1–1 at full time
const markers = STORED_EVENTS.filter((e) => e.type === "PeriodStart" || e.type === "PeriodEnd");
const goals = STORED_EVENTS.filter((e) => e.type === "Shot");
const built = buildReplayIndex(STORED_MATCH, markers, goals, STORED_EVENTS.map((e) => e.seq as number));
if (!built.ok) throw new Error("fixture index failed");
const INDEX = built.index;
const MANIFEST: ReplayManifest = INDEX.manifest;
const CHUNKS: ReplayChunkData[] = MANIFEST.chunks.map((chunk) => {
  const events = STORED_EVENTS.filter(
    (e) =>
      e.period === chunk.period &&
      (e.period_ms as number) >= chunk.minute * 60_000 &&
      (e.period_ms as number) < (chunk.minute + 1) * 60_000,
  );
  // Two frames in the first minute, so positions are replayed too
  const tracking = chunk.index === 0 ? { frames: [frameAt(1, 10_000), frameAt(1, 10_200)], unreadable: 0 } : null;
  const body = buildReplayChunk(INDEX, chunk, { events, panels: [], tracking });
  return { chunk: body.chunk, envelopes: body.envelopes, rejected: body.rejected };
});

type Pending = { resolve: (data: ReplayChunkData) => void; reject: (error: unknown) => void };

/** A client that answers at once, except for chunks the test holds back or fails. */
function fakeClient(options: { hold?: number[]; fail?: number[]; manifest?: () => Promise<ReplayManifest> } = {}) {
  const pending = new Map<number, Pending>();
  const client: ReplayClient & { calls: number[]; release(index: number): void } = {
    calls: [],
    manifest: vi.fn(options.manifest ?? (() => Promise.resolve(MANIFEST))),
    chunk: vi.fn((_id: string, index: number) => {
      client.calls.push(index);
      if (options.fail?.includes(index)) return Promise.reject(new ReplayError("http", "chunk failed", { status: 502 }));
      if (options.hold?.includes(index)) return new Promise<ReplayChunkData>((resolve, reject) => pending.set(index, { resolve, reject }));
      return Promise.resolve(CHUNKS[index]);
    }),
    release(index) {
      pending.get(index)?.resolve(CHUNKS[index]);
    },
  };
  return client;
}

let store: MatchStore;
let ingested: ParsedEnvelope[];
let player: ReplayPlayer | null;

function play(client: ReplayClient) {
  player = createReplayPlayer(store, client, "SYN-0042", { now: () => Date.now(), wallClock: () => Date.now(), onChunkRejected: () => {} });
  player.start();
  return player;
}
const view = () => {
  store.flush();
  return store.getState();
};
const at = (ms: number) => vi.advanceTimersByTimeAsync(ms);

beforeEach(() => {
  vi.useFakeTimers();
  store = createMatchStore("SYN-0042", { onReject: () => {} });
  ingested = [];
  const ingest = store.ingest.bind(store);
  store.ingest = (envelope, receivedAt) => {
    ingested.push(envelope);
    return ingest(envelope, receivedAt);
  };
  player = null;
});
afterEach(() => {
  player?.stop();
  store.destroy();
  vi.useRealTimers();
});

describe("replay player: start and playback (AC-05)", () => {
  it("loads, then plays from kick-off with the setup, the badge live and the playing notice", async () => {
    const p = play(fakeClient());
    expect(p.getState()).toMatchObject({ status: "loading", playheadMs: 0 });
    expect(view().connection.status).toBe("connecting");
    expect(view().notice.text).toBe(replayNotices.loading);

    await at(0);
    expect(p.getState()).toMatchObject({ status: "playing", buffering: false, manifest: MANIFEST });
    expect(view().connection.status).toBe("live");
    expect(view().notice.text).toBe(replayNotices.playing);
    // Everything at match_ms 0: the pre-match status with the setup, PeriodStart and its live status
    expect(ingested.map((e) => e.kind)).toEqual(["status", "event", "status"]);
    expect(view().scoreboard).toMatchObject({ phase: "live", setup: STORED_MATCH.setup });
  });

  it("moves the playhead at 20× by default, 5× and 1× when chosen, and ingests only what it has reached", async () => {
    const p = play(fakeClient());
    await at(0);
    await at(1000);
    expect(p.getState().playheadMs).toBe(20_000);
    expect(ingested.some((e) => e.kind === "positions")).toBe(true); // frames at 10 s
    expect(ingested.some((e) => e.kind === "event" && e.data.type === "Pass")).toBe(false); // the pass is at 30 s

    p.setSpeed(5);
    await at(1000);
    expect(p.getState()).toMatchObject({ speed: 5, playheadMs: 25_000 });
    p.setSpeed(1);
    await at(5000);
    expect(p.getState().playheadMs).toBe(30_000);
    expect(ingested.some((e) => e.kind === "event" && e.data.type === "Pass")).toBe(true);
  });

  it("keeps two chunks ahead loading, asking for the next as each is used up", async () => {
    const client = fakeClient();
    play(client);
    await at(0);
    expect(client.calls).toEqual([0, 1, 2]);
    await at(2000); // 40 s: chunk 0 is used up
    expect(client.calls).toEqual([0, 1, 2, 3]);
  });

  it("pauses the playhead and resumes from where it stopped", async () => {
    const p = play(fakeClient());
    await at(0);
    await at(500);
    p.pause();
    expect(p.getState()).toMatchObject({ status: "paused", playheadMs: 10_000 });
    await at(5000);
    expect(p.getState().playheadMs).toBe(10_000);
    p.play();
    await at(500);
    expect(p.getState()).toMatchObject({ status: "playing", playheadMs: 20_000 });
  });

  it("ends at full time with the archived score, the badge finished and the timer stopped", async () => {
    const p = play(fakeClient());
    await at(0);
    await at(((P1_END + P2_END) / 20) + 1000);
    expect(p.getState()).toMatchObject({ status: "finished", playheadMs: P1_END + P2_END });
    expect(view().connection.status).toBe("finished");
    expect(view().notice.text).toBe(replayNotices.finished);
    expect(view().scoreboard).toMatchObject({ phase: "full_time", score: { home: 1, away: 1 } });
    expect(vi.getTimerCount()).toBe(0);
    // Every envelope of every chunk, once, in order
    expect(ingested.map((e) => e.seq)).toEqual(CHUNKS.flatMap((c) => c.envelopes.map((e) => e.seq)));
  });

  it("plays again from kick-off after the end, with a cleared store", async () => {
    const p = play(fakeClient());
    await at(0);
    await at(20_000);
    expect(p.getState().status).toBe("finished");
    p.play();
    expect(view().counters.events).toBe(0);
    await at(0);
    expect(p.getState()).toMatchObject({ status: "playing", playheadMs: 0 });
  });
});

describe("replay player: waiting and failures (AC-05)", () => {
  it("waits at the start of a chunk that hasn't loaded, then carries on", async () => {
    const client = fakeClient({ hold: [1] });
    const p = play(client);
    await at(0);
    await at(5000); // would be 100 s
    expect(p.getState()).toMatchObject({ status: "playing", buffering: true, playheadMs: 60_000 });
    expect(view().notice.text).toBe(replayNotices.buffering);

    client.release(1);
    await at(0);
    expect(p.getState().buffering).toBe(false);
    expect(view().notice.text).toBe(replayNotices.playing);
    await at(1000);
    expect(p.getState().playheadMs).toBe(80_000);
    expect(ingested.some((e) => e.kind === "event" && e.data.type === "Shot")).toBe(true);
  });

  it("retries a failed chunk after 1, 2 and 4 s, then pauses with the unavailable notice; Retry plays on", async () => {
    const failing = new Set([1]);
    const client = fakeClient();
    client.chunk = vi.fn((id: string, index: number) => {
      client.calls.push(index);
      return failing.has(index)
        ? Promise.reject(new ReplayError("network", "down"))
        : Promise.resolve(CHUNKS[index]);
    });
    const p = play(client);
    await at(0);
    await at(6999);
    expect(client.calls.filter((i) => i === 1)).toHaveLength(3); // first try, then after 1 s and 2 s
    expect(p.getState()).toMatchObject({ status: "playing", buffering: true, playheadMs: 60_000 });

    await at(1);
    expect(client.calls.filter((i) => i === 1)).toHaveLength(4); // and after 4 s, the last
    expect(p.getState()).toMatchObject({ status: "paused", chunkFailed: true, playheadMs: 60_000 });
    expect(view().notice).toEqual({ text: replayNotices.unavailable, tone: "warning" });

    failing.clear();
    p.retry();
    await at(1000);
    expect(p.getState()).toMatchObject({ status: "playing", chunkFailed: false, playheadMs: 80_000 });
  });

  it("names why the replay can't start: not_found, not_finished, not_ready, else unreachable", async () => {
    const cases: [unknown, string][] = [
      [new ReplayError("http", "x", { status: 404, code: "not_found" }), "not_found"],
      [new ReplayError("http", "x", { status: 409, code: "not_finished" }), "not_finished"],
      [new ReplayError("http", "x", { status: 503, code: "not_ready" }), "not_ready"],
      [new ReplayError("http", "x", { status: 502, code: "storage_error" }), "unreachable"],
      [new ReplayError("network", "x"), "unreachable"],
    ];
    for (const [error, failure] of cases) {
      player?.stop();
      const p = play(fakeClient({ manifest: () => Promise.reject(error) }));
      await at(0);
      expect(p.getState()).toMatchObject({ status: "failed", failure });
      expect(view().notice).toEqual({ text: replayNotices.failed, tone: "warning" });
    }
    // Only the store's own publish timer was left, and it has fired: the player keeps nothing running
    await at(300);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("adds a chunk's rejected envelopes to the store's count", async () => {
    const client = fakeClient();
    client.chunk = vi.fn((_id: string, index: number) =>
      Promise.resolve(index === 0 ? { ...CHUNKS[0], rejected: { count: 2, samples: ["a", "b"] } } : CHUNKS[index]),
    );
    play(client);
    await at(0);
    expect(view().connection.rejected).toBe(2);
  });

  it("ignores answers that arrive after stop(), and leaves no timer running", async () => {
    let answer: (m: ReplayManifest) => void = () => {};
    const p = play(fakeClient({ manifest: () => new Promise((resolve) => (answer = resolve)) }));
    p.stop();
    answer(MANIFEST);
    await at(1000);
    expect(p.getState().status).toBe("loading");
    expect(ingested).toEqual([]);
    expect(vi.getTimerCount()).toBe(0);
  });
});
