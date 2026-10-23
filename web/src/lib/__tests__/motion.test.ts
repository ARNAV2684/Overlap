import { describe, expect, it } from "vitest";
import { blendFrames, createMotion, LAG_WALL_MS, renderedTravel, followAlpha } from "@/lib/live/motion";
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


describe("rendered travel", () => {
  const sample = (ms: number, x: number, period = 1) => ({ ...blendFrames(frame(ms, x, period), frame(ms, x, period), ms), rate: 20 });
  it("keeps ball and player travel synchronized at the same displayed timestamp", () => {
    const a = sample(1000, 10), b = sample(1200, 11);
    const ball = renderedTravel(a, b), player = renderedTravel(a, b, "NBR-11");
    expect(ball).toEqual(player);
    expect(player.distance).toBeCloseTo(1.05);
    expect(player.speed).toBeCloseTo(5.25);
    // Arrival/playback rate must not alter distance or invent extra spin.
    expect(renderedTravel(a, { ...b, rate: 1 })).toEqual(ball);
  });
  it("does not animate travel on pause, rewind, period change or first sample", () => {
    const a = sample(1000, 10);
    for (const b of [a, sample(0, 20), sample(1200, 20, 2), sample(10000, 90)]) {
      expect(renderedTravel(a, b).distance).toBe(0);
    }
    expect(renderedTravel(null, a).distance).toBe(0);
    expect(renderedTravel(a, sample(1200, 11), "missing").distance).toBe(0);
  });
  it("follows consistently at 30 and 60 fps without a slow camera tail", () => {
    const follow = (fps: number) => {
      let x = 0;
      for (let i = 0; i < fps / 2; i++) x += (1 - x) * followAlpha(1 / fps, 12);
      return x;
    };
    expect(follow(30)).toBeCloseTo(follow(60), 10);
    expect(follow(60)).toBeGreaterThan(0.99);
  });
  it("does not move the playhead backwards when incoming cadence changes", () => {
    const m = createMotion();
    let previous = 0;
    for (let wall = 0; wall < 5000; wall += 16) {
      if (wall % 64 === 0) m.push(frame(wall * (wall < 2000 ? 1 : 5), wall / 100), wall);
      const s = m.sample(wall)!;
      expect(s.matchMs).toBeGreaterThanOrEqual(previous);
      previous = s.matchMs;
    }
  });
});
