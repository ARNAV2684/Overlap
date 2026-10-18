// NewItemsPill.tsx — "12 new ↑"
//
// Purpose: tell a viewer who has scrolled down the timeline that newer rows arrived above, and take them back up
// Inputs:  count (rows newer than the top row when they scrolled away), onClick
// Outputs: a button floating over the top of the list, or nothing when count is 0
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1, 8.3 (scroll)

import { formatCount } from "@/lib/format";

export function NewItemsPill({ count, onClick }: { count: number; onClick: () => void }) {
  if (count === 0) return null;
  return (
    <button
      type="button"
      onClick={onClick}
      className="absolute top-2 left-1/2 z-10 min-h-8 -translate-x-1/2 rounded-pill border border-secondary bg-surface-raised px-3 py-1 text-caption font-semibold text-secondary-text shadow-lg hover:bg-line-strong hover:text-ink"
    >
      {formatCount(count)} new <span aria-hidden="true">↑</span>
      <span className="sr-only">, back to the newest</span>
    </button>
  );
}
