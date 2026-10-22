// match-memory.ts — What the screen remembers about a match
//
// Purpose: keep the history the tactical overlays and the analysis panels need, which the display store does not
//          keep: every event, the goals, the shots, and a once-a-second record of each team's shape and the ball
// Inputs:  envelopes from the match store (live or replay), via store.onEnvelope
// Outputs: createMatchMemory(): ingest(), and read-only views (events, goals, shapes, …)
// Spec:    web/specs/pitch.md §3
//
// Coordinates: tracking is in the pitch frame and events in the team frame (CONTRACTS.md §1.1). Shapes are stored in
// metres from each team's OWN goal line, which reads the same whichever way the team attacks.

import type { HeavyStatPanel, MatchEvent, MatchSetup, ParsedEnvelope, StatPanel, TrackingFrame } from "@/lib/contracts";
import { attacksEast, type Side } from "@/lib/coordinates";

export const SHAPE_EVERY_MS = 1000;
/** Shapes kept per team, in match ms. */
export const SHAPE_KEEP_MS = 20 * 60_000;
export const EVENT_LIMIT = 6000;
/** Heatmap grid over the pitch frame: columns west → east, rows north → south. */
export const HEAT_COLS = 21;
export const HEAT_ROWS = 14;

export type ShapeSample = {
  ms: number;
  period: number;
  /** Mean distance of the outfield players from their own goal line, metres. */
  depth: number;
  /** Mean distance of the four deepest outfield players from their own goal line: the defensive line. */
  line: number;
  /** Distance between the furthest-apart outfield players across the pitch, metres. */
  width: number;
  /** Distance from the deepest to the furthest-forward outfield player, metres. */
  length: number;
};

export type BallSample = { ms: number; period: number; x: number; y: number };

export type Goal = { side: Side; teamId: string; ms: number; period: number; clock: string; scorer?: string };

export type PlayerMeta = { id: string; name: string; shirt: number; pos: string; side: Side; teamId: string };

export type MatchMemory = {
  ingest(envelope: ParsedEnvelope): void;
  /** The setup from a snapshot, which reaches the store without a status envelope. */
  setSetup(setup: MatchSetup): void;
  setup(): MatchSetup | null;
  players(): ReadonlyMap<string, PlayerMeta>;
  events(): readonly MatchEvent[];
  goals(): readonly Goal[];
  shapes(side: Side): readonly ShapeSample[];
  /**
   * Seconds spent in each cell of the pitch frame (HEAT_COLS × HEAT_ROWS, row-major), per player, sampled once a
   * match second. Stored in the pitch frame of the period played, so callers turn it into a team frame per period.
   */
  heat(playerId: string): { byPeriod: ReadonlyMap<number, Uint16Array> } | null;
  balls(): readonly BallSample[];
  latestPanel(): StatPanel | null;
  heavyPanel(): HeavyStatPanel | null;
  /** The newest match ms seen on any envelope. */
  nowMs(): number;
  /** Bumped on every change, for cheap memoisation. */
  version(): number;
  reset(): void;
};

/** Distance from a team's own goal line, metres, for a pitch-frame x. */
export function metresFromOwnGoal(pitchX: number, side: Side, period: number): number {
  const east = attacksEast(side, period) ?? side === "home";
  return (east ? pitchX : 100 - pitchX) * 1.05;
}

export function createMatchMemory(): MatchMemory {
  let setup: MatchSetup | null = null;
  let meta = new Map<string, PlayerMeta>();
  let events: MatchEvent[] = [];
  let goals: Goal[] = [];
  let shapes: Record<Side, ShapeSample[]> = { home: [], away: [] };
  let balls: BallSample[] = [];
  let latest: StatPanel | null = null;
  let heavy: HeavyStatPanel | null = null;
  let now = 0;
  let version = 0;
  let lastShapeMs = -Infinity;
  const seenEvents = new Set<string>();
  let heat = new Map<string, Map<number, Uint16Array>>();

  function applySetup(s: MatchSetup) {
    setup = s;
    meta = new Map();
    for (const side of ["home", "away"] as const) {
      const team = s.teams[side];
      for (const p of [...team.lineup, ...team.bench]) {
        meta.set(p.player_id, { id: p.player_id, name: p.name, shirt: p.shirt, pos: p.pos, side, teamId: team.team_id });
      }
    }
  }

  function sideOf(teamId: string | undefined): Side | null {
    if (!setup || !teamId) return null;
    if (setup.teams.home.team_id === teamId) return "home";
    if (setup.teams.away.team_id === teamId) return "away";
    return null;
  }

  function recordShape(frame: TrackingFrame) {
    if (frame.match_ms - lastShapeMs < SHAPE_EVERY_MS && frame.match_ms >= lastShapeMs) return;
    lastShapeMs = frame.match_ms;
    balls.push({ ms: frame.match_ms, period: frame.period, x: frame.ball.x, y: frame.ball.y });
    for (const p of frame.players) {
      let periods = heat.get(p.player_id);
      if (!periods) heat.set(p.player_id, (periods = new Map()));
      let grid = periods.get(frame.period);
      if (!grid) periods.set(frame.period, (grid = new Uint16Array(HEAT_COLS * HEAT_ROWS)));
      const col = Math.min(HEAT_COLS - 1, Math.max(0, Math.floor((p.x / 100) * HEAT_COLS)));
      const row = Math.min(HEAT_ROWS - 1, Math.max(0, Math.floor((p.y / 100) * HEAT_ROWS)));
      grid[row * HEAT_COLS + col]++;
    }
    for (const side of ["home", "away"] as const) {
      const outfield = frame.players.filter((p) => {
        const m = meta.get(p.player_id);
        return m && m.side === side && m.pos !== "GK";
      });
      if (outfield.length < 4) continue;
      const depths = outfield.map((p) => metresFromOwnGoal(p.x, side, frame.period)).sort((a, b) => a - b);
      const ys = outfield.map((p) => p.y * 0.68);
      shapes[side].push({
        ms: frame.match_ms,
        period: frame.period,
        depth: depths.reduce((s, d) => s + d, 0) / depths.length,
        line: depths.slice(0, 4).reduce((s, d) => s + d, 0) / 4,
        width: Math.max(...ys) - Math.min(...ys),
        length: depths[depths.length - 1] - depths[0],
      });
    }
    const floor = frame.match_ms - SHAPE_KEEP_MS;
    for (const side of ["home", "away"] as const) {
      if (shapes[side].length && shapes[side][0].ms < floor) shapes[side] = shapes[side].filter((s) => s.ms >= floor);
    }
    if (balls.length && balls[0].ms < floor) balls = balls.filter((b) => b.ms >= floor);
  }

  /** Forgets the play so far. The setup (same match) is kept. */
  function reset() {
    events = [];
    goals = [];
    shapes = { home: [], away: [] };
    balls = [];
    latest = null;
    heavy = null;
    now = 0;
    lastShapeMs = -Infinity;
    seenEvents.clear();
    heat = new Map();
    version++;
  }

  return {
    reset,
    setSetup(s) {
      if (setup?.match_id === s.match_id) return;
      applySetup(s);
      version++;
    },
    setup: () => setup,
    players: () => meta,
    events: () => events,
    goals: () => goals,
    shapes: (side) => shapes[side],
    heat: (playerId) => {
      const periods = heat.get(playerId);
      return periods ? { byPeriod: periods } : null;
    },
    balls: () => balls,
    latestPanel: () => latest,
    heavyPanel: () => heavy,
    nowMs: () => now,
    version: () => version,

    ingest(envelope) {
      // A replay that restarts begins again with the pre-match status: forget the play and start over. (Old envelopes
      // arriving late, as a catch-up snapshot sends them, are not a restart.)
      if (envelope.kind === "status" && envelope.data.phase === "pre_match" && now > 0) reset();
      now = Math.max(now, envelope.match_ms);
      switch (envelope.kind) {
        case "status":
          if (envelope.data.setup) applySetup(envelope.data.setup);
          break;
        case "event": {
          const e = envelope.data;
          if (seenEvents.has(e.event_id)) return;
          seenEvents.add(e.event_id);
          events.push(e);
          if (events.length > EVENT_LIMIT) events = events.slice(-EVENT_LIMIT);
          if (e.type === "Shot" && e.shot_outcome === "goal") {
            const side = sideOf(e.team_id);
            if (side) {
              goals.push({ side, teamId: e.team_id!, ms: e.match_ms, period: e.period, clock: e.clock, scorer: e.player_id });
            }
          }
          break;
        }
        case "positions":
          for (const frame of envelope.data.frames) recordShape(frame);
          break;
        case "stats": {
          const p = envelope.data;
          if (!latest || p.match_ms >= latest.match_ms) latest = p;
          if (p.heavy && (!heavy || p.match_ms >= heavy.match_ms)) heavy = p as HeavyStatPanel;
          break;
        }
        default:
          return;
      }
      version++;
    },
  };
}
