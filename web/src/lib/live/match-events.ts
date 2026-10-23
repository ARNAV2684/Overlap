// match-events.ts — What the pitch shows from the event stream
//
// Purpose: turn match events into the things drawn on the field and in the score header (not the agents'
//          commentary): who is booked, each team's score sheet, and the set pieces and stoppages worth marking
//          on the pitch (corners, throw-ins, free kicks, goal kicks, offsides, fouls, goals, cards)
// Inputs:  events (CONTRACTS.md §3, team frame) and the match setup
// Outputs: classifyFieldEvent(), bookingsAt(), scoreSheet(); FieldEvent, Booking, SheetEntry
// Spec:    web/specs/pitch.md §5; web/specs/screens.md §2.1
//
// Pure. Everything is filtered by a playhead in match ms, so a replay or a live stream that runs ahead of the
// picture never shows something before it happens on the pitch.

import type { MatchEvent, MatchSetup } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";

export const FIELD_EVENT_KINDS = ["goal", "card", "corner", "throw_in", "free_kick", "goal_kick", "offside", "foul"] as const;
export type FieldEventKind = (typeof FIELD_EVENT_KINDS)[number];

export type FieldEvent = {
  id: string;
  kind: FieldEventKind;
  ms: number;
  period: number;
  clock: string;
  teamId: string;
  playerId?: string;
  /** Team frame of the acting team (0–100). */
  x: number;
  y: number;
  /** Cards only. */
  card?: "yellow" | "second_yellow" | "red";
  /** Goals only: scored from the penalty spot. */
  penalty?: boolean;
};

export const FIELD_EVENT_LABELS: Record<FieldEventKind, string> = {
  goal: "Goal",
  card: "Card",
  corner: "Corner",
  throw_in: "Throw-in",
  free_kick: "Free kick",
  goal_kick: "Goal kick",
  offside: "Offside",
  foul: "Foul",
};

/** The field event an event stands for, or null. A restart pass carries its restart as a qualifier. */
export function classifyFieldEvent(e: MatchEvent): FieldEvent | null {
  if (!e.team_id || e.x === undefined || e.y === undefined) return null;
  const base = { id: e.event_id, ms: e.match_ms, period: e.period, clock: e.clock, teamId: e.team_id, playerId: e.player_id, x: e.x, y: e.y };
  if (e.type === "Shot" && e.shot_outcome === "goal") return { ...base, kind: "goal", penalty: e.situation === "penalty" };
  if (e.type === "Card" && e.card) return { ...base, kind: "card", card: e.card };
  // The Corner event marks it; its delivery pass also has the qualifier, so only the event counts
  if (e.type === "Corner") return { ...base, kind: "corner" };
  if (e.type === "Offside") return { ...base, kind: "offside" };
  if (e.type === "Foul") return { ...base, kind: "foul" };
  if (e.type === "Pass") {
    const q = e.qualifiers ?? [];
    if (q.includes("throw_in")) return { ...base, kind: "throw_in" };
    if (q.includes("free_kick")) return { ...base, kind: "free_kick" };
    if (q.includes("goal_kick")) return { ...base, kind: "goal_kick" };
  }
  return null;
}

export type Booking = { colour: "yellow" | "red"; ms: number };

/** Each player's card at the playhead: red after a red or a second yellow, else yellow after a yellow. */
export function bookingsAt(fieldEvents: readonly FieldEvent[], playheadMs: number): Map<string, Booking> {
  const out = new Map<string, Booking>();
  for (const f of fieldEvents) {
    if (f.kind !== "card" || !f.playerId || f.ms > playheadMs) continue;
    const secondYellow = f.card === "yellow" && out.get(f.playerId)?.colour === "yellow";
    const red = f.card === "red" || f.card === "second_yellow" || secondYellow;
    out.set(f.playerId, { colour: red ? "red" : "yellow", ms: f.ms });
  }
  return out;
}

/** One minute on a score sheet entry, with a note such as "pen" or "2nd yellow". */
export type SheetMinute = { minute: string; note?: string };

/** One player's goals, or one player's red card, on a team's score sheet. */
export type SheetEntry = {
  /** Stable per player and kind, e.g. "goal:NBR-09". */
  id: string;
  kind: "goal" | "red";
  name: string;
  /** Every minute, in match order: `Sartori 6′ 45′ 90′`. */
  minutes: SheetMinute[];
  /** match_ms of the newest minute, so the entry that just changed can rise in. */
  lastMs: number;
};

/** "62:14" → "62′", "45+2:10" → "45+2′". */
export const minuteOf = (clock: string) => `${clock.split(":")[0]}′`;

/** The surname, or the whole name for one-word names. */
export const shortName = (name: string) => name.trim().split(/\s+/).slice(-1)[0] ?? name;

/**
 * Goals and red cards per team up to the playhead. One entry per player and kind, holding all their minutes, in the
 * order each player first appears. Yellow cards stay on the pitch and in Key events, not here; a second yellow shows
 * as a red card with the note "2nd yellow".
 */
export function scoreSheet(
  fieldEvents: readonly FieldEvent[],
  setup: MatchSetup | null,
  playheadMs: number,
): Record<Side, SheetEntry[]> {
  const sheet: Record<Side, SheetEntry[]> = { home: [], away: [] };
  if (!setup) return sheet;
  const names = new Map<string, string>();
  for (const t of [setup.teams.home, setup.teams.away]) for (const p of [...t.lineup, ...t.bench]) names.set(p.player_id, p.name);
  const yellows = new Set<string>();
  const entries = new Map<string, SheetEntry>();
  const add = (side: Side, kind: SheetEntry["kind"], f: FieldEvent, note?: string) => {
    const who = f.playerId ?? f.id;
    const id = `${kind}:${who}`;
    let entry = entries.get(id);
    if (!entry) {
      entry = { id, kind, name: shortName(names.get(f.playerId ?? "") ?? f.playerId ?? ""), minutes: [], lastMs: f.ms };
      entries.set(id, entry);
      sheet[side].push(entry);
    }
    entry.minutes.push(note ? { minute: minuteOf(f.clock), note } : { minute: minuteOf(f.clock) });
    entry.lastMs = f.ms;
  };
  for (const f of [...fieldEvents].sort((a, b) => a.ms - b.ms)) {
    if (f.ms > playheadMs || (f.kind !== "goal" && f.kind !== "card")) continue;
    const side: Side = f.teamId === setup.teams.home.team_id ? "home" : "away";
    if (f.kind === "goal") {
      add(side, "goal", f, f.penalty ? "pen" : undefined);
      continue;
    }
    const player = f.playerId ?? "";
    const second = f.card === "second_yellow" || (f.card === "yellow" && yellows.has(player));
    if (f.card === "yellow" && !second) {
      yellows.add(player);
      continue;
    }
    add(side, "red", f, second ? "2nd yellow" : undefined);
  }
  return sheet;
}
