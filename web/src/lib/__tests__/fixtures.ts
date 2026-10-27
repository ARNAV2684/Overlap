// fixtures.ts — Test data
//
// Purpose: small hand-written valid messages that tests copy and then break on purpose
// Inputs:  optional overrides
// Outputs: a match setup, events, a tracking frame and envelopes (invented clubs and players only)
// Spec:    CONTRACTS.md (the message shapes these fixtures follow)

import type {
  HeavyBlock,
  MatchEvent,
  MatchSetup,
  ParsedEnvelope,
  Phase,
  StatPanel,
  TeamPanel,
  TrackingFrame,
} from "@/lib/contracts";

const POSITIONS = ["GK", "RB", "CB", "CB", "LB", "DM", "CM", "CM", "RW", "ST", "LW"];

function squad(teamId: string, firstName: string) {
  const player = (shirt: number, pos: string) => ({
    player_id: `${teamId}-${String(shirt).padStart(2, "0")}`,
    name: `${firstName} ${shirt}`,
    pos,
    shirt,
    attr: { pace: 70, passing: 70, dribbling: 70, finishing: 70, tackling: 70, stamina: 70 },
  });
  return {
    lineup: POSITIONS.map((pos, i) => player(i + 1, pos)),
    bench: [player(12, "GK"), player(13, "ST")],
  };
}

export function makeSetup(): MatchSetup {
  return {
    match_id: "SYN-0042",
    seed: 42,
    competition: "Synthetic League · Season 1 · Matchweek 9",
    season_id: "S1",
    venue: { name: "Riverside Ground", city: "Northbridge" },
    kickoff_utc: "2026-10-24T19:00:00Z",
    storylines: ["late_pressure_surge"],
    teams: {
      home: {
        team_id: "NBR",
        name: "Northbridge FC",
        colours: { primary: "#B3202A", secondary: "#1C2340" },
        formation: "4-3-3",
        style: { press_intensity: 0.78, directness: 0.35, width: 0.7 },
        ...squad("NBR", "Nora"),
      },
      away: {
        team_id: "HBA",
        name: "Harbour Athletic",
        colours: { primary: "#E0A526", secondary: "#121212" },
        formation: "5-3-2",
        style: { press_intensity: 0.4, directness: 0.72, width: 0.45 },
        ...squad("HBA", "Hugo"),
      },
    },
  };
}

/** A valid Pass by NBR-09 to NBR-11. Pass overrides to turn it into another event type. */
export function makeEvent(overrides: Partial<MatchEvent> = {}): MatchEvent {
  return {
    event_id: "SYN-0042-01186",
    match_id: "SYN-0042",
    seq: 1186,
    possession_id: 214,
    period: 2,
    period_ms: 1_034_000,
    match_ms: 3_854_000,
    clock: "62:14",
    type: "Pass",
    team_id: "NBR",
    player_id: "NBR-09",
    x: 55,
    y: 40,
    outcome: "success",
    receiver_id: "NBR-11",
    ...overrides,
  };
}

export function makeFrame(overrides: Partial<TrackingFrame> = {}): TrackingFrame {
  return {
    match_id: "SYN-0042",
    period: 2,
    period_ms: 1_027_400,
    match_ms: 3_847_400,
    ball: { x: 24.4, y: 89.6, z: 0, speed_kmh: 31.8 },
    players: [{ player_id: "NBR-11", x: 24, y: 90, speed_kmh: 33.1, dist_m: 8842 }],
    ...overrides,
  };
}

const teamPanel = (team_id: string, over: Partial<TeamPanel> = {}): TeamPanel => ({
  team_id,
  possession_pct: 58,
  shots: 11,
  shots_on_target: 5,
  xg: 1.42,
  passes: 402,
  pass_completion_pct: 83,
  ppda_last_10min: 7.5,
  pressures_per_opp_pass_last_10min: 1.34,
  momentum_share_last_10min_pct: 71,
  press_height_last_10min_m: 52,
  ...over,
});

/** The light stat panel of CONTRACTS.md §7.4, at 62:14, with no heavy block. */
export function makePanel(overrides: Partial<StatPanel> = {}): StatPanel {
  return {
    match_id: "SYN-0042",
    match_ms: 3_854_000,
    clock: "62:14",
    period: 2,
    source_seq: 1186,
    score: { home: 1, away: 0 },
    teams: {
      home: teamPanel("NBR"),
      away: teamPanel("HBA", {
        possession_pct: 42,
        shots: 4,
        shots_on_target: 1,
        xg: 0.38,
        passes: 291,
        pass_completion_pct: 76,
        ppda_last_10min: 14.2,
        pressures_per_opp_pass_last_10min: 0.61,
        momentum_share_last_10min_pct: 29,
        press_height_last_10min_m: 38,
      }),
    },
    momentum: { period: 2, bucket: 3, home: 9.5, away: 3.0 },
    low_sample: [],
    ...overrides,
  };
}

/** A 9 × 6 pressing grid (or any size) of zeros with a few counts set: `cells` maps "outer,inner" to a count. */
export function countGrid(outer: number, inner: number, cells: Record<string, number> = {}): number[][] {
  return Array.from({ length: outer }, (_, o) => Array.from({ length: inner }, (_, i) => cells[`${o},${i}`] ?? 0));
}

/** A heavy block as the stats engine sends it at a whole minute: buckets, pass networks, grids and players. */
export function makeHeavy(overrides: Partial<HeavyBlock> = {}): HeavyBlock {
  const firstHalf = Array.from({ length: 10 }, (_, bucket) => ({ period: 1, bucket, home: bucket % 3, away: 1.5 }));
  return {
    momentum_buckets: [
      ...firstHalf,
      { period: 2, bucket: 0, home: 4, away: 2 },
      { period: 2, bucket: 1, home: 1, away: 6.5 },
      { period: 2, bucket: 2, home: 3, away: 0 },
      { period: 2, bucket: 3, home: 7, away: 3 },
    ],
    pass_network: {
      home: {
        nodes: [
          { player_id: "NBR-01", x: 6, y: 50, passes: 18 },
          { player_id: "NBR-04", x: 28, y: 62, passes: 35 },
          { player_id: "NBR-11", x: 71, y: 14, passes: 42 },
        ],
        links: [
          { from: "NBR-04", to: "NBR-11", count: 9 },
          { from: "NBR-01", to: "NBR-04", count: 3 },
        ],
      },
      away: { nodes: [{ player_id: "HBA-04", x: 22, y: 40, passes: 20 }], links: [] },
    },
    pressing_grid: {
      home: countGrid(9, 6, { "7,1": 12, "4,3": 6, "1,2": 2 }),
      away: countGrid(9, 6, { "2,2": 5 }),
    },
    zones: {
      home: countGrid(3, 6, { "0,4": 40, "1,2": 25, "2,0": 5 }),
      away: countGrid(3, 6, { "1,1": 30 }),
    },
    players: { "NBR-11": { distance_km: 7.21, top_speed_kmh: 33.4, sprints: 14 } },
    ...overrides,
  };
}

/** Wraps data in an envelope. `seq` is the envelope's own counter, not the event's. */
export function envelope(kind: string, data: unknown, overrides: Record<string, unknown> = {}) {
  return { seq: 7, kind, match_id: "SYN-0042", match_ms: 3_854_000, clock: "62:14", data, ...overrides };
}

// ---- typed envelopes for the store and socket tests (the seq is the envelope's own counter) -------------------------

export const MATCH = "SYN-0042";

const clockOf = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;

export function eventEnv(seq: number, over: Partial<MatchEvent> = {}, ms = seq * 1000): ParsedEnvelope {
  const data = makeEvent({ event_id: `SYN-0042-${String(seq).padStart(5, "0")}`, seq, match_ms: ms, ...over });
  return { seq, kind: "event", match_id: MATCH, match_ms: ms, clock: clockOf(ms), data };
}

export function posEnv(seq: number, ms = seq * 1000, frames = 5): ParsedEnvelope {
  return {
    seq,
    kind: "positions",
    match_id: MATCH,
    match_ms: ms,
    clock: clockOf(ms),
    data: { frames: Array.from({ length: frames }, (_, i) => makeFrame({ match_ms: ms + i * 200 })) },
  };
}

/** A stats envelope for match second `ms`; pass `heavy` for a whole-minute panel. */
export function statsEnv(seq: number, ms = seq * 1000, heavy?: HeavyBlock, over: Partial<StatPanel> = {}): ParsedEnvelope {
  const data = makePanel({ match_ms: ms, clock: clockOf(ms), ...(heavy ? { heavy } : {}), ...over });
  return { seq, kind: "stats", match_id: MATCH, match_ms: ms, clock: clockOf(ms), data };
}

export function statusEnv(
  seq: number,
  phase: Phase,
  score = { home: 0, away: 0 },
  extra: { setup?: MatchSetup; period?: number } = {},
  ms = seq * 1000,
): ParsedEnvelope {
  return {
    seq,
    kind: "status",
    match_id: MATCH,
    match_ms: ms,
    clock: clockOf(ms),
    data: { phase, period: extra.period ?? 1, score, ...(extra.setup ? { setup: extra.setup } : {}) },
  };
}
