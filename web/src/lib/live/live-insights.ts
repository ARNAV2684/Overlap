// live-insights.ts — What the live screen points out beyond the stat panel
//
// Purpose: per-player lines from the event stream (and the heavy block's tracking and xG), the head-to-head of two
//          players in the same role, each side's most influential passing connections, the hardest workers, the
//          match's tempo (control vs chaos, and rhythm), and the honest label and kind of an AI moment card
// Inputs:  the match events, the latest heavy block, the players from the setup
// Outputs: plain data for the match screen; nothing here draws
// Spec:    plans/active/PLAN_web_football-revamp_S8.md; web/specs/screens.md §2.8
//
// Every number comes from the events and the stats engine's heavy block: no model writes any of them. Event
// coordinates are in the acting team's frame (x = 100 is the goal it attacks), so "forward" is always +x.

import type { HeavyBlock, MatchEvent } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";
import type { Overlay } from "./insights";
import type { PlayerMeta } from "./match-memory";

/** Pitch size in metres, for turning the 0–100 frame into distances. */
const PITCH_X_M = 105;
const PITCH_Y_M = 68;
/** The final third starts here, in the team frame (the stats engine's pass_difficulty.FINAL_THIRD_X). */
const FINAL_THIRD_X = 66.7;
/** A progressive pass starts at least this far up (team frame) and ends at most this share as far from goal. */
const PROGRESSIVE_FROM_X = 35;
const PROGRESSIVE_SHARE = 0.75;
/** Passes from these restarts are never progressive (the stats engine's SET_PIECE_QUALIFIERS). */
const SET_PIECES = new Set(["corner", "free_kick", "goal_kick", "throw_in"]);

// ---------------------------------------------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------------------------------------------

export type Role = "keeper" | "defender" | "midfielder" | "forward";

export const ROLE_LABEL: Record<Role, string> = { keeper: "Keepers", defender: "Defenders", midfielder: "Midfielders", forward: "Forwards" };

const DEFENDERS = new Set(["CB", "LB", "RB", "LWB", "RWB", "SW"]);
const MIDFIELDERS = new Set(["DM", "CM", "AM", "LM", "RM", "CDM", "CAM"]);

/** The broad role of a lineup position (GK, CB, CM, ST, ...). Anything unknown is treated as a midfielder. */
export function roleOf(pos: string): Role {
  const p = pos.toUpperCase();
  if (p === "GK") return "keeper";
  if (DEFENDERS.has(p)) return "defender";
  if (MIDFIELDERS.has(p)) return "midfielder";
  if (["ST", "CF", "LW", "RW", "SS"].includes(p)) return "forward";
  return "midfielder";
}

// ---------------------------------------------------------------------------------------------------------------
// Player lines
// ---------------------------------------------------------------------------------------------------------------

export type PlayerLine = {
  playerId: string;
  passes: number;
  passesCompleted: number;
  /** Completed open-play passes that end at least 25 % closer to goal (the stats engine's rule). */
  progressivePasses: number;
  /** Mean length of a completed pass, metres (null before the first). */
  passDistanceM: number | null;
  keyPasses: number;
  shots: number;
  shotsOnTarget: number;
  goals: number;
  xg: number;
  topShotSpeedKmh: number | null;
  takeOns: number;
  takeOnsWon: number;
  tackles: number;
  tacklesWon: number;
  interceptions: number;
  aerials: number;
  aerialsWon: number;
  clearances: number;
  recoveries: number;
  pressures: number;
  saves: number;
  /** Tackles, take-ons and aerials: the one-against-one contests. */
  duels: number;
  duelsWon: number;
  distanceKm: number | null;
  sprints: number | null;
  topSpeedKmh: number | null;
};

function emptyLine(playerId: string): PlayerLine {
  return {
    playerId,
    passes: 0,
    passesCompleted: 0,
    progressivePasses: 0,
    passDistanceM: null,
    keyPasses: 0,
    shots: 0,
    shotsOnTarget: 0,
    goals: 0,
    xg: 0,
    topShotSpeedKmh: null,
    takeOns: 0,
    takeOnsWon: 0,
    tackles: 0,
    tacklesWon: 0,
    interceptions: 0,
    aerials: 0,
    aerialsWon: 0,
    clearances: 0,
    recoveries: 0,
    pressures: 0,
    saves: 0,
    duels: 0,
    duelsWon: 0,
    distanceKm: null,
    sprints: null,
    topSpeedKmh: null,
  };
}

/** Metres between two points of the 0–100 frame. */
export function metres(x: number, y: number, ex: number, ey: number): number {
  return Math.hypot(((ex - x) * PITCH_X_M) / 100, ((ey - y) * PITCH_Y_M) / 100);
}

/** Metres from a point (team frame) to the centre of the goal it attacks, never under half a metre. */
export function goalDistance(x: number, y: number): number {
  return Math.max(Math.hypot(PITCH_X_M - (x * PITCH_X_M) / 100, PITCH_Y_M / 2 - (y * PITCH_Y_M) / 100), 0.5);
}

/**
 * The stats engine's progressive pass (stats/pass_difficulty.py `is_progressive`), so cards and commentary quote the
 * same number: a completed open-play pass from x ≥ 35 that ends at least 25 % closer to the goal centre.
 */
export function isProgressive(e: MatchEvent): boolean {
  if (e.type !== "Pass" || e.outcome !== "success" || e.x === undefined || e.y === undefined) return false;
  if (e.end_x === undefined || e.end_y === undefined || e.x < PROGRESSIVE_FROM_X) return false;
  if ((e.qualifiers ?? []).some((q) => SET_PIECES.has(q))) return false;
  return goalDistance(e.end_x, e.end_y) <= PROGRESSIVE_SHARE * goalDistance(e.x, e.y);
}

/** Every player's match so far, from the events, with xG and tracking from the heavy block when it has them. */
export function playerLines(events: readonly MatchEvent[], heavy: HeavyBlock | null | undefined): Map<string, PlayerLine> {
  const lines = new Map<string, PlayerLine>();
  const line = (id: string) => {
    let l = lines.get(id);
    if (!l) lines.set(id, (l = emptyLine(id)));
    return l;
  };
  const keyPassIds = new Set<string>();
  for (const e of events) if (e.type === "Shot" && e.key_pass_event_id) keyPassIds.add(e.key_pass_event_id);
  const passMetres = new Map<string, number>();

  for (const e of events) {
    if (!e.player_id) continue;
    const l = line(e.player_id);
    switch (e.type) {
      case "Pass":
        l.passes++;
        if (e.outcome !== "fail") {
          l.passesCompleted++;
          if (isProgressive(e)) l.progressivePasses++;
          if (e.x !== undefined && e.y !== undefined && e.end_x !== undefined && e.end_y !== undefined) {
            passMetres.set(l.playerId, (passMetres.get(l.playerId) ?? 0) + metres(e.x, e.y, e.end_x, e.end_y));
          }
        }
        if (keyPassIds.has(e.event_id)) l.keyPasses++;
        break;
      case "Shot":
        l.shots++;
        if (e.shot_outcome === "goal" || e.shot_outcome === "saved") l.shotsOnTarget++;
        if (e.shot_outcome === "goal") l.goals++;
        if (e.shot_speed_kmh !== undefined) l.topShotSpeedKmh = Math.max(l.topShotSpeedKmh ?? 0, e.shot_speed_kmh);
        break;
      case "TakeOn":
        l.takeOns++;
        l.duels++;
        if (e.outcome === "success") {
          l.takeOnsWon++;
          l.duelsWon++;
        }
        break;
      case "Tackle":
        l.tackles++;
        l.duels++;
        if (e.outcome === "success") {
          l.tacklesWon++;
          l.duelsWon++;
        }
        break;
      case "Aerial":
        l.aerials++;
        l.duels++;
        if (e.outcome === "success") {
          l.aerialsWon++;
          l.duelsWon++;
        }
        break;
      case "Interception":
        l.interceptions++;
        break;
      case "Clearance":
        l.clearances++;
        break;
      case "BallRecovery":
        l.recoveries++;
        break;
      case "Pressure":
        l.pressures++;
        break;
      case "Save":
        l.saves++;
        break;
    }
  }
  for (const l of lines.values()) {
    const m = passMetres.get(l.playerId);
    l.passDistanceM = m !== undefined && l.passesCompleted ? m / l.passesCompleted : null;
  }
  for (const side of ["home", "away"] as const) {
    for (const s of heavy?.shots?.[side] ?? []) if (s.player_id) line(s.player_id).xg += s.xg;
  }
  for (const [id, t] of Object.entries(heavy?.players ?? {})) {
    const l = line(id);
    l.distanceKm = t.distance_km;
    l.sprints = t.sprints;
    l.topSpeedKmh = t.top_speed_kmh;
  }
  return lines;
}

// ---------------------------------------------------------------------------------------------------------------
// Role metrics and the head-to-head
// ---------------------------------------------------------------------------------------------------------------

export type RoleMetric = { key: string; label: string; value: (l: PlayerLine) => number | null; format: (v: number) => string };

const int = (v: number) => String(Math.round(v));
const pct = (num: (l: PlayerLine) => number, den: (l: PlayerLine) => number) => (l: PlayerLine) =>
  den(l) ? (num(l) / den(l)) * 100 : null;

/** The numbers that matter for each role, in the order the cards show them. */
export const ROLE_METRICS: Record<Role, RoleMetric[]> = {
  forward: [
    { key: "goals", label: "Goals", value: (l) => l.goals, format: int },
    { key: "xg", label: "xG", value: (l) => l.xg, format: (v) => v.toFixed(2) },
    { key: "shots", label: "Shots (on target)", value: (l) => l.shots, format: int },
    { key: "conversion", label: "Conversion", value: pct((l) => l.goals, (l) => l.shots), format: (v) => `${Math.round(v)}%` },
    { key: "shot_speed", label: "Hardest shot", value: (l) => l.topShotSpeedKmh, format: (v) => `${Math.round(v)} km/h` },
    { key: "take_ons", label: "Take-ons won", value: (l) => l.takeOnsWon, format: int },
  ],
  midfielder: [
    { key: "passes", label: "Passes completed", value: (l) => l.passesCompleted, format: int },
    { key: "completion", label: "Completion", value: pct((l) => l.passesCompleted, (l) => l.passes), format: (v) => `${Math.round(v)}%` },
    { key: "progressive", label: "Progressive passes", value: (l) => l.progressivePasses, format: int },
    { key: "pass_distance", label: "Average pass", value: (l) => l.passDistanceM, format: (v) => `${Math.round(v)} m` },
    { key: "key_passes", label: "Chances created", value: (l) => l.keyPasses, format: int },
    { key: "recoveries", label: "Ball recoveries", value: (l) => l.recoveries, format: int },
  ],
  defender: [
    { key: "tackles", label: "Tackles won", value: (l) => l.tacklesWon, format: int },
    { key: "interceptions", label: "Interceptions", value: (l) => l.interceptions, format: int },
    { key: "aerials", label: "Aerials won", value: (l) => l.aerialsWon, format: int },
    { key: "duels", label: "Duels won", value: pct((l) => l.duelsWon, (l) => l.duels), format: (v) => `${Math.round(v)}%` },
    { key: "clearances", label: "Clearances", value: (l) => l.clearances, format: int },
    { key: "progressive", label: "Progressive passes", value: (l) => l.progressivePasses, format: int },
  ],
  keeper: [
    { key: "saves", label: "Saves", value: (l) => l.saves, format: int },
    { key: "passes", label: "Passes completed", value: (l) => l.passesCompleted, format: int },
    { key: "completion", label: "Completion", value: pct((l) => l.passesCompleted, (l) => l.passes), format: (v) => `${Math.round(v)}%` },
    { key: "pass_distance", label: "Average pass", value: (l) => l.passDistanceM, format: (v) => `${Math.round(v)} m` },
  ],
};

/** How much a player is shaping the match in their role: picks each side's player for the head-to-head. */
export function roleScore(role: Role, l: PlayerLine): number {
  switch (role) {
    case "forward":
      return l.goals * 3 + l.xg * 4 + l.shotsOnTarget + l.shots * 0.5 + l.takeOnsWon * 0.5 + l.keyPasses;
    case "midfielder":
      return l.passesCompleted * 0.05 + l.progressivePasses * 0.6 + l.keyPasses * 1.5 + l.recoveries * 0.4 + l.goals * 2;
    case "defender":
      return l.tacklesWon + l.interceptions + l.aerialsWon + l.clearances * 0.5 + l.recoveries * 0.5 + l.progressivePasses * 0.2;
    case "keeper":
      return l.saves * 2 + l.passesCompleted * 0.02;
  }
}

export type BattleSidePlayer = { meta: PlayerMeta; line: PlayerLine };
export type BattleRow = { key: string; label: string; home: string; away: string; leader: Side | null; homeValue: number | null; awayValue: number | null };
export type Battle = {
  role: Role;
  home: BattleSidePlayer | null;
  away: BattleSidePlayer | null;
  rows: BattleRow[];
  /** The side that leads more rows, or null when level or one side has nobody. */
  edge: Side | null;
};

/** One side's player in a role who is shaping the match most, among players who have done anything yet. */
export function leaderInRole(role: Role, side: Side, lines: ReadonlyMap<string, PlayerLine>, players: ReadonlyMap<string, PlayerMeta>): BattleSidePlayer | null {
  let best: BattleSidePlayer | null = null;
  let bestScore = 0;
  for (const meta of players.values()) {
    if (meta.side !== side || roleOf(meta.pos) !== role) continue;
    const line = lines.get(meta.id);
    if (!line) continue;
    const score = roleScore(role, line);
    if (score > bestScore) {
      best = { meta, line };
      bestScore = score;
    }
  }
  return best;
}

/** The rows of a head-to-head between two players (either may be missing). */
export function battleRows(role: Role, home: PlayerLine | null, away: PlayerLine | null): BattleRow[] {
  return ROLE_METRICS[role].map((m) => {
    const h = home ? m.value(home) : null;
    const a = away ? m.value(away) : null;
    let shownH = h === null ? "–" : m.format(h);
    let shownA = a === null ? "–" : m.format(a);
    if (m.key === "shots") {
      shownH = home ? `${home.shots} (${home.shotsOnTarget})` : "–";
      shownA = away ? `${away.shots} (${away.shotsOnTarget})` : "–";
    }
    const leader = h === null || a === null || h === a ? null : h > a ? "home" : "away";
    return { key: m.key, label: m.label, home: shownH, away: shownA, leader, homeValue: h, awayValue: a };
  });
}

/** The head-to-head of each side's leading player in a role. */
export function battle(role: Role, lines: ReadonlyMap<string, PlayerLine>, players: ReadonlyMap<string, PlayerMeta>): Battle {
  const home = leaderInRole(role, "home", lines, players);
  const away = leaderInRole(role, "away", lines, players);
  const rows = battleRows(role, home?.line ?? null, away?.line ?? null);
  const won = (s: Side) => rows.filter((r) => r.leader === s).length;
  const edge = !home || !away || won("home") === won("away") ? null : won("home") > won("away") ? "home" : "away";
  return { role, home, away, rows, edge };
}

/** The opposite number of a player: the other side's leader in the same role. */
export function oppositeNumber(playerId: string, lines: ReadonlyMap<string, PlayerLine>, players: ReadonlyMap<string, PlayerMeta>): BattleSidePlayer | null {
  const meta = players.get(playerId);
  if (!meta) return null;
  return leaderInRole(roleOf(meta.pos), meta.side === "home" ? "away" : "home", lines, players);
}

// ---------------------------------------------------------------------------------------------------------------
// Connections
// ---------------------------------------------------------------------------------------------------------------

export type Connection = {
  /** The two players, the one who passed more to the other first. */
  a: string;
  b: string;
  passes: number;
  progressive: number;
  /** Completed passes between them that reached the final third from outside it. */
  intoFinalThird: number;
  /** Passes between them in moves that ended in a shot. */
  inShotMoves: number;
  score: number;
  /** Mean pass-start spots, team frame. */
  at: { a: { x: number; y: number }; b: { x: number; y: number } };
};

/** How a connection is ranked: every completed pass counts, a progressive one more, one in a move that ended in a shot most. */
export const CONNECTION_WEIGHTS = { pass: 1, progressive: 2, intoFinalThird: 1, inShotMoves: 3 } as const;

/** A team's top passing pairs (both directions together), most influential first. */
export function topConnections(events: readonly MatchEvent[], teamId: string, n = 3): Connection[] {
  const shotMoves = new Set<number>();
  for (const e of events) if (e.type === "Shot" && e.team_id === teamId) shotMoves.add(e.possession_id);
  const spots = new Map<string, { x: number; y: number; n: number }>();
  const pairs = new Map<string, Omit<Connection, "score" | "at"> & { ab: number; ba: number }>();
  for (const e of events) {
    if (e.type !== "Pass" || e.team_id !== teamId || !e.player_id) continue;
    if (e.x !== undefined && e.y !== undefined) {
      const s = spots.get(e.player_id) ?? { x: 0, y: 0, n: 0 };
      s.x += e.x;
      s.y += e.y;
      s.n++;
      spots.set(e.player_id, s);
    }
    if (e.outcome === "fail" || !e.receiver_id) continue;
    const [a, b] = e.player_id < e.receiver_id ? [e.player_id, e.receiver_id] : [e.receiver_id, e.player_id];
    const key = `${a}|${b}`;
    const p = pairs.get(key) ?? { a, b, passes: 0, progressive: 0, intoFinalThird: 0, inShotMoves: 0, ab: 0, ba: 0 };
    p.passes++;
    if (e.player_id === a) p.ab++;
    else p.ba++;
    if (isProgressive(e)) p.progressive++;
    if (e.x !== undefined && e.end_x !== undefined && e.x < FINAL_THIRD_X && e.end_x >= FINAL_THIRD_X) p.intoFinalThird++;
    if (shotMoves.has(e.possession_id)) p.inShotMoves++;
    pairs.set(key, p);
  }
  const spot = (id: string) => {
    const s = spots.get(id);
    return s && s.n ? { x: s.x / s.n, y: s.y / s.n } : { x: 50, y: 50 };
  };
  const w = CONNECTION_WEIGHTS;
  return [...pairs.values()]
    .filter((p) => p.passes >= 2)
    .map(({ ab, ba, ...p }) => {
      const [a, b] = ab >= ba ? [p.a, p.b] : [p.b, p.a];
      return {
        ...p,
        a,
        b,
        score: p.passes * w.pass + p.progressive * w.progressive + p.intoFinalThird * w.intoFinalThird + p.inShotMoves * w.inShotMoves,
        at: { a: spot(a), b: spot(b) },
      };
    })
    .sort((x, y) => y.score - x.score || y.passes - x.passes)
    .slice(0, n);
}

// ---------------------------------------------------------------------------------------------------------------
// Workhorses
// ---------------------------------------------------------------------------------------------------------------

/** The engine-room score, shown on the card as it is written here. */
export const WORK_WEIGHTS = { distanceKm: 2, sprints: 0.5, duelsWon: 1.5, recoveries: 1, interceptions: 1, pressures: 0.3 } as const;

export type WorkPart = { key: keyof typeof WORK_WEIGHTS; label: string; value: number; points: number };
export type Workhorse = { playerId: string; score: number; parts: WorkPart[] };

const WORK_LABEL: Record<keyof typeof WORK_WEIGHTS, string> = {
  distanceKm: "km covered",
  sprints: "sprints",
  duelsWon: "duels won",
  recoveries: "recoveries",
  interceptions: "interceptions",
  pressures: "pressures",
};

/** The hardest workers so far, by the engine-room score. Keepers are left out. */
export function workhorses(lines: ReadonlyMap<string, PlayerLine>, players: ReadonlyMap<string, PlayerMeta>, n = 3, side?: Side): Workhorse[] {
  const out: Workhorse[] = [];
  for (const l of lines.values()) {
    const meta = players.get(l.playerId);
    if (!meta || roleOf(meta.pos) === "keeper" || (side && meta.side !== side)) continue;
    const values: Record<keyof typeof WORK_WEIGHTS, number> = {
      distanceKm: l.distanceKm ?? 0,
      sprints: l.sprints ?? 0,
      duelsWon: l.duelsWon,
      recoveries: l.recoveries,
      interceptions: l.interceptions,
      pressures: l.pressures,
    };
    const parts = (Object.keys(WORK_WEIGHTS) as (keyof typeof WORK_WEIGHTS)[]).map((key) => ({
      key,
      label: WORK_LABEL[key],
      value: values[key],
      points: values[key] * WORK_WEIGHTS[key],
    }));
    const score = parts.reduce((s, p) => s + p.points, 0);
    if (score > 0) out.push({ playerId: l.playerId, score, parts });
  }
  return out.sort((a, b) => b.score - a.score).slice(0, n);
}

// ---------------------------------------------------------------------------------------------------------------
// Tempo: control vs chaos, and rhythm
// ---------------------------------------------------------------------------------------------------------------

/** The window tempo looks at, in match ms. */
export const TEMPO_WINDOW_MS = 5 * 60_000;
/**
 * Completed passes per possession in the window: at or above this the match is under control, at or below the chaos
 * mark it is chaotic. Set from generated matches, where the 5-minute median is about 4.8 (10th percentile 3.6, 90th
 * 7.3).
 */
export const CONTROL_PASSES_PER_POSSESSION = 6;
export const CHAOS_PASSES_PER_POSSESSION = 3.8;
/** Rhythm moves when the window's pass rate is this far from the match's own rate. */
export const RHYTHM_CHANGE = 0.15;

export type TempoState = "control" | "balanced" | "chaos";
export type RhythmState = "faster" | "steady" | "slower";

export type Tempo = {
  windowMinutes: number;
  /** Completed passes per possession, both teams, in the window. */
  passesPerPossession: number;
  /** Possession changes per minute in the window. */
  turnoversPerMinute: number;
  /** Passes per minute: the window and the match so far. */
  passesPerMinute: number;
  matchPassesPerMinute: number;
  state: TempoState;
  rhythm: RhythmState;
  /** The side that keeps the ball longer per possession in the window, or null when close. */
  inControl: Side | null;
  bySide: Record<Side, { passesPerPossession: number; possessions: number }>;
};

/**
 * The match's tempo over the last five minutes. Null until the window has three minutes of play and some passes,
 * so the card never judges the first seconds.
 */
export function tempo(events: readonly MatchEvent[], nowMs: number, sides: Record<Side, string>): Tempo | null {
  const from = nowMs - TEMPO_WINDOW_MS;
  const playMs = Math.min(TEMPO_WINDOW_MS, nowMs);
  if (playMs < 3 * 60_000) return null;
  let matchPasses = 0;
  let passes = 0;
  let completed = 0;
  let changes = 0;
  let last: number | null = null;
  const owner = new Map<number, string>();
  const completedBy = new Map<string, number>();
  for (const e of events) {
    if (e.match_ms > nowMs) continue;
    if (e.type === "Pass") matchPasses++;
    if (e.match_ms <= from || !e.team_id) continue;
    if (!owner.has(e.possession_id)) owner.set(e.possession_id, e.team_id);
    if (last !== null && e.possession_id !== last) changes++;
    last = e.possession_id;
    if (e.type === "Pass") {
      passes++;
      if (e.outcome !== "fail") {
        completed++;
        completedBy.set(e.team_id, (completedBy.get(e.team_id) ?? 0) + 1);
      }
    }
  }
  if (passes < 10 || owner.size === 0) return null;
  const minutes = playMs / 60_000;
  const perPossession = completed / owner.size;
  const sideStats = (teamId: string) => {
    const possessions = [...owner.values()].filter((t) => t === teamId).length;
    return { possessions, passesPerPossession: possessions ? (completedBy.get(teamId) ?? 0) / possessions : 0 };
  };
  const bySide = { home: sideStats(sides.home), away: sideStats(sides.away) };
  const gap = bySide.home.passesPerPossession - bySide.away.passesPerPossession;
  const ppm = passes / minutes;
  const matchPpm = matchPasses / Math.max(1, nowMs / 60_000);
  return {
    windowMinutes: Math.round(minutes),
    passesPerPossession: perPossession,
    turnoversPerMinute: changes / minutes,
    passesPerMinute: ppm,
    matchPassesPerMinute: matchPpm,
    state: perPossession >= CONTROL_PASSES_PER_POSSESSION ? "control" : perPossession <= CHAOS_PASSES_PER_POSSESSION ? "chaos" : "balanced",
    rhythm: ppm > matchPpm * (1 + RHYTHM_CHANGE) ? "faster" : ppm < matchPpm * (1 - RHYTHM_CHANGE) ? "slower" : "steady",
    inControl: Math.abs(gap) < 1 ? null : gap > 0 ? "home" : "away",
    bySide,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// AI moment cards: honest label and kind
// ---------------------------------------------------------------------------------------------------------------

export type CardSource = "ai" | "stat_line" | "unchecked";

/**
 * Who wrote a card. Only a line the fact-checker passed and that is not a template counts as AI; a template line is a
 * stat line, checked; anything else is unchecked (CONTRACTS.md §6: a line is never both verified and a fallback).
 */
export function cardSource(card: Pick<Overlay, "verified" | "fallback">): CardSource {
  if (card.fallback) return "stat_line";
  return card.verified ? "ai" : "unchecked";
}

export const CARD_SOURCE_LABEL: Record<CardSource, string> = { ai: "AI · checked", stat_line: "Stat line · checked", unchecked: "Unchecked" };

export type MomentKind =
  | "big_moment"
  | "chance"
  | "momentum"
  | "press"
  | "passing"
  | "movement"
  | "numbers"
  | "head_to_head"
  | "connection"
  | "workhorse"
  | "moment";

export const MOMENT_KIND_LABEL: Record<MomentKind, string> = {
  big_moment: "Big moment",
  chance: "Chance",
  momentum: "Momentum",
  press: "Press",
  passing: "Passing",
  movement: "Movement",
  numbers: "Numbers",
  head_to_head: "Head-to-head",
  connection: "Connection",
  workhorse: "Engine room",
  moment: "Moment",
};

/** The glyph each kind shows: plain characters, so the strip needs no icon font. */
export const MOMENT_KIND_GLYPH: Record<MomentKind, string> = {
  big_moment: "★",
  chance: "◎",
  momentum: "↗",
  press: "⇡",
  passing: "⇄",
  movement: "◌",
  numbers: "▤",
  head_to_head: "✕",
  connection: "⇌",
  workhorse: "▲",
  moment: "•",
};

/** The name of each chart a card can point to. */
export const CHART_LABEL: Record<string, string> = {
  shot_map: "Shot map",
  key_events: "Key events",
  momentum_tide: "Momentum",
  pressing_zones: "Pressing",
  stat_bars: "Team stats",
  pass_network: "Pass network",
  heatmap_zones: "Heatmap",
  head_to_head: "Head-to-head",
  connections: "Connections",
  engine_room: "Engine room",
};

/** The visuals that point at a live insight card under the pitch rather than an analysis tab. */
export const INSIGHT_CARD = new Set(["head_to_head", "connections", "engine_room"]);

/** What a card is about, from the chart the director picked for it. */
export function momentKind(card: Pick<Overlay, "visual">): MomentKind {
  switch (card.visual?.component) {
    case "key_events":
      return "big_moment";
    case "shot_map":
      return "chance";
    case "momentum_tide":
      return "momentum";
    case "pressing_zones":
      return "press";
    case "pass_network":
      return "passing";
    case "heatmap_zones":
      return "movement";
    case "stat_bars":
      return "numbers";
    case "head_to_head":
      return "head_to_head";
    case "connections":
      return "connection";
    case "engine_room":
      return "workhorse";
    default:
      return "moment";
  }
}

/** The match minute of a card ("62:14" → 62). */
export function cardMinute(clock: string): number {
  const m = Number.parseInt(clock.split(":")[0] ?? "", 10);
  return Number.isFinite(m) ? m : 0;
}
