// RowCount.tsx — How many rows the timeline shows
//
// Purpose: "120 shown" next to the filter tabs
// Inputs:  count
// Outputs: a p element. Not a live region: it changes with every row
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { formatCount } from "@/lib/format";

export function RowCount({ count }: { count: number }) {
  return <p className="text-caption numeric text-ink-muted">{formatCount(count)} shown</p>;
}
