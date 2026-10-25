// home-choice.ts — Which match the home page opens on
//
// Purpose: pick the home page's match from the match list: a live match that is really being played, else a replay
//          of the newest finished match, keeping what is already playing when nothing better appears
// Inputs:  the match list (match-list.ts), the live matches that went quiet, the live matches whose clock moved
//          since the last poll, and the current choice
// Outputs: pickHomeMatch(); HomeChoice
// Spec:    web/specs/screens.md §1
//
// Pure: HomeLive.tsx polls the list and keeps the timers; this decides.

import type { MatchListItem } from "@/lib/match-list";

export type HomeChoice = { matchId: string; source: "live" | "replay" } | null;

/**
 * A live match that is not quiet wins, preferring one whose clock is moving, then the highest match number (the
 * newest run). Without one, a replay already playing keeps playing; otherwise the newest finished match (the list's
 * first) as a replay. Returns `current` itself when it stays the choice, so a caller can tell nothing changed.
 */
export function pickHomeMatch(
  matches: readonly MatchListItem[],
  quiet: ReadonlySet<string>,
  moving: ReadonlySet<string>,
  current: HomeChoice,
): HomeChoice {
  const live = matches
    .filter((m) => m.status === "live" && !quiet.has(m.match_id))
    .sort((a, b) => Number(moving.has(b.match_id)) - Number(moving.has(a.match_id)) || b.match_id.localeCompare(a.match_id))[0];
  if (live) {
    if (current?.matchId === live.match_id && current.source === "live") return current;
    return { matchId: live.match_id, source: "live" };
  }
  if (current?.source === "replay") return current;
  const finished = matches.find((m) => m.status === "finished");
  return finished ? { matchId: finished.match_id, source: "replay" } : null;
}
