"use client";

// TimelineList.tsx — The scrolling list of timeline rows
//
// Purpose: show the rows newest first as a keyboard-usable listbox, keep the viewer's place when rows are prepended,
//          and offer the "N new ↑" pill when they have scrolled away from the top
// Inputs:  rows (newest first, at most 120), teams (team_id → RowTeam), selectedKey (null while following the newest),
//          onSelect?(key) (absent on the loading fallback), label (the listbox's accessible name)
// Outputs: a scroll area holding a role="listbox" (or the empty state)
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1, 8.3 (selection, scroll)
//
// Keyboard: one row is in the Tab order (roving tabindex). ↑/↓ move, Home/End jump, Enter or Space selects.
// The focused row is remembered by key, not index, so new rows arriving above do not move the focus.
// Scroll: at the top, new rows simply appear. Scrolled down, the first visible row is kept in place after each update
// (measured on scroll, restored before paint) and the pill counts the rows that arrived above.
// Remount with key={filter} so a filter change starts again at the top.

import { useCallback, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import { NewItemsPill } from "@/components/timeline/NewItemsPill";
import { TimelineEmptyState } from "@/components/timeline/TimelineEmptyState";
import { TimelineRow, type RowTeam } from "@/components/timeline/TimelineRow";
import type { TimelineRow as Row } from "@/lib/store";

/** Within this many pixels of the top counts as "at the top". */
const TOP_SLACK_PX = 8;

type TimelineListProps = {
  rows: readonly Row[];
  teams: ReadonlyMap<string, RowTeam>;
  selectedKey: string | null;
  onSelect?: (key: string) => void;
  label: string;
};

type Anchor = { key: string; offset: number };

export function TimelineList({ rows, teams, selectedKey, onSelect, label }: TimelineListProps) {
  const scroller = useRef<HTMLDivElement>(null);
  const anchor = useRef<Anchor | null>(null);
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  /** The arrival order of the top row when the viewer scrolled away from the top; null while at the top. */
  const [leftTopAt, setLeftTopAt] = useState<number | null>(null);

  // The tabbable row: the focused one if it is still listed, else the selected one, else the newest
  const keys = rows.map((row) => row.key);
  const tabbableKey =
    (focusedKey !== null && keys.includes(focusedKey) && focusedKey) ||
    (selectedKey !== null && keys.includes(selectedKey) && selectedKey) ||
    keys[0] ||
    null;
  const newCount = leftTopAt === null ? 0 : rows.filter((row) => row.order > leftTopAt).length;

  const rowElement = (key: string) =>
    scroller.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(key)}"]`) ?? null;

  /** The first row still visible at the top of the scroll area, and how far its top is from the area's top. */
  function measureAnchor(): Anchor | null {
    const area = scroller.current;
    if (!area) return null;
    for (const el of area.querySelectorAll<HTMLElement>("[data-key]")) {
      if (el.offsetTop + el.offsetHeight > area.scrollTop) {
        return { key: el.dataset.key ?? "", offset: el.offsetTop - area.scrollTop };
      }
    }
    return null;
  }

  function onScroll() {
    const area = scroller.current;
    if (!area) return;
    const atTop = area.scrollTop <= TOP_SLACK_PX;
    if (atTop && leftTopAt !== null) setLeftTopAt(null);
    if (!atTop && leftTopAt === null) setLeftTopAt(rows[0]?.order ?? 0);
    anchor.current = atTop ? null : measureAnchor();
  }

  // Rows were prepended: put the anchored row back where the viewer last saw it, before the browser paints
  useLayoutEffect(() => {
    const area = scroller.current;
    const kept = anchor.current;
    if (!area || !kept) return;
    const el = area.querySelector<HTMLElement>(`[data-key="${CSS.escape(kept.key)}"]`);
    if (el) area.scrollTop = el.offsetTop - kept.offset;
  }, [rows]);

  function backToTop() {
    anchor.current = null;
    setLeftTopAt(null);
    if (scroller.current) scroller.current.scrollTop = 0;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (keys.length === 0 || tabbableKey === null) return;
    const index = keys.indexOf(tabbableKey);
    let next: number;
    switch (event.key) {
      case "ArrowDown":
        next = Math.min(index + 1, keys.length - 1);
        break;
      case "ArrowUp":
        next = Math.max(index - 1, 0);
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = keys.length - 1;
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        onSelect?.(tabbableKey);
        return;
      default:
        return;
    }
    event.preventDefault();
    setFocusedKey(keys[next]);
    rowElement(keys[next])?.focus();
  }

  // Stable, so memoised rows do not re-render when the list does
  const onFocusRow = useCallback((key: string) => setFocusedKey(key), []);

  return (
    <div className="relative min-h-0 flex-1">
      <NewItemsPill count={newCount} onClick={backToTop} />
      <div ref={scroller} onScroll={onScroll} className="relative h-full overflow-y-auto [overflow-anchor:none]">
        {rows.length === 0 ? (
          <TimelineEmptyState />
        ) : (
          <div role="listbox" aria-label={label} onKeyDown={onKeyDown}>
            {rows.map((row) => {
              const team = row.teamId ? teams.get(row.teamId) : undefined;
              return (
                <TimelineRow
                  key={row.key}
                  row={row}
                  team={team}
                  selected={row.key === selectedKey}
                  tabbable={row.key === tabbableKey}
                  onSelect={onSelect}
                  onFocusRow={onFocusRow}
                />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
