// OutcomeBadge.tsx — Result of an action
//
// Purpose: say how an action ended: "Success" / "Failed" (CONTRACTS.md §3 `outcome`), or a shot's result
//          ("Saved", "Missed", "Blocked", "Woodwork"). A goal has its own badge on the row (GoalBadge, below)
// Inputs:  outcome, className
// Outputs: a span. The word is always shown; colour only supports it
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2

import { cn } from "@/lib/cn";
import type { SHOT_OUTCOMES } from "@/lib/contracts";

export type Outcome = "success" | "fail" | Exclude<(typeof SHOT_OUTCOMES)[number], "goal">;

const labels: Record<Outcome, string> = {
  success: "Success",
  fail: "Failed",
  saved: "Saved",
  missed: "Missed",
  blocked: "Blocked",
  woodwork: "Woodwork",
};

const badge = "inline-flex items-center rounded-control border px-1.5 py-0.5 text-label";

export function OutcomeBadge({ outcome, className }: { outcome: Outcome; className?: string }) {
  return (
    <span
      className={cn(
        badge,
        outcome === "success" ? "border-secondary/50 text-secondary-text" : "border-line-strong text-ink-muted",
        className,
      )}
    >
      {labels[outcome]}
    </span>
  );
}

/** The "Goal" badge on a scoring shot: primary, like the row's left bar. */
export function GoalBadge({ className }: { className?: string }) {
  return <span className={cn(badge, "border-transparent bg-primary font-semibold text-primary-ink", className)}>Goal</span>;
}
