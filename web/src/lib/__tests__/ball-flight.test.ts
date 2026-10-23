import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/lib/contracts";
import { createBallTrack, flightAt, shotFlight } from "@/lib/live/ball-flight";
import { makeEvent, makeFrame } from "./fixtures";

const frame = (ms: number, x: number, y: number, z = 0, period = 2) =>
  makeFrame({ match_ms: ms, period, ball: { x, y, z, speed_kmh: 30 } });

describe("createBallTrack", () => {
  it("returns null before any frame and holds the first frame before it", () => {
    const t = createBallTrack();
    expect(t.at(1000)).toBeNull();
    t.push(frame(1000, 40, 50));
    expect(t.at(500)).toEqual({ x: 40, y: 50, z: 0 });
  });

  it("passes through the tracked frames and moves smoothly between them", () => {
    const t = createBallTrack();
    [0, 200, 400, 600].forEach((ms, i) => t.push(frame(ms, 40 + i * 2, 50)));
    expect(t.at(200)!.x).toBeCloseTo(42);
    const mid = t.at(300)!;
    expect(mid.x).toBeGreaterThan(42);
    expect(mid.x).toBeLessThan(44);
    expect(mid.z).toBe(0);
  });

  it("follows a lofted ball's tracked height and never goes underground", () => {
    const t = createBallTrack();
    [0, 0, 6, 9, 6, 0, 0].forEach((z, i) => t.push(frame(i * 200, 30 + i * 3, 50, z)));
    expect(t.at(600)!.z).toBeCloseTo(9);
    expect(t.at(700)!.z).toBeGreaterThan(6);
    for (let ms = 0; ms <= 1200; ms += 25) expect(t.at(ms)!.z).toBeGreaterThanOrEqual(0);
  });

  it("snaps across a reset instead of flying the ball across the pitch", () => {
    const t = createBallTrack();
    t.push(frame(0, 98, 50));
    t.push(frame(200, 50, 50)); // the kick-off after a goal: 50 m in 0.2 s
    expect(t.at(80)).toEqual({ x: 98, y: 50, z: 0 });
    expect(t.at(120)).toEqual({ x: 50, y: 50, z: 0 });
  });

  it("does not blend across periods, and clears on a rewind", () => {
    const t = createBallTrack();
    t.push(frame(9000, 60, 50, 0, 1));
    t.push(frame(9200, 40, 50, 0, 2));
    expect(t.at(9100)).toEqual({ x: 60, y: 50, z: 0 });
    // A replay seeked back to the start (more than 5 s behind)
    t.push(frame(0, 10, 10));
    expect(t.at(9100)).toEqual({ x: 10, y: 10, z: 0 });
  });
});

const shot = (over: Partial<MatchEvent> = {}) =>
  makeEvent({ type: "Shot", x: 88, y: 50, match_ms: 10_000, shot_outcome: "saved", shot_speed_kmh: 90, receiver_id: undefined, outcome: undefined, ...over });

/** Where a flight crosses the goal line (x = 100 in the pitch frame for a team attacking east). */
const crossing = (path: { x: number; y: number; z: number }[]) => {
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    if (a.x <= 100 && b.x >= 100) {
      const t = b.x === a.x ? 0 : (100 - a.x) / (b.x - a.x);
      return { y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t };
    }
  }
  return null;
};

describe("shotFlight", () => {
  it("returns null for a shot without a position", () => {
    expect(shotFlight(shot({ x: undefined }), true)).toBeNull();
    expect(shotFlight(makeEvent({ type: "Pass" }), true)).toBeNull();
  });

  it("crosses the line at the event's goal-mouth point", () => {
    const f = shotFlight(shot({ shot_outcome: "goal", goal_mouth_y: 100, goal_mouth_z: 2.0 }), true)!;
    const c = crossing(f.path)!;
    // goal_mouth_y 100 is the far post: 50 + half the 7.32 m mouth across 68 m
    expect(c.y).toBeCloseTo(50 + (7.32 / 68) * 50, 1);
    expect(c.z).toBeCloseTo(2.0, 1);
  });

  it("mirrors the flight for a team attacking west", () => {
    const east = shotFlight(shot({ goal_mouth_y: 20 }), true)!;
    const west = shotFlight(shot({ goal_mouth_y: 20 }), false)!;
    expect(west.path[0]).toMatchObject({ x: 100 - east.path[0].x, y: 100 - east.path[0].y });
  });

  it("flies at the shot's speed: a harder shot arrives sooner", () => {
    const hard = shotFlight(shot({ shot_speed_kmh: 120 }), true)!;
    const soft = shotFlight(shot({ shot_speed_kmh: 50 }), true)!;
    expect(hard.endMs - hard.startMs).toBeLessThan(soft.endMs - soft.startMs);
  });

  it("ends by its outcome", () => {
    const goal = shotFlight(shot({ shot_outcome: "goal" }), true)!;
    expect(goal.path[goal.path.length - 1].x).toBeGreaterThan(100); // in the net
    const missed = shotFlight(shot({ shot_outcome: "missed", goal_mouth_y: 110 }), true)!;
    expect(missed.path[missed.path.length - 1].x).toBeGreaterThan(100); // on past the line
    const saved = shotFlight(shot({ shot_outcome: "saved" }), true)!;
    expect(saved.path[saved.path.length - 1].x).toBeLessThan(100);
    expect(saved.path[saved.path.length - 1].z).toBe(0);
    const blocked = shotFlight(shot({ shot_outcome: "blocked", x: 70 }), true)!;
    expect(Math.max(...blocked.path.map((p) => p.x))).toBeLessThan(90); // stopped well short
    const post = shotFlight(shot({ shot_outcome: "woodwork" }), true)!;
    expect(post.path[post.path.length - 1].x).toBeLessThan(100); // back into play
  });

  it("starts a header at head height and a kick near the grass", () => {
    expect(shotFlight(shot({ body_part: "head" }), true)!.path[0].z).toBeCloseTo(2.1);
    expect(shotFlight(shot({ body_part: "right_foot" }), true)!.path[0].z).toBeLessThan(0.3);
  });
});

describe("flightAt", () => {
  it("is null outside the flight and walks the path inside it", () => {
    const f = shotFlight(shot({ shot_outcome: "goal" }), true)!;
    expect(flightAt(f, f.startMs - 1)).toBeNull();
    expect(flightAt(f, f.endMs + 1)).toBeNull();
    expect(flightAt(f, f.startMs)).toMatchObject({ x: f.path[0].x, y: f.path[0].y });
    // After the path ends the ball rests in the net until the flight hands back
    const rest = flightAt(f, f.endMs)!;
    expect(rest.x).toBeCloseTo(f.path[f.path.length - 1].x);
  });
});
