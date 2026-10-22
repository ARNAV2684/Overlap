// motion.ts — Smooth playback of tracking frames
//
// Purpose: turn 5 Hz tracking frames that arrive in bursts (one bundle per match second, so ~20 bundles a second at
//          20×) into a smooth playhead and interpolated positions for every animation frame
// Inputs:  frames (CONTRACTS.md §4, pitch frame) and the browser's monotonic time in ms
// Outputs: createMotion(): push(), sample(), reset(); MotionSample
// Spec:    web/specs/pitch.md §2
//
// The playhead runs a little behind the newest frame (LAG_WALL_MS of wall time, whatever the speed) so there is
// always a later frame to interpolate towards. Its speed (match ms per wall ms) is learned from how fast frames
// arrive, so 1×, 5×, 20×, a paused replay and a live match all play correctly without being told. When frames stop
// (pause, end of match, a dropped connection) the playhead stops at the newest frame.
//
// Pure: no DOM, no React. Time is passed in, so tests can drive it.

import type { TrackingFrame } from "@/lib/contracts";

/** How far behind the newest frame the playhead runs, in wall-clock ms. */
export const LAG_WALL_MS = 450;
/** Frames kept, in match ms: enough for the story director's look-backs is kept elsewhere; this is only for tweening. */
export const KEEP_MATCH_MS = 20_000;
/** A frame this far behind the newest means the source went back in time (a replay restarted): start again. */
export const REWIND_MS = 5_000;
/** Beyond this error the playhead jumps instead of catching up. */
export const SNAP_MS = 6_000;

export type PlayerPose = {
  x: number;
  y: number;
  speedKmh: number;
};

export type MotionSample = {
  matchMs: number;
  period: number;
  ball: { x: number; y: number; z: number; speedKmh: number };
  players: Map<string, PlayerPose>;
  /** Match ms advanced per wall ms right now (0 when stopped). */
  rate: number;
};

export type Motion = {
  push(frame: TrackingFrame, wallNow: number): void;
  /** The interpolated state at the current playhead, or null before the first frame. */
  sample(wallNow: number): MotionSample | null;
  reset(): void;
  /** The newest frame's match ms, or null. */
  newestMs(): number | null;
};

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Index of the last frame with match_ms <= ms (frames sorted ascending), or -1. */
function floorIndex(frames: readonly TrackingFrame[], ms: number): number {
  let lo = 0;
  let hi = frames.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].match_ms <= ms) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

/** Interpolates two frames. Different periods never blend: the later frame wins. */
export function blendFrames(a: TrackingFrame, b: TrackingFrame, ms: number): Omit<MotionSample, "rate"> {
  // One frame (or frames that must not blend): t = 1 takes the later frame as it is
  const single = a.period !== b.period || b.match_ms <= a.match_ms;
  const t = single ? 1 : Math.min(1, Math.max(0, (ms - a.match_ms) / (b.match_ms - a.match_ms)));
  if (single) a = b;
  const players = new Map<string, PlayerPose>();
  const after = new Map(b.players.map((p) => [p.player_id, p]));
  for (const p of a.players) {
    const q = after.get(p.player_id);
    // A player who left the pitch (substitution, red card) disappears at the later frame
    if (!q) continue;
    players.set(p.player_id, { x: lerp(p.x, q.x, t), y: lerp(p.y, q.y, t), speedKmh: lerp(p.speed_kmh, q.speed_kmh, t) });
  }
  for (const q of b.players) {
    if (!players.has(q.player_id) && t > 0.5) players.set(q.player_id, { x: q.x, y: q.y, speedKmh: q.speed_kmh });
  }
  return {
    matchMs: lerp(a.match_ms, b.match_ms, t),
    period: t < 1 ? a.period : b.period,
    ball: {
      x: lerp(a.ball.x, b.ball.x, t),
      y: lerp(a.ball.y, b.ball.y, t),
      z: lerp(a.ball.z, b.ball.z, t),
      speedKmh: lerp(a.ball.speed_kmh, b.ball.speed_kmh, t),
    },
    players,
  };
}

export function createMotion(): Motion {
  let frames: TrackingFrame[] = [];
  let playhead: number | null = null;
  let lastSample: number | null = null;
  /** Match ms per wall ms, learned from arrivals. */
  let rate = 1;
  let lastArrival: { wall: number; ms: number } | null = null;
  let lastNewArrivalWall = 0;

  const newest = () => (frames.length ? frames[frames.length - 1].match_ms : null);

  function reset() {
    frames = [];
    playhead = null;
    lastSample = null;
    rate = 1;
    lastArrival = null;
  }

  return {
    reset,
    newestMs: newest,

    push(frame, wallNow) {
      const top = newest();
      if (top !== null && frame.match_ms < top - REWIND_MS) reset();
      const before = newest();
      // Keep sorted; frames almost always arrive in order, so this is usually a push
      if (!frames.length || frame.match_ms > frames[frames.length - 1].match_ms) frames.push(frame);
      else {
        const i = floorIndex(frames, frame.match_ms);
        if (i >= 0 && frames[i].match_ms === frame.match_ms) frames[i] = frame;
        else frames.splice(i + 1, 0, frame);
      }
      const after = newest()!;
      if (before === null || after > before) {
        // Learn the speed from bundle to bundle (a bundle is ~1 match second, so bursts average out)
        if (lastArrival && wallNow - lastArrival.wall >= 30) {
          const observed = (after - lastArrival.ms) / (wallNow - lastArrival.wall);
          if (observed > 0 && observed < 200) rate = rate * 0.7 + observed * 0.3;
          lastArrival = { wall: wallNow, ms: after };
        } else if (!lastArrival) lastArrival = { wall: wallNow, ms: after };
        lastNewArrivalWall = wallNow;
      }
      const floor = after - KEEP_MATCH_MS;
      if (frames[0].match_ms < floor) frames = frames.slice(Math.max(0, floorIndex(frames, floor)));
    },

    sample(wallNow) {
      if (!frames.length) return null;
      const top = frames[frames.length - 1].match_ms;
      const dt = lastSample === null ? 0 : Math.min(250, Math.max(0, wallNow - lastSample));
      lastSample = wallNow;
      // Frames stopped coming: let the playhead settle on the newest one and report a stop
      const stalled = wallNow - lastNewArrivalWall > Math.max(1500, LAG_WALL_MS * 3);
      const target = top - (stalled ? 0 : Math.max(200, LAG_WALL_MS * rate));
      if (playhead === null || Math.abs(target - playhead) > SNAP_MS * Math.max(1, rate / 5)) playhead = target;
      else {
        playhead += dt * (stalled ? 0 : rate);
        playhead += (target - playhead) * Math.min(1, dt / 600);
      }
      playhead = Math.min(playhead, top);
      if (playhead < frames[0].match_ms) playhead = frames[0].match_ms;

      const i = Math.max(0, floorIndex(frames, playhead));
      const a = frames[i];
      const b = frames[Math.min(i + 1, frames.length - 1)];
      return { ...blendFrames(a, b, playhead), rate: stalled ? 0 : rate };
    },
  };
}
