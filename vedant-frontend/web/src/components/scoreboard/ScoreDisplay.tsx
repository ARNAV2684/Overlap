// ScoreDisplay.tsx — The score
//
// Purpose: "1 : 0" in large digits, flashing primary while a goal is fresh
// Inputs:  score ({ home, away } or null before the first status: "– : –"), names (for the spoken version),
//          flashing (true for 600 ms after a goal), className
// Outputs: a p element: the visible score is hidden from screen readers, which read "Northbridge FC 1, Harbour 0"
// Spec:    web/specs/screens.md (scoreboard, goal moment). web/IMPLEMENTATION_PLAN.md Phase 7
//
// The flash is a colour change only, and only under motion-safe, so reduced motion shows no flash.

import { VisuallyHidden } from "@/components/ui/VisuallyHidden";
import { cn } from "@/lib/cn";
import type { Score } from "@/components/scoreboard/goal";

type ScoreDisplayProps = {
  score: Score | null;
  names: { home: string; away: string };
  flashing?: boolean;
  className?: string;
};

export function ScoreDisplay({ score, names, flashing = false, className }: ScoreDisplayProps) {
  return (
    <p className={cn("text-score numeric", className)}>
      <span
        aria-hidden="true"
        className={cn(
          "motion-safe:transition-colors motion-safe:duration-150",
          flashing ? "motion-safe:text-primary" : "text-ink",
        )}
      >
        {score ? `${score.home} : ${score.away}` : "– : –"}
      </span>
      <VisuallyHidden>
        {score ? `${names.home} ${score.home}, ${names.away} ${score.away}` : "No score yet"}
      </VisuallyHidden>
    </p>
  );
}
