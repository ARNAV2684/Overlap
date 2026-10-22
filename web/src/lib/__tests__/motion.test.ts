import { describe, expect, it } from "vitest";
import { blendFrames, createMotion, LAG_WALL_MS } from "@/lib/live/motion";
import { makeFrame } from "./fixtures";

const frame = (ms: number, x: number, period = 1) =>
  makeFrame({
    match_ms: ms,
    period,
    ball: { x, y: 50, z: 0, speed_kmh: 10 },
    players: [{ player_id: "NBR-11", x, y: 40, speed_kmh: 20, dist_m: 0 }],
  });

describe("blendFrames", () => {
  it("interpolates the ball and every player between two frames", () => {
    const s = blendFrames(frame(1000, 10), frame(1200, 20), 1100);
    expect(s.matchMs).toBe(1100);
    expect(s.ball.x).toBeCloseTo(15);
    expect(s.players.get("NBR-11")?.x).toBeCloseTo(15);
  });

  it("returns the frame itself for one frame, without recursing", () => {
    const f = frame(1000, 10);
    const s = blendFrames(f, f, 1000);
    expect(s.ball.x).toBe(10);
    expect(s.players.get("NBR-11")?.x).toBe(10);
  });

  it("never blends across periods: the later frame wins", () => {
    const s = blendFrames(frame(2_700_000, 90, 1), frame(2_700_200, 10, 2), 2_700_100);
    expect(s.ball.x).toBe(10);
    expect(s.period).toBe(2);
  });

  it("drops a player who is in the earlier frame only", () => {
    const a = makeFrame({ match_ms: 0, players: [{ player_id: "NBR-11", x: 1, y: 1, speed_kmh: 0, dist_m: 0 }] });
    const b = makeFrame({ match_ms: 200, players: [] });
    expect(blendFrames(a, b, 100).players.size).toBe(0);
  });
});

describe("createMotion", () => {
  it("is empty before the first frame", () => {
    expect(createMotion().sample(0)).toBeNull();
  });

  it("learns the playback speed and plays a little behind the newest frame", () => {
    const m = createMotion();
    // 20×: one match second (5 frames) every 50 wall ms, sampled at 60 frames a second
    let sample = null;
    let second = 0;
    for (let wall = 0; wall <= 3000; wall += 1) {
      if (wall % 50 === 0) {
        for (let f = 0; f < 5; f++) m.push(frame(second * 1000 + f * 200, second), wall);
        second++;
      }
      if (wall % 16 === 0) sample = m.sample(wall);
    }
    expect(sample!.rate).toBeGreaterThan(15);
    expect(sample!.rate).toBeLessThan(25);
    const lag = m.newestMs()! - sample!.matchMs;
    // About LAG_WALL_MS of wall time at 20×
    expect(lag).toBeGreaterThan(LAG_WALL_MS * 20 * 0.4);
    expect(lag).toBeLessThan(LAG_WALL_MS * 20 * 1.8);
  });

  it("plays on to the newest frame when frames stop coming, then stops", () => {
    const m = createMotion();
    for (let s = 0; s <= 10; s++) m.push(frame(s * 1000, s), s * 1000);
    let last = null;
    for (let wall = 10_000; wall <= 20_000; wall += 16) last = m.sample(wall);
    expect(last!.matchMs).toBe(10_000);
    expect(last!.rate).toBe(0);
  });

  it("starts again when the source goes back in time (a replay restart)", () => {
    const m = createMotion();
    m.push(frame(600_000, 50), 0);
    m.push(frame(1000, 5), 10);
    expect(m.newestMs()).toBe(1000);
  });
});
