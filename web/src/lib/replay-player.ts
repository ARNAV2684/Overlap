// replay-player.ts — Replay player
//
// Purpose: play a finished match from the archive through the same store as the live screen: a playhead in match
//          time moves at 1×, 5× or 20×, and every envelope at or before it is ingested, in order
// Inputs:  a match store (store.ts), a replay client (replay-client.ts), the match id
// Outputs: createReplayPlayer(): getState(), subscribe(), start(), stop(), play(), pause(), setSpeed(), retry(),
//          restart(); replayNotices
// Spec:    web/specs/realtime.md §5.2
//
// How it works
//  - Outside React, like the store. A 100 ms timer moves the playhead by the wall time elapsed × speed.
//  - Chunks are ingested strictly in index order, each envelope once its match_ms is reached, so order is the route's
//    (a status right after the event that caused it; period 2 straight after period 1, as half-time is not in
//    match_ms).
//  - The chunk under the playhead and the next PREFETCH are kept loading; a chunk is dropped once ingested. The
//    playhead never passes a chunk that hasn't loaded: it waits there ("Buffering…").
//  - A failed chunk is retried after 1 s, 2 s and 4 s; if it is still missing when needed, the player pauses with
//    "Replay data unavailable." until retry().
//  - It never calls store.tick(), so a paused replay never turns "stale". Rows get the browser's wall time, so
//    counters, the goal flash and the announcement work as they do live.
//  - A generation counter makes every late callback from a stopped or restarted run a no-op.

import type { ParsedEnvelope } from "@/lib/contracts";
import { ReplayError, type ReplayClient } from "@/lib/replay-client";
import type { ReplayManifest } from "@/lib/replay-envelopes";
import type { MatchStore } from "@/lib/store";

export const SPEEDS = [1, 5, 20] as const;
export type ReplaySpeed = (typeof SPEEDS)[number];
export const DEFAULT_SPEED: ReplaySpeed = 20;
/** How often the playhead moves. */
export const TICK_MS = 100;
/** Chunks loaded ahead of the one under the playhead. */
export const PREFETCH = 2;
/** Waits before each retry of a failed chunk. */
export const RETRY_DELAYS_MS = [1000, 2000, 4000] as const;

export const replayNotices = {
  loading: "Loading the replay…",
  playing: "Replaying from the match archive.",
  buffering: "Buffering…",
  unavailable: "Replay data unavailable.",
  finished: "Replay finished.",
  failed: "This replay can't be shown.",
} as const;

/** Why a replay can't start, from the manifest request (realtime.md §5.1 codes; anything else is "unreachable"). */
export type ReplayFailure = "not_found" | "not_finished" | "not_ready" | "unreachable";

export type ReplayState = {
  status: "loading" | "playing" | "paused" | "finished" | "failed";
  speed: ReplaySpeed;
  /** Match time reached, in match_ms. */
  playheadMs: number;
  manifest: ReplayManifest | null;
  /** Playing, but waiting for the next chunk to load. */
  buffering: boolean;
  /** A chunk the playhead needs could not be loaded; the player is paused until retry(). */
  chunkFailed: boolean;
  /** Set when status is "failed". */
  failure: ReplayFailure | null;
};

export type ReplayPlayer = {
  getState(): ReplayState;
  subscribe(listener: () => void): () => void;
  /** Loads the manifest and plays from kick-off. Safe to call again after stop(). */
  start(): void;
  /** Stops timers and fetches. Safe before start() and when called twice. */
  stop(): void;
  /** Resumes; after the end, plays again from kick-off; after a failed chunk, retries. */
  play(): void;
  pause(): void;
  setSpeed(speed: ReplaySpeed): void;
  /** Asks again for the chunks that failed, and plays on. */
  retry(): void;
  /** Clears the store and plays from kick-off. */
  restart(): void;
};

export type ReplayPlayerOptions = {
  /** Monotonic clock for the playhead. */
  now?: () => number;
  /** The browser's wall time, stamped on rows. */
  wallClock?: () => number;
  onChunkRejected?: (index: number, samples: string[]) => void;
};

const initialState = (speed: ReplaySpeed): ReplayState => ({
  status: "loading",
  speed,
  playheadMs: 0,
  manifest: null,
  buffering: false,
  chunkFailed: false,
  failure: null,
});

function failureOf(error: unknown): ReplayFailure {
  if (error instanceof ReplayError && error.kind === "http") {
    if (error.code === "not_found" || error.code === "not_finished" || error.code === "not_ready") return error.code;
  }
  return "unreachable";
}

export function createReplayPlayer(
  store: MatchStore,
  client: ReplayClient,
  matchId: string,
  options: ReplayPlayerOptions = {},
): ReplayPlayer {
  const now = options.now ?? (() => performance.now());
  const wallClock = options.wallClock ?? (() => Date.now());
  const onChunkRejected =
    options.onChunkRejected ?? ((index, samples) => console.warn(`Replay chunk ${index}: ${samples[0] ?? "rejected"}`));

  let state = initialState(DEFAULT_SPEED);
  const listeners = new Set<() => void>();
  let generation = 0;
  let abort: AbortController | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  const retryTimers = new Set<ReturnType<typeof setTimeout>>();

  // Where the playhead is in the chunks
  let current = 0;
  let cursor = 0;
  let lastTick: number | null = null;
  const loaded = new Map<number, ParsedEnvelope[]>();
  const inFlight = new Set<number>();
  const failed = new Set<number>();

  function set(next: Partial<ReplayState>) {
    state = { ...state, ...next };
    for (const listener of listeners) listener();
  }

  function stopTimers() {
    if (interval !== null) clearInterval(interval);
    interval = null;
    for (const timer of retryTimers) clearTimeout(timer);
    retryTimers.clear();
  }

  function fetchChunk(index: number, attempt: number) {
    const run = generation;
    inFlight.add(index);
    client.chunk(matchId, index, abort?.signal).then(
      (data) => {
        if (run !== generation) return;
        inFlight.delete(index);
        if (data.rejected.count > 0) {
          store.addRejected(data.rejected.count);
          onChunkRejected(index, data.rejected.samples);
        }
        loaded.set(index, data.envelopes);
        if (index === current) tick();
      },
      (error: unknown) => {
        if (run !== generation || (error instanceof ReplayError && error.kind === "aborted")) return;
        if (attempt < RETRY_DELAYS_MS.length) {
          const timer = setTimeout(() => {
            retryTimers.delete(timer);
            if (run === generation) fetchChunk(index, attempt + 1);
          }, RETRY_DELAYS_MS[attempt]);
          retryTimers.add(timer);
          return;
        }
        inFlight.delete(index);
        failed.add(index);
        if (index === current) chunkUnavailable();
      },
    );
  }

  /** Keeps the chunk under the playhead and the next PREFETCH loading. */
  function prefetch() {
    const chunks = state.manifest?.chunks ?? [];
    for (let i = current; i <= current + PREFETCH && i < chunks.length; i++) {
      if (!loaded.has(i) && !inFlight.has(i) && !failed.has(i)) fetchChunk(i, 0);
    }
  }

  function chunkUnavailable() {
    lastTick = null;
    set({ status: "paused", buffering: false, chunkFailed: true });
    store.setNotice(replayNotices.unavailable, "warning");
  }

  function finish() {
    stopTimers();
    lastTick = null;
    set({ status: "finished", buffering: false, playheadMs: state.manifest?.duration_ms ?? state.playheadMs });
    store.setConnection("finished");
    store.setNotice(replayNotices.finished);
    store.flush();
  }

  function tick() {
    const manifest = state.manifest;
    if (state.status !== "playing" || manifest === null) return;
    const at = now();
    const elapsed = lastTick === null ? 0 : Math.max(0, at - lastTick);
    lastTick = at;

    let playhead = Math.min(state.playheadMs + elapsed * state.speed, manifest.duration_ms);
    let buffering = false;
    const wall = wallClock();
    while (current < manifest.chunks.length) {
      const envelopes = loaded.get(current);
      if (!envelopes) {
        if (failed.has(current)) {
          set({ playheadMs: Math.min(playhead, manifest.chunks[current].from_ms) });
          chunkUnavailable();
          return;
        }
        // Wait at the start of the chunk that hasn't loaded yet
        playhead = Math.min(playhead, manifest.chunks[current].from_ms);
        buffering = true;
        break;
      }
      // Once the playhead reaches a chunk's end, what is left in it goes in too: the panel sent for a PeriodEnd is
      // stamped up to a second after the whistle, past the playhead's stop at full time (realtime.md §5.2)
      const ended = playhead >= manifest.chunks[current].to_ms - 1;
      while (cursor < envelopes.length && (ended || envelopes[cursor].match_ms <= playhead)) {
        store.ingest(envelopes[cursor], wall);
        cursor++;
      }
      if (cursor < envelopes.length) break;
      loaded.delete(current);
      current++;
      cursor = 0;
      prefetch();
    }

    if (current >= manifest.chunks.length) {
      finish();
      return;
    }
    if (buffering !== state.buffering) store.setNotice(buffering ? replayNotices.buffering : replayNotices.playing);
    if (playhead !== state.playheadMs || buffering !== state.buffering) set({ playheadMs: playhead, buffering });
  }

  const player: ReplayPlayer = {
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    start() {
      player.stop();
      const run = ++generation;
      abort = new AbortController();
      current = 0;
      cursor = 0;
      lastTick = null;
      loaded.clear();
      inFlight.clear();
      failed.clear();
      store.reset();
      store.setConnection("connecting");
      store.setNotice(replayNotices.loading);
      set(initialState(state.speed));
      interval = setInterval(tick, TICK_MS);

      client.manifest(matchId, abort.signal).then(
        (manifest) => {
          if (run !== generation) return;
          lastTick = now();
          set({ status: "playing", manifest, buffering: true });
          store.setConnection("live");
          store.setNotice(replayNotices.buffering);
          prefetch();
        },
        (error: unknown) => {
          if (run !== generation || (error instanceof ReplayError && error.kind === "aborted")) return;
          stopTimers();
          set({ status: "failed", failure: failureOf(error) });
          store.setNotice(replayNotices.failed, "warning");
        },
      );
    },

    stop() {
      generation++;
      abort?.abort();
      abort = null;
      stopTimers();
      lastTick = null;
      inFlight.clear();
    },

    play() {
      if (state.status === "finished") return player.restart();
      if (state.chunkFailed) return player.retry();
      if (state.status !== "paused") return;
      lastTick = now();
      set({ status: "playing" });
      store.setNotice(replayNotices.playing);
    },

    pause() {
      if (state.status !== "playing") return;
      tick();
      if (state.status !== "playing") return;
      lastTick = null;
      set({ status: "paused", buffering: false });
    },

    setSpeed(speed) {
      if (speed === state.speed) return;
      if (state.status === "playing") tick(); // the time so far counts at the old speed
      set({ speed });
    },

    retry() {
      if (!state.chunkFailed) return;
      failed.clear();
      lastTick = now();
      set({ status: "playing", chunkFailed: false, buffering: true });
      store.setNotice(replayNotices.buffering);
      prefetch();
    },

    restart() {
      player.start();
    },
  };

  return player;
}
