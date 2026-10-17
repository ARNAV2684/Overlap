"use client";

// SegmentedDemo.tsx — Interactive demos for the dev page
//
// Purpose: give the SegmentedControl and a toggle Button real state on /dev/ui
// Inputs:  none
// Outputs: demo controls (development only)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

const filters = [
  { value: "events", label: "Match events" },
  { value: "tracking", label: "Tracking" },
  { value: "all", label: "All data" },
] as const;

const withDisabled = [
  { value: "a", label: "Alpha" },
  { value: "b", label: "Beta (disabled)", disabled: true },
  { value: "c", label: "Gamma" },
] as const;

export function SegmentedDemo() {
  const [filter, setFilter] = useState<(typeof filters)[number]["value"]>("events");
  const [other, setOther] = useState<(typeof withDisabled)[number]["value"]>("a");
  const [paused, setPaused] = useState(false);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl label="Message filter" options={filters} value={filter} onChange={setFilter} />
        <span data-testid="filter-value" className="text-code text-ink-muted">
          value: {filter}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <SegmentedControl label="Group with a disabled option" options={withDisabled} value={other} onChange={setOther} />
        <span data-testid="other-value" className="text-code text-ink-muted">
          value: {other}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <Button variant="secondary" size="sm" aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
          {paused ? "Resume feed" : "Pause feed"}
        </Button>
        <span data-testid="paused-value" className="text-code text-ink-muted">
          aria-pressed: {String(paused)}
        </span>
      </div>
    </div>
  );
}
