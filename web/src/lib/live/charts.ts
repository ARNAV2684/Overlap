// charts.ts — Data for the analysis charts
//
// Purpose: shape the match memory into what each chart draws: momentum series, shots, a player's or team's heat,
//          a player's passes, the key events, and a player's numbers
// Inputs:  MatchMemory views, stat panels
// Outputs: pure functions, one per chart
// Spec:    web/specs/charts.md
//
// Every chart is drawn in a TEAM frame (attacking left → right), so a team's picture reads the same in both halves:
// events already are (CONTRACTS.md §1.1); tracking-based heat is turned per period with teamToPitch's inverse.

import type { MatchEvent, MatchSetup, MomentumBucket, StatPanel } from "@/lib/contracts";
import { attacksEast, type Side } from "@/lib/coordinates";
import { HEAT_COLS, HEAT_ROWS, type MatchMemory } from "@/lib/live/match-memory";

export type MomentumPoint = { period: number; bucket: number; home: number; away: number; label: string };

/** Every 5-minute bucket so far, both halves, in order; the live bucket from the newest panel replaces its stale copy. */
export function momentumSeries(memory: Pick<MatchMemory, "heavyPanel" | "latestPanel">): MomentumPoint[] {
  const byKey = new Map<string, MomentumBucket>();
  for (const b of memory.heavyPanel()?.heavy.momentum_buckets ?? []) byKey.set(`${b.period}:${b.bucket}`, b);
  const live = memory.latestPanel()?.momentum;
  if (live) byKey.set(`${live.period}:${live.bucket}`, live);
  return [...byKey.values()]
    .sort((a, b) => a.period - b.period || a.bucket - b.bucket)
    .map((b) => ({ ...b, label: `${(b.period === 1 ? 0 : 45) + b.bucket * 5}′` }));
}

export type ShotDot = {
  id: string;
  x: number;
  y: number;
  outcome: NonNullable<MatchEvent["shot_outcome"]>;
  clock: string;
  playerId?: string;
  situation?: string;
  speedKmh?: number;
};

/** A team's shots, in its own frame (attacking right). */
export function teamShots(events: readonly MatchEvent[], teamId: string, playerId?: string | null): ShotDot[] {
  return events
    .filter((e) => e.type === "Shot" && e.team_id === teamId && e.x !== undefined && e.y !== undefined && (!playerId || e.player_id === playerId))
    .map((e) => ({
      id: e.event_id,
      x: e.x!,
      y: e.y!,
      outcome: e.shot_outcome ?? "missed",
      clock: e.clock,
      playerId: e.player_id,
      situation: e.situation,
      speedKmh: e.shot_speed_kmh,
    }));
}

/** Heat for some players of one side, in that side's frame (attacking right), normalised 0–1. */
export function heatGrid(memory: Pick<MatchMemory, "heat">, playerIds: readonly string[], side: Side): Float32Array {
  const out = new Float32Array(HEAT_COLS * HEAT_ROWS);
  for (const id of playerIds) {
    const h = memory.heat(id);
    if (!h) continue;
    for (const [period, grid] of h.byPeriod) {
      const east = attacksEast(side, period) ?? side === "home";
      for (let r = 0; r < HEAT_ROWS; r++) {
        for (let c = 0; c < HEAT_COLS; c++) {
          const v = grid[r * HEAT_COLS + c];
          if (!v) continue;
          const tc = east ? c : HEAT_COLS - 1 - c;
          const tr = east ? r : HEAT_ROWS - 1 - r;
          out[tr * HEAT_COLS + tc] += v;
        }
      }
    }
  }
  // Light smoothing so the map reads as zones, not pixels
  const smooth = new Float32Array(out.length);
  for (let r = 0; r < HEAT_ROWS; r++) {
    for (let c = 0; c < HEAT_COLS; c++) {
      let s = 0;
      let w = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          const rr = r + dr;
          const cc = c + dc;
          if (rr < 0 || cc < 0 || rr >= HEAT_ROWS || cc >= HEAT_COLS) continue;
          const k = dr === 0 && dc === 0 ? 4 : dr === 0 || dc === 0 ? 2 : 1;
          s += out[rr * HEAT_COLS + cc] * k;
          w += k;
        }
      }
      smooth[r * HEAT_COLS + c] = s / w;
    }
  }
  const max = Math.max(...smooth, 0);
  if (max > 0) for (let i = 0; i < smooth.length; i++) smooth[i] /= max;
  return smooth;
}

export type PassLine = { id: string; x: number; y: number; ex: number; ey: number; ok: boolean; progressive: boolean; key: boolean };

/** A player's (or a team's) passes, team frame. */
export function passLines(events: readonly MatchEvent[], filter: { playerId?: string | null; teamId?: string }): PassLine[] {
  const keyPasses = new Set(events.filter((e) => e.type === "Shot" && e.key_pass_event_id).map((e) => e.key_pass_event_id!));
  return events
    .filter(
      (e) =>
        e.type === "Pass" &&
        e.x !== undefined &&
        e.y !== undefined &&
        e.end_x !== undefined &&
        e.end_y !== undefined &&
        (filter.playerId ? e.player_id === filter.playerId : !filter.teamId || e.team_id === filter.teamId),
    )
    .map((e) => ({
      id: e.event_id,
      x: e.x!,
      y: e.y!,
      ex: e.end_x!,
      ey: e.end_y!,
      ok: e.outcome !== "fail",
      progressive: (e.end_x! - e.x!) * 1.05 >= 10 && e.end_x! > 50,
      key: keyPasses.has(e.event_id),
    }));
}

export type KeyEvent = {
  id: string;
  clock: string;
  ms: number;
  side: Side;
  kind: "goal" | "yellow" | "red" | "sub" | "penalty_miss";
  text: string;
};

export function keyEvents(events: readonly MatchEvent[], setup: MatchSetup | null): KeyEvent[] {
  if (!setup) return [];
  const name = (id?: string) => {
    for (const t of [setup.teams.home, setup.teams.away]) {
      const p = [...t.lineup, ...t.bench].find((q) => q.player_id === id);
      if (p) return p.name;
    }
    return id ?? "";
  };
  const sideOf = (teamId?: string): Side => (teamId === setup.teams.home.team_id ? "home" : "away");
  const out: KeyEvent[] = [];
  for (const e of events) {
    if (e.type === "Shot" && e.shot_outcome === "goal") {
      const assist = e.assisted_by ? ` · assist ${name(e.assisted_by)}` : "";
      out.push({ id: e.event_id, clock: e.clock, ms: e.match_ms, side: sideOf(e.team_id), kind: "goal", text: `${name(e.player_id)}${e.situation === "penalty" ? " (pen)" : ""}${assist}` });
    } else if (e.type === "Shot" && e.situation === "penalty") {
      out.push({ id: e.event_id, clock: e.clock, ms: e.match_ms, side: sideOf(e.team_id), kind: "penalty_miss", text: `${name(e.player_id)} misses a penalty` });
    } else if (e.type === "Card") {
      out.push({ id: e.event_id, clock: e.clock, ms: e.match_ms, side: sideOf(e.team_id), kind: e.card === "yellow" ? "yellow" : "red", text: name(e.player_id) });
    } else if (e.type === "Substitution") {
      out.push({ id: e.event_id, clock: e.clock, ms: e.match_ms, side: sideOf(e.team_id), kind: "sub", text: `${name(e.player_on_id)} on · ${name(e.player_id)} off` });
    }
  }
  return out;
}

export type PlayerNumbers = {
  passes: number;
  passPct: number | null;
  shots: number;
  goals: number;
  takeOns: number;
  takeOnsWon: number;
  defensive: number;
  distanceKm: number | null;
  topSpeedKmh: number | null;
  sprints: number | null;
};

/** One player's match so far: events, plus distance, top speed and sprints from the stats engine's heavy block. */
export function playerNumbers(events: readonly MatchEvent[], playerId: string, panel: StatPanel | null): PlayerNumbers {
  let passes = 0;
  let passOk = 0;
  let shots = 0;
  let goals = 0;
  let takeOns = 0;
  let takeOnsWon = 0;
  let defensive = 0;
  for (const e of events) {
    if (e.player_id !== playerId) continue;
    if (e.type === "Pass") {
      passes++;
      if (e.outcome !== "fail") passOk++;
    } else if (e.type === "Shot") {
      shots++;
      if (e.shot_outcome === "goal") goals++;
    } else if (e.type === "TakeOn") {
      takeOns++;
      if (e.outcome === "success") takeOnsWon++;
    } else if (["Tackle", "Interception", "Clearance", "BallRecovery", "Pressure"].includes(e.type)) defensive++;
  }
  const t = panel?.heavy?.players?.[playerId];
  return {
    passes,
    passPct: passes ? Math.round((passOk / passes) * 100) : null,
    shots,
    goals,
    takeOns,
    takeOnsWon,
    defensive,
    distanceKm: t?.distance_km ?? null,
    topSpeedKmh: t?.top_speed_kmh ?? null,
    sprints: t?.sprints ?? null,
  };
}
