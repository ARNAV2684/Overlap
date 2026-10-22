"use client";

// SegmentedControl.tsx — Single-choice tabs
//
// Purpose: pick one of a few options ("Match events | Tracking | All data")
// Inputs:  options [{ value, label, disabled? }], value, onChange(value), label (names the group for screen readers)
// Outputs: a radio group. Only the selected option is in the Tab order; arrow keys move and select, Home and End jump
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { useRef, type KeyboardEvent } from "react";
import { cn } from "@/lib/cn";

export type SegmentedOption<T extends string> = {
  value: T;
  label: string;
  disabled?: boolean;
};

type SegmentedControlProps<T extends string> = {
  options: readonly SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Accessible name of the group, for example "Message filter". */
  label: string;
  className?: string;
};

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);

  const enabled = options.map((option, index) => (option.disabled ? -1 : index)).filter((index) => index >= 0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  // If the value matches no enabled option, the first enabled one is still reachable with Tab.
  const tabbableIndex = enabled.includes(selectedIndex) ? selectedIndex : (enabled[0] ?? -1);

  function select(index: number) {
    buttons.current[index]?.focus();
    onChange(options[index].value);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (enabled.length === 0) return;
    const position = enabled.indexOf(tabbableIndex);
    let next: number | undefined;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = enabled[(position + 1) % enabled.length];
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = enabled[(position - 1 + enabled.length) % enabled.length];
        break;
      case "Home":
        next = enabled[0];
        break;
      case "End":
        next = enabled[enabled.length - 1];
        break;
      default:
        return;
    }
    event.preventDefault();
    select(next);
  }

  return (
    <div role="radiogroup" aria-label={label} onKeyDown={onKeyDown} className={cn("inline-flex gap-1", className)}>
      {options.map((option, index) => {
        const checked = index === selectedIndex;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttons.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            disabled={option.disabled}
            tabIndex={index === tabbableIndex ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              "min-h-11 rounded-control px-3 py-1.5 text-caption font-medium transition-colors md:min-h-8",
              "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
              checked
                ? "bg-secondary-soft text-secondary-text"
                : "text-ink-muted hover:bg-surface-raised hover:text-ink",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
