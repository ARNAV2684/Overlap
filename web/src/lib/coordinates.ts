// coordinates.ts — Coordinates
//
// Purpose: the ONE place that maps pitch coordinates to the screen and converts between the two frames.
//          Nobody hand-flips coordinates anywhere else (AGENTS.md rule 7)
// Inputs:  points with x and y from 0 to 100
// Outputs: SVG points (viewBox "0 0 105 68"), pitch-frame points, and which way a team attacks
// Spec:    CONTRACTS.md §1.1. web/IMPLEMENTATION_PLAN.md Phase 4.3
//
// Two frames (CONTRACTS.md §1.1):
//   team frame  (events):         x 0 = the acting team's own goal line, 100 = the opponent's;
//                                 y 0 = the team's left touchline, facing the opponent's goal
//   pitch frame (tracking, SVG):  x 0 = west, 100 = east; y 0 = north, 100 = south
// East is right and north is up, so a pitch-frame point maps straight onto SVG with no flip.

export type Point = { x: number; y: number };
export type Side = "home" | "away";

export const PITCH_LENGTH_M = 105;
export const PITCH_WIDTH_M = 68;
/** Use as the viewBox of any SVG that draws the pitch in metres. */
export const PITCH_VIEW_BOX = `0 0 ${PITCH_LENGTH_M} ${PITCH_WIDTH_M}`;

/** Pitch-frame point (0–100) to SVG user units (metres): x × 1.05, y × 0.68. No flips. */
export function pitchToSvg(point: Point): Point {
  return { x: (point.x * PITCH_LENGTH_M) / 100, y: (point.y * PITCH_WIDTH_M) / 100 };
}

/** Same mapping, named for callers that want metres rather than SVG units. */
export const pitchToMetres = pitchToSvg;

/**
 * Which way a team attacks. The home team attacks east in periods 1 and 3 and west in periods 2 and 4; the away team
 * the opposite. A shootout (period 5) has no direction in CONTRACTS.md §1.1, so this returns null rather than guess.
 */
export function attacksEast(side: Side, period: number): boolean | null {
  if (period === 1 || period === 3) return side === "home";
  if (period === 2 || period === 4) return side === "away";
  return null;
}

/**
 * Team frame to pitch frame. A team attacking east sees the same picture in both frames; a team attacking west is
 * turned through 180°: (x, y) → (100 − x, 100 − y).
 */
export function teamToPitch(point: Point, teamAttacksEast: boolean): Point {
  return teamAttacksEast ? { x: point.x, y: point.y } : { x: 100 - point.x, y: 100 - point.y };
}
