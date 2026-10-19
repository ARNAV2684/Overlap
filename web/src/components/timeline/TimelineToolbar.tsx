// TimelineToolbar.tsx — Filter tabs and row count
//
// Purpose: the strip under the timeline's header: the filter tabs on the left, the row count on the right
// Inputs:  filter, onFilter? (absent on the loading fallback), count
// Outputs: a div
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { FilterTabs } from "@/components/timeline/FilterTabs";
import { RowCount } from "@/components/timeline/RowCount";
import type { Filter } from "@/lib/store";

type TimelineToolbarProps = {
  filter: Filter;
  onFilter?: (filter: Filter) => void;
  count: number;
};

export function TimelineToolbar({ filter, onFilter, count }: TimelineToolbarProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-2 sm:px-5">
      <FilterTabs value={filter} onChange={onFilter} />
      <RowCount count={count} />
    </div>
  );
}
