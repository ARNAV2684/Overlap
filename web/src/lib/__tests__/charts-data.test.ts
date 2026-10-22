import { describe, expect, it } from "vitest";
import type { TrackingFrame } from "@/lib/contracts";
import { heatGrid, keyEvents, momentumSeries, passLines, playerNumbers, teamShots } from "@/lib/live/charts";
import { createMatchMemory, HEAT_COLS, HEAT_ROWS } from "@/lib/live/match-memory";
import { MATCH, eventEnv, makeFrame, makeHeavy, makeSetup, statsEnv } from "./fixtures";

const setup = makeSetup();

describe("momentumSeries", () => {
  it("orders both halves and lets the live bucket replace its stale copy", () => {
    const memory = createMatchMemory();
    memory.ingest(statsEnv(1, 3_000_000, makeHeavy()));
    memory.ingest(statsEnv(2, 3_001_000, undefined, { momentum: { period: 2, bucket: 3, home: 11, away: 1 } }));
    const series = momentumSeries(memory);
    expect(series[0]).toMatchObject({ period: 1, bucket: 0 });
    expect(series.at(-1)).toMatchObject({ period: 2, bucket: 3, home: 11, label: "60′" });
  });
});

describe("event charts", () => {
  const events = [
    eventEnv(1, { type: "Shot", shot_outcome: "goal", situation: "open_play", x: 90, y: 50, player_id: "NBR-09", assisted_by: "NBR-11", key_pass_event_id: "SYN-0042-00002" }),
    eventEnv(2, { event_id: "SYN-0042-00002", type: "Pass", x: 60, y: 20, end_x: 85, end_y: 45, player_id: "NBR-11" }),
    eventEnv(3, { type: "Pass", x: 30, y: 50, end_x: 35, end_y: 60, outcome: "fail", receiver_id: undefined, player_id: "NBR-11" }),
    eventEnv(4, { type: "Card", card: "yellow", team_id: "HBA", player_id: "HBA-04", receiver_id: undefined, outcome: undefined }),
    eventEnv(5, { type: "TakeOn", outcome: "success", player_id: "NBR-11", receiver_id: undefined }),
  ].map((e) => (e.kind === "event" ? e.data : null)!);

  it("lists a team's shots in its own frame", () => {
    expect(teamShots(events, "NBR")).toEqual([expect.objectContaining({ outcome: "goal", x: 90, y: 50 })]);
    expect(teamShots(events, "HBA")).toHaveLength(0);
  });

  it("marks key and progressive passes", () => {
    const lines = passLines(events, { playerId: "NBR-11" });
    expect(lines).toHaveLength(2);
    expect(lines.find((l) => l.key)).toMatchObject({ ok: true, progressive: true });
    expect(lines.find((l) => !l.ok)).toBeTruthy();
  });

  it("builds key events with names", () => {
    const keys = keyEvents(events, setup);
    expect(keys.map((k) => k.kind)).toEqual(["goal", "yellow"]);
    expect(keys[0].text).toMatch(/Nora 9 · assist Nora 11/);
    expect(keys[1].side).toBe("away");
  });

  it("counts a player's numbers, with tracking from the heavy block", () => {
    const env = statsEnv(1, 1, makeHeavy());
    if (env.kind !== "stats") throw new Error("not a stats envelope");
    const n = playerNumbers(events, "NBR-11", env.data);
    expect(n).toMatchObject({ passes: 2, passPct: 50, takeOns: 1, takeOnsWon: 1, distanceKm: 7.21, topSpeedKmh: 33.4, sprints: 14 });
  });
});

describe("heatGrid", () => {
  it("turns each period into the team's own frame and normalises", () => {
    const memory = createMatchMemory();
    memory.setSetup(setup);
    const at = (ms: number, period: number, x: number, y: number): TrackingFrame =>
      makeFrame({ match_ms: ms, period, players: [{ player_id: "NBR-11", x, y, speed_kmh: 0, dist_m: 0 }] });
    // Period 1 (home attacks east) near the east goal, period 2 (home attacks west) near the west goal: same spot for the team
    for (let s = 0; s < 10; s++) {
      memory.ingest({ seq: s + 1, kind: "positions", match_id: MATCH, match_ms: s * 1000, clock: "0:00", data: { frames: [at(s * 1000, 1, 95, 10)] } });
      memory.ingest({ seq: s + 100, kind: "positions", match_id: MATCH, match_ms: 3_000_000 + s * 1000, clock: "50:00", data: { frames: [at(3_000_000 + s * 1000, 2, 5, 90)] } });
    }
    const grid = heatGrid(memory, ["NBR-11"], "home");
    const hottest = grid.indexOf(Math.max(...grid));
    // Smoothing can move the peak one cell in from the edge
    expect(hottest % HEAT_COLS).toBeGreaterThanOrEqual(HEAT_COLS - 2);
    expect(Math.floor(hottest / HEAT_COLS)).toBeLessThanOrEqual(Math.floor(0.1 * HEAT_ROWS) + 1);
    expect(Math.max(...grid)).toBeCloseTo(1);
  });
});
