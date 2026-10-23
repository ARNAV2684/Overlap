// ball-flight.ts — The ball in three dimensions
//
// Purpose: where the ball is, in x, y and height, for the 3D pitch:
//            ballTrack   smooth arcs through the tracked ball (5 Hz, with real heights for lofted balls), without
//                        flying across the pitch when the ball is reset (a kick-off after a goal, a restart)
//            shotFlight  a shot flown from the shooter to the exact point it crossed the goal line (the event's
//                        goal_mouth_y and goal_mouth_z), at its real speed, ending by its outcome
// Inputs:  tracking frames (CONTRACTS.md §4, pitch frame), Shot events (§3, team frame), which way each team attacks
// Outputs: createBallTrack(), shotFlight(), flightAt(); BallPoint, ShotFlight
// Spec:    web/specs/pitch.md §6
//
// Pure: no three.js. Positions are in the pitch frame (x, y 0–100) with z in metres, the same as tracking. Only what
// the data contains is drawn in 3D: tracked heights and shot events; nothing is invented.

import type { MatchEvent, TrackingFrame } from "@/lib/contracts";
import { teamToPitch } from "@/lib/coordinates";

export type BallPoint = { x: number; y: number; z: number };

/** Metres per pitch unit, along and across. */
const MX = 1.05;
const MY = 0.68;
/** A jump longer than this between two frames 0.2 s apart (over 90 m/s) is a reset, not a kick: snap, don't fly. */
export const TELEPORT_M = 18;
const KEEP_MS = 20_000;

const dist = (a: BallPoint, b: BallPoint) => Math.hypot((b.x - a.x) * MX, (b.y - a.y) * MY);

/** Catmull-Rom between p1 and p2 at t, with p0 and p3 as neighbours. */
const cr = (p0: number, p1: number, p2: number, p3: number, t: number) =>
  0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t);

type Sample = BallPoint & { ms: number; period: number };

export type BallTrack = {
  push(frame: TrackingFrame): void;
  /** The ball at match ms `ms`, smoothed, or null before any frame. */
  at(ms: number): BallPoint | null;
  reset(): void;
};

export function createBallTrack(): BallTrack {
  let s: Sample[] = [];

  const index = (ms: number) => {
    let lo = 0;
    let hi = s.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (s[mid].ms <= ms) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found;
  };
  /** A neighbour for the spline: itself when the neighbour is across a reset or another period. */
  const neighbour = (from: Sample, to: Sample | undefined) => (!to || to.period !== from.period || dist(from, to) > TELEPORT_M ? from : to);

  return {
    reset() {
      s = [];
    },
    push(frame) {
      const p: Sample = { ms: frame.match_ms, period: frame.period, x: frame.ball.x, y: frame.ball.y, z: Math.max(0, frame.ball.z) };
      if (s.length && p.ms < s[s.length - 1].ms - 5000) s = [];
      if (!s.length || p.ms > s[s.length - 1].ms) s.push(p);
      else {
        const i = index(p.ms);
        if (i >= 0 && s[i].ms === p.ms) s[i] = p;
        else s.splice(i + 1, 0, p);
      }
      if (s[0].ms < p.ms - KEEP_MS) s = s.slice(index(p.ms - KEEP_MS));
    },
    at(ms) {
      if (!s.length) return null;
      const i = index(ms);
      if (i < 0) return { x: s[0].x, y: s[0].y, z: s[0].z };
      const a = s[i];
      const b = s[i + 1];
      if (!b || b.period !== a.period) return { x: a.x, y: a.y, z: a.z };
      const t = Math.min(1, Math.max(0, (ms - a.ms) / (b.ms - a.ms)));
      // A reset: hold, then appear at the new spot
      if (dist(a, b) > TELEPORT_M) return t < 0.5 ? { x: a.x, y: a.y, z: a.z } : { x: b.x, y: b.y, z: b.z };
      const p0 = neighbour(a, s[i - 1]);
      const p3 = neighbour(b, s[i + 2]);
      return {
        x: cr(p0.x, a.x, b.x, p3.x, t),
        y: cr(p0.y, a.y, b.y, p3.y, t),
        // Heights follow the arc; a ball on the ground stays on it
        z: a.z === 0 && b.z === 0 ? 0 : Math.max(0, cr(p0.z, a.z, b.z, p3.z, t)),
      };
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------------------------------------------

export type ShotOutcome = NonNullable<MatchEvent["shot_outcome"]>;

export type ShotFlight = {
  id: string;
  outcome: ShotOutcome;
  /** Match ms the ball is struck, and when the flight hands the ball back to tracking. */
  startMs: number;
  endMs: number;
  /** Flight points in the pitch frame, z in metres, evenly spaced in time from startMs to endMs. */
  path: BallPoint[];
};

/** Goal-mouth width in team-frame y units (7.32 m of 68). */
const MOUTH_W = (7.32 / 68) * 100;
/** How long the ball sits in the net after a goal before tracking takes over again (the kick-off reset). */
const NET_HOLD_MS = 1600;

/**
 * A shot as a 3D flight. `attacksEast` says which way the shooting team attacks in the shot's period. Returns null
 * for a shot without a position. The path crosses the goal line exactly at goal_mouth_y (0–100 across the goal, from
 * the shooting team's left) and goal_mouth_z (metres); without them it aims at the centre, low.
 */
export function shotFlight(shot: MatchEvent, attacksEast: boolean): ShotFlight | null {
  if (shot.type !== "Shot" || shot.x === undefined || shot.y === undefined) return null;
  const outcome = shot.shot_outcome ?? "missed";
  const header = shot.body_part === "head";
  const speed = Math.max(8, ((shot.shot_speed_kmh ?? (header ? 55 : 90)) * 1000) / 3600);
  // Team frame: the goal line is x = 100
  const start = { x: shot.x, y: shot.y, z: header ? 2.1 : 0.15 };
  const mouthY = 50 - MOUTH_W / 2 + ((shot.goal_mouth_y ?? 50) / 100) * MOUTH_W;
  const mouthZ = Math.max(0.12, shot.goal_mouth_z ?? 0.4);
  const line = { x: 100, y: mouthY, z: mouthZ };
  const legM = Math.hypot((line.x - start.x) * MX, (line.y - start.y) * MY);
  // Lift in the middle of the flight: a driven shot rises a little; a long shot, or one aimed high, more
  const lift = header ? 0.15 : Math.min(2.4, 0.2 + legM * 0.035 + Math.max(0, mouthZ - 1.5) * 0.35);

  const pts: BallPoint[] = [];
  const along = (t: number, until: number) => {
    const k = t * until;
    return {
      x: start.x + (line.x - start.x) * k,
      y: start.y + (line.y - start.y) * k,
      z: Math.max(0, start.z + (line.z - start.z) * k + lift * 4 * k * (1 - k)),
    };
  };
  const STEPS = 18;
  let flightS = legM / speed;
  let tail: BallPoint[] = [];
  let holdMs = 250;

  if (outcome === "blocked") {
    // Stopped a few metres out, then knocked aside
    const until = Math.min(0.45, Math.max(3 / Math.max(legM, 3), 0.25));
    for (let i = 0; i <= STEPS; i++) pts.push(along(i / STEPS, until));
    flightS *= until;
    const hit = pts[pts.length - 1];
    tail = [1, 2, 3].map((k) => ({ x: hit.x - k * 0.9, y: hit.y + k * 1.4, z: Math.max(0, hit.z * (1 - k / 3)) }));
  } else {
    for (let i = 0; i <= STEPS; i++) pts.push(along(i / STEPS, outcome === "saved" ? 0.97 : 1));
    const end = pts[pts.length - 1];
    if (outcome === "goal") {
      // Into the net: on through the line to the back, falling
      tail = [0.5, 1, 1.5].map((m) => ({ x: 100 + m / MX, y: end.y, z: Math.max(0.1, end.z * (1 - m / 2.4)) }));
      holdMs = NET_HOLD_MS;
    } else if (outcome === "missed") {
      // Wide or over: carries on past the line
      const dx = (line.x - start.x) / legM;
      const dy = (line.y - start.y) / legM;
      tail = [2, 4, 6].map((m) => ({ x: end.x + dx * m, y: end.y + dy * m, z: end.z + m * 0.25 }));
    } else if (outcome === "woodwork") {
      // Off the frame and back into play
      tail = [1, 2, 3].map((m) => ({ x: 100 - (m * 2) / MX, y: end.y + m * 0.8, z: Math.max(0, end.z - m * 0.6) }));
    } else {
      // Saved: the keeper holds it and it drops to his feet
      tail = [{ x: end.x - 0.4, y: end.y, z: Math.max(0, end.z * 0.5) }, { x: end.x - 0.6, y: end.y, z: 0 }];
    }
  }
  const all = [...pts, ...tail].map((p) => {
    const q = teamToPitch({ x: p.x, y: p.y }, attacksEast);
    return { x: q.x, y: q.y, z: p.z };
  });
  // The tail plays out at the same pace as the strike's last steps
  const flightMs = Math.max(120, flightS * 1000) * (all.length - 1) / STEPS;
  return { id: shot.event_id, outcome, startMs: shot.match_ms, endMs: shot.match_ms + flightMs + holdMs, path: all };
}

/** The ball on a shot's flight at `ms`, or null outside it. After the path ends the ball rests at its last point. */
export function flightAt(f: ShotFlight, ms: number): BallPoint | null {
  if (ms < f.startMs || ms > f.endMs) return null;
  const pathMs = (f.endMs - f.startMs) - (f.outcome === "goal" ? NET_HOLD_MS : 250);
  const u = Math.min(1, (ms - f.startMs) / Math.max(1, pathMs)) * (f.path.length - 1);
  const i = Math.min(f.path.length - 2, Math.floor(u));
  const t = u - i;
  const a = f.path[i];
  const b = f.path[i + 1];
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
}
