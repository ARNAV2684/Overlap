// stat-charts.ts — Stat chart helpers
//
// Purpose: turn stat panels (CONTRACTS.md §7.4) into what the five panel charts draw: table rows with bar shares, the
//          momentum tide's buckets, grid cells and their thirds, and the pass network's geometry
// Inputs:  the store's stats slice (latest panel, latest heavy panel), the players from the setup
// Outputs: pure functions and their result types; no React
// Spec:    web/specs/charts.md §2 (charts fed by stat panels)
//
// Numbers come from the stats engine. Nothing here computes a stat: it picks which panel's values to show, scales them
// for drawing and sums counts for the accessible summaries. Team-frame data is drawn attacking left to right, so every
// point goes through teamToPitch(point, true) and pitchToSvg (coordinates.ts), never a hand-written flip.

import type {
  HeavyStatPanel,
  MomentumBucket,
  PassNetworkData,
  StatPanel,
  TeamPanel,
} from "@/lib/contracts";
import { PITCH_LENGTH_M, PITCH_WIDTH_M, pitchToSvg, teamToPitch, type Point } from "@/lib/coordinates";
import type { PlayerInfo } from "@/lib/store";

/** What a `null` (low-sample) value reads as. Never zero (CONTRACTS.md §7.4). */
export const NOT_ENOUGH_DATA = "Not enough data";
/** What a heavy-block chart says before the first heavy panel (the first whole match minute). */
export const FIRST_HEAVY_NOTE = "First update at the end of the first minute";

// ---------------------------------------------------------------------------------------------------------------
// Stat bars
// ---------------------------------------------------------------------------------------------------------------

type Metric = Exclude<keyof TeamPanel, "team_id">;

type StatRowSpec = {
  key: Metric;
  label: string;
  format: (value: number) => string;
  /** A split bar only where "more" means more of the thing; PPDA and press height would read the wrong way. */
  bar: boolean;
};

const whole = (v: number) => String(Math.round(v));
const percent = (v: number) => `${Math.round(v)}%`;
const fixed = (digits: number) => (v: number) => v.toFixed(digits);

export const STAT_ROWS: readonly StatRowSpec[] = [
  { key: "possession_pct", label: "Possession", format: percent, bar: true },
  { key: "shots", label: "Shots", format: whole, bar: true },
  { key: "shots_on_target", label: "Shots on target", format: whole, bar: true },
  { key: "xg", label: "xG", format: fixed(2), bar: true },
  { key: "passes", label: "Passes", format: whole, bar: true },
  { key: "pass_completion_pct", label: "Pass completion", format: percent, bar: true },
  { key: "momentum_share_last_10min_pct", label: "Momentum share, last 10 min", format: percent, bar: true },
  { key: "ppda_last_10min", label: "PPDA, last 10 min", format: fixed(1), bar: false },
  { key: "pressures_per_opp_pass_last_10min", label: "Pressures per opponent pass, last 10 min", format: fixed(2), bar: false },
  { key: "press_height_last_10min_m", label: "Press height, last 10 min", format: (v) => `${Math.round(v)} m`, bar: false },
];

export type StatRow = {
  key: Metric;
  label: string;
  home: string;
  away: string;
  /** The home team's share of the two values (0–1), or null when there is no bar for this row. */
  share: number | null;
};

/** The home share of two values, or null when either is missing or both are 0. */
export function homeShare(home: number | null, away: number | null): number | null {
  if (home === null || away === null || home < 0 || away < 0 || home + away <= 0) return null;
  return home / (home + away);
}

export function statRows(panel: StatPanel): StatRow[] {
  return STAT_ROWS.map(({ key, label, format, bar }) => {
    const home = panel.teams.home[key];
    const away = panel.teams.away[key];
    return {
      key,
      label,
      home: home === null ? NOT_ENOUGH_DATA : format(home),
      away: away === null ? NOT_ENOUGH_DATA : format(away),
      share: bar ? homeShare(home, away) : null,
    };
  });
}

// ---------------------------------------------------------------------------------------------------------------
// Momentum tide
// ---------------------------------------------------------------------------------------------------------------

const bucketKey = (b: Pick<MomentumBucket, "period" | "bucket">) => `${b.period}:${b.bucket}`;

/**
 * The tide's buckets in order: every bucket of the newest heavy panel, with the latest light panel's current bucket
 * replacing the one it names (or added after them), so the current spell moves every second.
 */
export function tideSeries(latest: StatPanel | null, heavy: HeavyStatPanel | null): MomentumBucket[] {
  const byKey = new Map<string, MomentumBucket>();
  for (const b of heavy?.heavy.momentum_buckets ?? []) byKey.set(bucketKey(b), b);
  if (latest && (heavy === null || latest.match_ms >= heavy.match_ms)) byKey.set(bucketKey(latest.momentum), latest.momentum);
  return [...byKey.values()].sort((a, b) => a.period - b.period || a.bucket - b.bucket);
}

/** The largest weighted value in the series, at least 1 so an all-zero tide still has a scale. */
export function tideMax(buckets: readonly MomentumBucket[]): number {
  return buckets.reduce((max, b) => Math.max(max, b.home, b.away), 1);
}

const PERIOD_NAMES: Record<number, string> = {
  1: "1st half",
  2: "2nd half",
  3: "Extra time, 1st half",
  4: "Extra time, 2nd half",
  5: "Shootout",
};

export const periodName = (period: number): string => PERIOD_NAMES[period] ?? `Period ${period}`;

/** "1st half 10–15′", or "1st half 45+′" for the spell after the period's normal length. */
export function bucketLabel(b: Pick<MomentumBucket, "period" | "bucket">): string {
  const [base, length] = b.period <= 2 ? [45 * (b.period - 1), 45] : [90 + 15 * (b.period - 3), 15];
  const from = b.bucket * 5;
  const minutes = from >= length ? `${base + length}+′` : `${base + from}–${base + from + 5}′`;
  return `${periodName(b.period)} ${minutes}`;
}

// ---------------------------------------------------------------------------------------------------------------
// Grids: pressing zones and touch zones
// ---------------------------------------------------------------------------------------------------------------

/** One cell of the team's own frame: `col` from its own goal, `row` from its left. */
export type GridCell = { col: number; row: number; count: number };
export type Grid = { cols: number; rows: number; cells: GridCell[] };

/** The pressing grid, sent as `[col][row]`. */
export function pressingGrid(grid: readonly (readonly number[])[]): Grid {
  const cells = grid.flatMap((column, col) => column.map((count, row) => ({ col, row, count })));
  return { cols: grid.length, rows: grid[0]?.length ?? 0, cells };
}

/** The touch zones, sent as `[channel][col]`: the channel is the row. */
export function zoneGrid(zones: readonly (readonly number[])[]): Grid {
  const cells = zones.flatMap((channel, row) => channel.map((count, col) => ({ col, row, count })));
  return { cols: zones[0]?.length ?? 0, rows: zones.length, cells };
}

export const gridMax = (grid: Grid): number => grid.cells.reduce((max, c) => Math.max(max, c.count), 0);

/** A cell's rectangle in SVG metres, the team attacking left to right. */
export function cellRect(cell: Pick<GridCell, "col" | "row">, grid: Pick<Grid, "cols" | "rows">) {
  const corner = pitchToSvg(teamToPitch({ x: (cell.col * 100) / grid.cols, y: (cell.row * 100) / grid.rows }, true));
  return { x: corner.x, y: corner.y, width: PITCH_LENGTH_M / grid.cols, height: PITCH_WIDTH_M / grid.rows };
}

export type Thirds = { total: number; own: number; middle: number; attacking: number };

/** Counts per third of the pitch length, from the team's own goal. */
export function thirdsOf(grid: Grid): Thirds {
  const out: Thirds = { total: 0, own: 0, middle: 0, attacking: 0 };
  for (const { col, count } of grid.cells) {
    const third = Math.min(2, Math.floor((col * 3) / grid.cols));
    out.total += count;
    out[third === 0 ? "own" : third === 1 ? "middle" : "attacking"] += count;
  }
  return out;
}

/** The busiest of the three channels (rows of the touch zones), or null when there are no touches. */
export function busiestChannel(grid: Grid): "left" | "centre" | "right" | null {
  const totals = [0, 0, 0];
  for (const { row, count } of grid.cells) totals[Math.min(2, row)] += count;
  const best = Math.max(...totals);
  if (best === 0) return null;
  return (["left", "centre", "right"] as const)[totals.indexOf(best)];
}

// ---------------------------------------------------------------------------------------------------------------
// Pass network
// ---------------------------------------------------------------------------------------------------------------

export type NetworkNode = Point & { playerId: string; name: string; shirt?: number; passes: number; r: number };
export type NetworkLink = {
  key: string;
  from: NetworkNode;
  to: NetworkNode;
  count: number;
  width: number;
  opacity: number;
};

const NODE_R = { min: 1.2, max: 3 };
const LINK_WIDTH = { min: 0.25, max: 1.25 };
const LINK_OPACITY = { min: 0.35, max: 0.9 };

/** Nodes at the mean pass-start positions (sized by the square root of passes) and links (scaled to the busiest). */
export function networkGeometry(
  network: PassNetworkData,
  players: ReadonlyMap<string, PlayerInfo>,
): { nodes: NetworkNode[]; links: NetworkLink[] } {
  const maxPasses = network.nodes.reduce((max, n) => Math.max(max, n.passes), 1);
  const nodes = network.nodes.map((n) => {
    const at = pitchToSvg(teamToPitch(n, true));
    const info = players.get(n.player_id);
    return {
      ...at,
      playerId: n.player_id,
      name: info?.name ?? n.player_id,
      shirt: info?.shirt,
      passes: n.passes,
      r: NODE_R.min + (NODE_R.max - NODE_R.min) * Math.sqrt(n.passes / maxPasses),
    };
  });
  const byId = new Map(nodes.map((n) => [n.playerId, n]));
  const maxCount = network.links.reduce((max, l) => Math.max(max, l.count), 1);
  const links: NetworkLink[] = [];
  for (const l of network.links) {
    const from = byId.get(l.from);
    const to = byId.get(l.to);
    if (!from || !to) continue; // a link to a player with no node cannot be drawn
    const t = l.count / maxCount;
    links.push({
      key: `${l.from}>${l.to}`,
      from,
      to,
      count: l.count,
      width: LINK_WIDTH.min + (LINK_WIDTH.max - LINK_WIDTH.min) * t,
      opacity: LINK_OPACITY.min + (LINK_OPACITY.max - LINK_OPACITY.min) * t,
    });
  }
  return { nodes, links };
}

/** The node with the most passes, or null for an empty network. */
export function topPasser(nodes: readonly NetworkNode[]): NetworkNode | null {
  return nodes.reduce<NetworkNode | null>((best, n) => (best === null || n.passes > best.passes ? n : best), null);
}
