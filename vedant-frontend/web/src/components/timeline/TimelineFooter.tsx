// TimelineFooter.tsx — How to read the timeline
//
// Purpose: explain Elapsed, Received and History, and how many rows are shown and kept
// Inputs:  none (the limits come from the store's constants)
// Outputs: a p element
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { ROW_LIMIT, VISIBLE_ROWS } from "@/lib/store";

export function TimelineFooter() {
  return (
    <p className="border-t border-line px-4 py-3 text-caption text-ink-muted sm:px-5">
      Elapsed = time in the match. Received = this browser’s wall clock. “History” rows came from the startup snapshot.
      Latest {VISIBLE_ROWS} displayed; {ROW_LIMIT} event/state rows and {ROW_LIMIT} tracking frames retained.
    </p>
  );
}
