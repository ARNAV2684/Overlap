// MatchClock.tsx — Match clock
//
// Purpose: the server's display clock under the score ("62:14")
// Inputs:  clock (the envelope's clock string, "–:–" before the first message), className
// Outputs: a p element. Not a live region: clock ticks are never announced
// Spec:    web/specs/screens.md (scoreboard). web/IMPLEMENTATION_PLAN.md Phase 7
//
// The string is shown as sent and never computed with (CONTRACTS.md §1.2).

import { cn } from "@/lib/cn";

export function MatchClock({ clock, className }: { clock: string; className?: string }) {
  return <p className={cn("text-clock font-mono numeric text-ink", className)}>{clock}</p>;
}
