// TimelineRowShell.tsx — The frame every timeline row shares
//
// Purpose: one option of the timeline listbox: the three-column grid, hover, selected and history looks, the optional
//          left bar (secondary when selected, primary on a goal) and the optional row tint (cards)
// Inputs:  rowKey, label (the option's accessible name), selected, tabbable (roving tabindex), history, accent?
//          ("goal"), tint? (a background class), onSelect(key), onFocusRow(key), children (the three cells)
// Outputs: a div with role="option"
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2
//
// Keyboard handling lives on the list (TimelineList); the shell only reports clicks and focus.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** The three columns, shared with TimelineTableHead so the head lines up with the rows. */
export const ROW_GRID = "grid grid-cols-[80px_minmax(0,1fr)_98px] gap-3 min-[680px]:grid-cols-[112px_minmax(0,1fr)_119px]";

type TimelineRowShellProps = {
  rowKey: string;
  label: string;
  selected: boolean;
  tabbable: boolean;
  history: boolean;
  accent?: "goal";
  tint?: string;
  onSelect?: (key: string) => void;
  onFocusRow?: (key: string) => void;
  children: ReactNode;
};

export function TimelineRowShell({
  rowKey,
  label,
  selected,
  tabbable,
  history,
  accent,
  tint,
  onSelect,
  onFocusRow,
  children,
}: TimelineRowShellProps) {
  const bar = selected ? "bg-secondary" : accent === "goal" ? "bg-primary" : null;
  return (
    <div
      role="option"
      data-key={rowKey}
      aria-selected={selected}
      aria-label={label}
      tabIndex={tabbable ? 0 : -1}
      onClick={() => onSelect?.(rowKey)}
      onFocus={() => onFocusRow?.(rowKey)}
      className={cn(
        ROW_GRID,
        "relative cursor-pointer items-center border-b border-line px-4 py-2.5 focus-visible:outline-offset-[-2px]",
        selected ? "bg-secondary-soft" : cn(tint, "hover:bg-surface-raised"),
        history && "opacity-65",
      )}
    >
      {bar ? <span aria-hidden="true" className={cn("absolute inset-y-0 left-0 w-[3px]", bar)} /> : null}
      {children}
    </div>
  );
}
