// TimelineTableHead.tsx — Column labels
//
// Purpose: MATCH ELAPSED | EVENT / DETAILS | RECEIVED LOCALLY, on the same grid as the rows
// Inputs:  none
// Outputs: a decorative div (aria-hidden): each row's accessible name already says all three
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { ROW_GRID } from "@/components/timeline/TimelineRowShell";
import { cn } from "@/lib/cn";

export function TimelineTableHead() {
  return (
    <div aria-hidden="true" className={cn(ROW_GRID, "border-b border-line px-4 py-2 text-eyebrow uppercase text-ink-muted")}>
      <span>Match elapsed</span>
      <span>Event / details</span>
      <span className="text-right">Received locally</span>
    </div>
  );
}
