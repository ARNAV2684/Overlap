// ScoreCenter.tsx — Middle of the scoreboard
//
// Purpose: phase label, score, clock and match id, stacked and centred
// Inputs:  phase (null before the first status: "Waiting"), score, names, clock, matchId (null on the loading
//          fallback, which does not know it yet: a skeleton of the same size), flashing, className
// Outputs: a div
// Spec:    web/specs/screens.md (scoreboard). web/IMPLEMENTATION_PLAN.md Phase 7

import { MatchClock } from "@/components/scoreboard/MatchClock";
import { ScoreDisplay } from "@/components/scoreboard/ScoreDisplay";
import type { Score } from "@/components/scoreboard/goal";
import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import type { Phase } from "@/lib/contracts";
import { formatPhase } from "@/lib/format";

type ScoreCenterProps = {
  phase: Phase | null;
  score: Score | null;
  names: { home: string; away: string };
  clock: string;
  matchId: string | null;
  flashing?: boolean;
  className?: string;
};

export function ScoreCenter({ phase, score, names, clock, matchId, flashing, className }: ScoreCenterProps) {
  return (
    <div className={cn("flex flex-col items-center gap-1 text-center", className)}>
      <PhaseLabel phase={phase} />
      <ScoreDisplay score={score} names={names} flashing={flashing} />
      <MatchClock clock={clock} />
      <MatchIdLabel matchId={matchId} />
    </div>
  );
}

function PhaseLabel({ phase }: { phase: Phase | null }) {
  return <p className="text-eyebrow uppercase text-accent-text">{phase ? formatPhase(phase) : "Waiting"}</p>;
}

function MatchIdLabel({ matchId }: { matchId: string | null }) {
  if (matchId === null) return <Skeleton className="mt-0.5 h-4 w-16" />;
  return <p className="text-label font-mono text-ink-muted">{matchId}</p>;
}
