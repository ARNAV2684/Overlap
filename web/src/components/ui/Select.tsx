"use client";

// Select.tsx — A site-styled dropdown
//
// Purpose: a drop-in for a native <select> whose open list follows the site's theme (dark and light) instead of the
//          browser's white list: a button that shows the chosen option, and a listbox of options, optionally in
//          labelled groups
// Inputs:  value, options, onChange; labelledBy (the id of the visible label); align of the open list
// Outputs: UI
// Spec:    web/specs/design-system.md (form controls); web/specs/screens.md §3
//
// The ARIA "select-only combobox" pattern: focus stays on the button (role combobox), which points at the active
// option with aria-activedescendant. Keys: ↓/↑ move (and open), Home/End, Enter or Space choose, Escape closes, Tab
// closes, a typed letter jumps to the next option starting with it. A click outside closes.

import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from "react";

export type SelectOption = {
  value: string;
  label: string;
  /** Options with the same group are listed under a heading with that name, in the order given. */
  group?: string;
};

type SelectProps = {
  value: string;
  options: readonly SelectOption[];
  onChange: (value: string) => void;
  /** The id of the element that names this control (its visible label). */
  labelledBy: string;
  /** Which edge the open list lines up with; "end" keeps a list in the last column on the screen. */
  align?: "start" | "end";
  className?: string;
};

/** How long typed letters are joined into one search ("ka" jumps to Kai, not to the next K). */
const TYPE_AHEAD_MS = 600;

/** The option index after a key press, or null when the key doesn't move. Wraps nowhere: stops at either end. */
export function moveIndex(key: string, index: number, count: number): number | null {
  if (count === 0) return null;
  if (key === "ArrowDown") return Math.min(count - 1, index + 1);
  if (key === "ArrowUp") return Math.max(0, index - 1);
  if (key === "Home") return 0;
  if (key === "End") return count - 1;
  if (key === "PageDown") return Math.min(count - 1, index + 10);
  if (key === "PageUp") return Math.max(0, index - 10);
  return null;
}

/**
 * The first option after `from` (then from the top) whose label starts with `search`, ignoring case and accents;
 * a repeated single letter cycles through the options that start with it. -1 when none does.
 */
export function typeAhead(labels: readonly string[], search: string, from: number): number {
  const fold = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const needle = fold(search);
  if (!needle) return -1;
  const repeat = needle.length > 1 && [...needle].every((c) => c === needle[0]);
  const target = repeat ? needle[0] : needle;
  const start = repeat || needle.length === 1 ? from + 1 : from;
  for (let k = 0; k < labels.length; k++) {
    const i = (start + k) % labels.length;
    if (fold(labels[i]).startsWith(target)) return i;
  }
  return -1;
}

export function Select({ value, options, onChange, labelledBy, align = "start", className = "" }: SelectProps) {
  const id = useId();
  const listId = `${id}-list`;
  const optionId = (i: number) => `${id}-opt-${i}`;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const search = useRef({ text: "", at: 0 });

  const selected = Math.max(0, options.findIndex((o) => o.value === value));
  const labels = useMemo(() => options.map((o) => o.label), [options]);

  const show = useCallback(
    (index = selected) => {
      setActive(index);
      setOpen(true);
    },
    [selected],
  );
  const choose = (index: number) => {
    const option = options[index];
    setOpen(false);
    buttonRef.current?.focus();
    if (option && option.value !== value) onChange(option.value);
  };

  // A click or tap outside closes the list
  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  // Keep the active option in view while moving through a long list
  useEffect(() => {
    if (!open) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [open, active]);

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const { key } = event;
    if (key === "Tab") {
      setOpen(false);
      return;
    }
    if (key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (key === "Enter" || key === " ") {
      event.preventDefault();
      if (open) choose(active);
      else show();
      return;
    }
    const moved = moveIndex(key, open ? active : selected, options.length);
    if (moved !== null) {
      event.preventDefault();
      if (open) setActive(moved);
      else show(key === "ArrowDown" || key === "ArrowUp" ? selected : moved);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const now = event.timeStamp;
      const typed = now - search.current.at > TYPE_AHEAD_MS ? key : search.current.text + key;
      search.current = { text: typed, at: now };
      const found = typeAhead(labels, typed, open ? active : selected);
      if (found >= 0) {
        if (open) setActive(found);
        else show(found);
      }
    }
  };

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        ref={buttonRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={labelledBy}
        aria-activedescendant={open ? optionId(active) : undefined}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={onKeyDown}
        className="flex w-full items-center justify-between gap-2 rounded-[10px] border border-ink/10 bg-ink/[0.03] px-3 py-2 text-left text-[13px] font-semibold text-ink outline-none transition-colors hover:border-ink/20 focus-visible:border-accent aria-expanded:border-ink/25"
      >
        <span className="min-w-0 truncate">{options[selected]?.label ?? ""}</span>
        <span aria-hidden="true" className={`shrink-0 text-[10px] text-ink/40 transition-transform ${open ? "rotate-180" : ""}`}>
          ▼
        </span>
      </button>
      <ul
        ref={listRef}
        id={listId}
        role="listbox"
        aria-labelledby={labelledBy}
        hidden={!open}
        className={`absolute top-[calc(100%+6px)] z-50 max-h-[288px] w-max min-w-full max-w-[min(320px,calc(100vw-32px))] overflow-y-auto overscroll-contain rounded-[12px] border border-ink/10 bg-surface p-1 shadow-[0_12px_32px_rgb(0_0_0/0.28)] ${align === "end" ? "right-0" : "left-0"}`}
      >
        {options.map((o, i) => {
          // A group's heading goes before its first option
          const heading = o.group !== undefined && o.group !== options[i - 1]?.group ? o.group : null;
          const isSelected = i === selected;
          return [
            heading !== null && (
              <li key={`group:${heading}:${i}`} role="presentation" className="ov-sub truncate px-2.5 pb-1 pt-2.5 first:pt-1.5">
                {heading}
              </li>
            ),
            <li
              key={o.value}
              id={optionId(i)}
              role="option"
              aria-selected={isSelected}
              data-index={i}
              // Keep focus on the button: a mouse press on an option must not blur it first
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(i)}
              onMouseMove={() => active !== i && setActive(i)}
              className={`flex cursor-pointer items-center justify-between gap-3 rounded-[8px] px-2.5 py-1.5 text-[13px] ${
                i === active ? "bg-ink/[0.07] text-ink" : "text-ink/75"
              } ${isSelected ? "font-bold text-ink" : "font-medium"}`}
            >
              <span className="min-w-0 truncate">{o.label}</span>
              <span aria-hidden="true" className={`shrink-0 text-[11px] text-accent ${isSelected ? "" : "invisible"}`}>
                ✓
              </span>
            </li>,
          ];
        })}
      </ul>
    </div>
  );
}
