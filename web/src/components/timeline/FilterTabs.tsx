"use client";

// FilterTabs.tsx — Timeline filter
//
// Purpose: choose which rows the timeline shows: "Match events" (events and state changes), "Tracking" or "All data"
// Inputs:  value (the store's filter), onChange? (absent on the loading fallback: the tabs are disabled)
// Outputs: a SegmentedControl (radio group named "Message filter")
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1 (B16)

import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import type { Filter } from "@/lib/store";

const OPTIONS: readonly SegmentedOption<Filter>[] = [
  { value: "events", label: "Match events" },
  { value: "tracking", label: "Tracking" },
  { value: "all", label: "All data" },
];
const DISABLED = OPTIONS.map((option) => ({ ...option, disabled: true }));

export function FilterTabs({ value, onChange }: { value: Filter; onChange?: (filter: Filter) => void }) {
  return (
    <SegmentedControl
      options={onChange ? OPTIONS : DISABLED}
      value={value}
      onChange={(filter) => onChange?.(filter)}
      label="Message filter"
    />
  );
}
