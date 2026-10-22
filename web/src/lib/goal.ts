// goal.ts — Goal detection for the scoreboard
//
// Purpose: decide whether a change of score is a goal worth flashing and announcing, and word the announcement
// Inputs:  the score the screen showed before and the score it shows now; the match setup for club names
// Outputs: goalBetween(), goalAnnouncement(). Pure functions, no state
// Spec:    web/specs/screens.md (scoreboard, goal moment). vedant-frontend/web/IMPLEMENTATION_PLAN.md Phase 7
//
// History is never a goal. A new session starts from reset(), which publishes an empty score before the snapshot is
// read (src/lib/socket.ts catchUp), so the first score of a session always follows null: snapshot history, or the
// first live status. Only a rise from a score the screen already showed counts.

import type { MatchSetup } from "@/lib/contracts";

export type Score = { home: number; away: number };

export type Goal = {
  /** Who scored, or null when both scores rose between two updates (two goals inside one 250 ms publish). */
  side: "home" | "away" | null;
  score: Score;
};

/** The goal between two published scores, or null when there is none (no change, a fall, or a session start). */
export function goalBetween(previous: Score | null, next: Score | null): Goal | null {
  if (previous === null || next === null) return null;
  const home = next.home > previous.home;
  const away = next.away > previous.away;
  if (!home && !away) return null;
  return { side: home && away ? null : home ? "home" : "away", score: { ...next } };
}

/** "Goal, Northbridge FC. 1–0." Without the setup the club is named by side ("Goal, home team. 1–0."). */
export function goalAnnouncement(goal: Goal, setup: MatchSetup | null): string {
  const score = `${goal.score.home}–${goal.score.away}`;
  if (goal.side === null) return `Goals. ${score}.`;
  const club = setup?.teams[goal.side].name ?? `${goal.side} team`;
  return `Goal, ${club}. ${score}.`;
}
