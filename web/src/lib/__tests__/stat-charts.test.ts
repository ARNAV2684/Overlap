import { describe, expect, it } from "vitest";
import type { HeavyStatPanel } from "@/lib/contracts";
import {
  bucketLabel,
  busiestChannel,
  cellRect,
  gridMax,
  homeShare,
  networkGeometry,
  NOT_ENOUGH_DATA,
  pressingGrid,
  statRows,
  thirdsOf,
  tideMax,
  tideSeries,
  topPasser,
  zoneGrid,
} from "@/lib/stat-charts";
import type { PlayerInfo } from "@/lib/store";
import { countGrid, makeHeavy, makePanel } from "./fixtures";

const heavyPanel = (matchMs = 3_840_000): HeavyStatPanel =>
  makePanel({ match_ms: matchMs, clock: "62:00", heavy: makeHeavy() }) as HeavyStatPanel;

describe("statRows", () => {
  it("formats each team's numbers and gives the more-is-more rows a home share", () => {
    const rows = statRows(makePanel());
    const row = (key: string) => rows.find((r) => r.key === key)!;
    expect(row("possession_pct")).toMatchObject({ label: "Possession", home: "58%", away: "42%", share: 0.58 });
    expect(row("xg")).toMatchObject({ home: "1.42", away: "0.38" });
    expect(row("press_height_last_10min_m")).toMatchObject({ home: "52 m", away: "38 m", share: null });
    expect(row("ppda_last_10min")).toMatchObject({ home: "7.5", away: "14.2", share: null });
    expect(rows).toHaveLength(10);
  });

  it("shows a null value as not enough data, never zero, and draws no bar for it", () => {
    const panel = makePanel({ low_sample: ["teams.away.pass_completion_pct"] });
    panel.teams.away.pass_completion_pct = null;
    const row = statRows(panel).find((r) => r.key === "pass_completion_pct")!;
    expect(row).toMatchObject({ home: "83%", away: NOT_ENOUGH_DATA, share: null });
  });

  it("draws no bar when both sides are 0", () => {
    expect(homeShare(0, 0)).toBeNull();
    expect(homeShare(3, 1)).toBe(0.75);
    expect(homeShare(null, 1)).toBeNull();
  });
});

describe("tideSeries", () => {
  it("takes every heavy bucket and lets the light panel's current bucket replace its own", () => {
    const latest = makePanel({ match_ms: 3_854_000, momentum: { period: 2, bucket: 3, home: 9.5, away: 3 } });
    const series = tideSeries(latest, heavyPanel());
    expect(series).toHaveLength(14);
    expect(series.at(-1)).toEqual({ period: 2, bucket: 3, home: 9.5, away: 3 });
    expect(series[0]).toMatchObject({ period: 1, bucket: 0 });
  });

  it("adds a new current bucket after the heavy ones, in order", () => {
    const latest = makePanel({ momentum: { period: 2, bucket: 4, home: 1, away: 0 } });
    expect(tideSeries(latest, heavyPanel()).slice(-2).map((b) => b.bucket)).toEqual([3, 4]);
  });

  it("works with only a light panel, or nothing", () => {
    expect(tideSeries(makePanel(), null)).toEqual([makePanel().momentum]);
    expect(tideSeries(null, null)).toEqual([]);
  });

  it("scales to the largest value, at least 1", () => {
    expect(tideMax(tideSeries(null, heavyPanel()))).toBe(7);
    expect(tideMax([])).toBe(1);
  });

  it("labels a spell by its minutes, and stoppage time with a plus", () => {
    expect(bucketLabel({ period: 1, bucket: 2 })).toBe("1st half 10–15′");
    expect(bucketLabel({ period: 2, bucket: 0 })).toBe("2nd half 45–50′");
    expect(bucketLabel({ period: 1, bucket: 9 })).toBe("1st half 45+′");
    expect(bucketLabel({ period: 2, bucket: 9 })).toBe("2nd half 90+′");
  });
});

describe("grids", () => {
  it("reads the pressing grid as [col][row] and the zones as [channel][col]", () => {
    const pressing = pressingGrid(countGrid(9, 6, { "7,1": 12 }));
    expect(pressing).toMatchObject({ cols: 9, rows: 6 });
    expect(pressing.cells.find((c) => c.count > 0)).toEqual({ col: 7, row: 1, count: 12 });

    const zones = zoneGrid(countGrid(3, 6, { "2,5": 4 }));
    expect(zones).toMatchObject({ cols: 6, rows: 3 });
    expect(zones.cells.find((c) => c.count > 0)).toEqual({ col: 5, row: 2, count: 4 });
  });

  it("places cells attacking left to right, the team's left at the top", () => {
    const grid = { cols: 9, rows: 6 };
    expect(cellRect({ col: 0, row: 0 }, grid)).toEqual({ x: 0, y: 0, width: 105 / 9, height: 68 / 6 });
    const last = cellRect({ col: 8, row: 5 }, grid);
    expect(last.x + last.width).toBeCloseTo(105);
    expect(last.y + last.height).toBeCloseTo(68);
  });

  it("sums counts by third and finds the busiest cell and channel", () => {
    const heavy = makeHeavy();
    const pressing = pressingGrid(heavy.pressing_grid.home);
    expect(thirdsOf(pressing)).toEqual({ total: 20, own: 2, middle: 6, attacking: 12 });
    expect(gridMax(pressing)).toBe(12);

    const zones = zoneGrid(heavy.zones.home);
    expect(thirdsOf(zones)).toEqual({ total: 70, own: 5, middle: 25, attacking: 40 });
    expect(busiestChannel(zones)).toBe("left");
    expect(busiestChannel(zoneGrid(countGrid(3, 6)))).toBeNull();
  });
});

describe("networkGeometry", () => {
  const players: ReadonlyMap<string, PlayerInfo> = new Map([
    ["NBR-11", { player_id: "NBR-11", name: "Nora 11", pos: "LW", shirt: 11, team_id: "NBR", side: "home" as const }],
  ]);

  it("places nodes in metres attacking left to right, sized by passes, with names where known", () => {
    const { nodes } = networkGeometry(makeHeavy().pass_network.home, players);
    const winger = nodes.find((n) => n.playerId === "NBR-11")!;
    expect(winger).toMatchObject({ name: "Nora 11", shirt: 11, passes: 42, r: 3 });
    expect(winger.x).toBeCloseTo(71 * 1.05);
    expect(winger.y).toBeCloseTo(14 * 0.68);
    expect(nodes.find((n) => n.playerId === "NBR-01")).toMatchObject({ name: "NBR-01", shirt: undefined });
    expect(topPasser(nodes)?.playerId).toBe("NBR-11");
  });

  it("scales links to the busiest and skips a link to a player with no node", () => {
    const network = makeHeavy().pass_network.home;
    network.links.push({ from: "NBR-04", to: "NBR-09", count: 5 });
    const { links } = networkGeometry(network, players);
    expect(links.map((l) => l.key)).toEqual(["NBR-04>NBR-11", "NBR-01>NBR-04"]);
    expect(links[0]).toMatchObject({ count: 9, width: 1.25, opacity: 0.9 });
    expect(links[1].width).toBeLessThan(links[0].width);
  });

  it("handles an empty network", () => {
    const { nodes, links } = networkGeometry({ nodes: [], links: [] }, players);
    expect(nodes).toEqual([]);
    expect(links).toEqual([]);
    expect(topPasser(nodes)).toBeNull();
  });
});
