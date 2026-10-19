// TimelineEmptyState.tsx — No rows yet
//
// Purpose: what the timeline shows while the active filter has no rows
// Inputs:  none
// Outputs: an EmptyState
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { EmptyState } from "@/components/ui/EmptyState";

export function TimelineEmptyState() {
  return <EmptyState title="Waiting for messages in this category…" />;
}
