"use client";

// Scoreboard.tsx — Scoreboard
//
// Purpose: score, clock and live status: home block, centre block (phase, score, clock, match id), away block, on a
//          card tinted with both clubs' kit colours. A goal flashes the score and is announced
// Inputs:  Scoreboard: the scoreboard slice from the nearest MatchStreamProvider (useScoreboard())
//          ScoreboardView: scoreboard, matchId? (overrides scoreboard.matchId; null on the loading fallback),
//          flashing?, announcement? (for pages, previews and the fallback without a store)
// Outputs: a <section> named "Scoreboard"
// Spec:    web/specs/screens.md (scoreboard). web/specs/design-system.md §1, §4, §5. web/IMPLEMENTATION_PLAN.md Phase 7
//
// The scoreboard is a live slice: it keeps updating while the feed is paused. Goals are found by comparing each
// published score with the one before (components/scoreboard/goal.ts), so snapshot history never flashes.

import { useEffect, useState } from "react";
import { ScoreCenter } from "@/components/scoreboard/ScoreCenter";
import { TeamBlock } from "@/components/scoreboard/TeamBlock";
import { goalAnnouncement, goalBetween, type Score } from "@/components/scoreboard/goal";
import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { cn } from "@/lib/cn";
import type { Scoreboard as ScoreboardState } from "@/lib/store";
import { teamColourStyle } from "@/lib/team-colours";
import { useScoreboard } from "@/lib/store-hooks";

/** How long the score stays primary after a goal. */
export const GOAL_FLASH_MS = 600;

type ScoreboardViewProps = {
  scoreboard: ScoreboardState;
  /** Defaults to scoreboard.matchId. null shows a skeleton (the loading fallback does not know the id yet). */
  matchId?: string | null;
  flashing?: boolean;
  /** Text for the assertive live region. Leave undefined to render no region at all (previews, the fallback). */
  announcement?: string;
  className?: string;
};

export function ScoreboardView({ scoreboard, matchId, flashing, announcement, className }: ScoreboardViewProps) {
  const { setup } = scoreboard;
  const home = setup?.teams.home.name ?? null;
  const away = setup?.teams.away.name ?? null;

  return (
    <section
      aria-label="Scoreboard"
      style={teamColourStyle(setup)}
      className={cn(
        "mb-[18px] grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-card border border-line",
        "bg-surface bg-linear-to-r from-team-home/15 via-transparent to-team-away/15 p-4 sm:gap-6 sm:p-6",
        className,
      )}
    >
      <TeamBlock side="home" name={home} />
      <ScoreCenter
        phase={scoreboard.phase}
        score={scoreboard.score}
        names={{ home: home ?? "Home team", away: away ?? "Away team" }}
        clock={scoreboard.clock}
        matchId={matchId === undefined ? scoreboard.matchId : matchId}
        flashing={flashing}
      />
      <TeamBlock side="away" name={away} />
      {announcement !== undefined ? (
        <VisuallyHidden aria-live="assertive" aria-atomic="true">
          {announcement}
        </VisuallyHidden>
      ) : null}
    </section>
  );
}

const sameScore = (a: Score | null, b: Score | null) => a?.home === b?.home && a?.away === b?.away;

/** The scoreboard wired to the live store. Must sit inside a MatchStreamProvider. */
export function Scoreboard({ className }: { className?: string }) {
  const scoreboard = useScoreboard();
  const [shown, setShown] = useState<Score | null>(scoreboard.score);
  const [goal, setGoal] = useState<{ count: number; text: string } | null>(null);
  const [flashing, setFlashing] = useState(false);

  // Compared during render, not in an effect, so each published score is checked exactly once and the flash starts
  // in the same render as the new score
  if (!sameScore(shown, scoreboard.score)) {
    setShown(scoreboard.score);
    const scored = goalBetween(shown, scoreboard.score);
    if (scored) {
      setGoal({ count: (goal?.count ?? 0) + 1, text: goalAnnouncement(scored, scoreboard.setup) });
      setFlashing(true);
    }
  }

  const goalCount = goal?.count ?? 0;
  useEffect(() => {
    if (goalCount === 0) return;
    const timer = setTimeout(() => setFlashing(false), GOAL_FLASH_MS);
    return () => clearTimeout(timer);
  }, [goalCount]);

  return (
    <ScoreboardView
      scoreboard={scoreboard}
      flashing={flashing}
      announcement={goal?.text ?? ""}
      className={className}
    />
  );
}
