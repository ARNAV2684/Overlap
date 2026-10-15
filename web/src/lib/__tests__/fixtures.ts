// fixtures.ts — Test data
//
// Purpose: small hand-written valid messages that tests copy and then break on purpose
// Inputs:  optional overrides
// Outputs: a match setup, events, a tracking frame and envelopes (invented clubs and players only)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 4.4

import type { MatchEvent, MatchSetup, TrackingFrame } from "@/lib/contracts";

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

/** Wraps data in an envelope. `seq` is the envelope's own counter, not the event's. */
export function envelope(kind: string, data: unknown, overrides: Record<string, unknown> = {}) {
  return { seq: 7, kind, match_id: "SYN-0042", match_ms: 3_854_000, clock: "62:14", data, ...overrides };
}
