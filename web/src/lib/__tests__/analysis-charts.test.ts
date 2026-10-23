// analysis-charts.test.ts — Data behind the analysis tabs
//
// Purpose: the xG race, thirds, busiest zones, attack by flank and zone dominance read the heavy block correctly:
//          totals carry through, frames are turned the right way, empty data gives empty answers
// Inputs:  hand-made grids and shots
// Outputs: pass / fail
// Spec:    web/specs/charts.md §4, §9, §11–§13

import { describe, expect, it } from "vitest";
import type { HeavyShot } from "@/lib/contracts";
import { busiestZones, dominance, flanks, thirds, xgRace, xgShots, zonesByColumn } from "@/lib/live/charts";

const shot = (ms: number, xg: number, y = 50, outcome: HeavyShot["outcome"] = "missed"): HeavyShot => ({
  event_id: `SYN-0001-${String(ms).padStart(5, "0").slice(-5)}`,
  player_id: "AAA-09",
  period: 1,
  match_ms: ms,
  x: 88,
  y,
  xg,
  outcome,
  situation: "open_play",
  body_part: "right_foot",
});

describe("xG race", () => {
  it("adds up shot by shot and runs to the current minute", () => {
    const steps = xgRace([shot(600_000, 0.3, 50, "goal"), shot(120_000, 0.1)], 30);
    expect(steps.map((s) => s.total)).toEqual([0, 0.1, 0.4, 0.4]);
    expect(steps[2].goal).toBe(true);
    expect(steps.at(-1)!.minute).toBe(30);
  });

  it("is absent on panels without heavy.shots", () => {
    expect(xgShots(null, "home")).toBeNull();
  });
});

describe("pressing thirds and busiest zones", () => {
  const grid = Array.from({ length: 9 }, (_, c) => Array.from({ length: 6 }, (_, r) => (c === 4 && r === 2 ? 10 : c < 3 ? 1 : 0)));
  it("splits a 9 × 6 grid into own, middle and final thirds", () => {
    const t = thirds(grid);
    expect(t.total).toBe(28);
    expect(t.own).toBeCloseTo(18 / 28);
    expect(t.middle).toBeCloseTo(10 / 28);
    expect(t.final).toBe(0);
  });
  it("names the busiest zone in football terms", () => {
    expect(busiestZones(grid, 1)).toEqual([{ key: "1:2", label: "Middle third · Centre-left", count: 10 }]);
  });
  it("lists each zone once, summing the cells that fall in it", () => {
    const zones = busiestZones(grid, 7);
    expect(new Set(zones.map((z) => z.label)).size).toBe(zones.length);
    // The own third spans three columns: each of its six lanes sums three cells of 1
    expect(zones.slice(1)).toEqual(expect.arrayContaining([{ key: "0:0", label: "Own third · Left wing", count: 3 }]));
    expect(zones.slice(1).every((z) => z.count === 3)).toBe(true);
  });
  it("is empty without actions", () => {
    expect(thirds([[0]]).total).toBe(0);
  });
});

describe("attack by flank", () => {
  // zones[channel][col]: the attacking half is columns 3–5
  const zones = [
    [9, 9, 9, 6, 0, 0],
    [0, 0, 0, 2, 0, 0],
    [0, 0, 0, 1, 1, 0],
  ];
  it("shares only the attacking half's touches, and puts each shot in its lane", () => {
    const f = flanks(zones, [shot(1, 0.2, 10), shot(2, 0.05, 90), shot(3, 0.15, 12)]);
    expect(f.map((l) => Math.round(l.touchShare * 100))).toEqual([60, 20, 20]);
    expect(f.map((l) => l.shots)).toEqual([2, 0, 1]);
    expect(f[0].xg).toBeCloseTo(0.35);
  });
  it("works without shots", () => {
    expect(flanks(zones, null).every((l) => l.shots === 0)).toBe(true);
  });
});

describe("zone dominance", () => {
  it("turns the away zones into the home frame before comparing", () => {
    const home = [
      [4, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    // The away team's final third, left channel, is the home team's own third, right channel
    const away = [
      [0, 0, 0, 0, 0, 3],
      [0, 0, 0, 0, 0, 0],
      [0, 0, 0, 0, 0, 0],
    ];
    const d = dominance(home, away);
    expect(d[0][0]).toBe(1);
    expect(d[0][2]).toBe(0);
    expect(d[3][1]).toBeNull();
  });
  it("lays touch zones out column first for the grid", () => {
    expect(zonesByColumn([[1, 2], [3, 4], [5, 6]])).toEqual([[1, 3, 5], [2, 4, 6]]);
  });
});
