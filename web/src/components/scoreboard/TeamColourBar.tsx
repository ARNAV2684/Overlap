// TeamColourBar.tsx — Kit colour strip
//
// Purpose: the short bar in a club's kit colour above its name on the scoreboard
// Inputs:  side ("home" | "away"), ready (false before the setup arrives: a skeleton bar instead), className
// Outputs: a decorative div (hidden from screen readers: the club name next to it is the text label)
// Spec:    web/specs/design-system.md §1 (club colours). web/IMPLEMENTATION_PLAN.md Phase 7
//
// The colour comes from --team-home / --team-away, which the Scoreboard sets from the setup.

import { Skeleton } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";

type TeamColourBarProps = {
  side: "home" | "away";
  ready: boolean;
  className?: string;
};

export function TeamColourBar({ side, ready, className }: TeamColourBarProps) {
  if (!ready) return <Skeleton className={cn("h-1.5 w-12 rounded-pill", className)} />;
  return (
    <div
      aria-hidden="true"
      className={cn("h-1.5 w-12 rounded-pill", side === "home" ? "bg-team-home" : "bg-team-away", className)}
    />
  );
}
