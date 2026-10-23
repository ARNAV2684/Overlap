// StatusBadge.tsx — Connection status
//
// Purpose: show the state of the live connection (header badge), as an icon, a word and a colour together
// Inputs:  status ("connecting" | "live" | "stale" | "reconnecting" | "finished"), label? (replaces the default word)
// Outputs: a pill announced politely when it changes. Colour is never the only signal
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import { LiveDot } from "@/components/ui/LiveDot";
import type { ConnectionStatus } from "@/lib/store";

// One definition of the statuses, shared with the store (src/lib/store.ts)
export type { ConnectionStatus };

const iconClass = "size-3.5 shrink-0 fill-none stroke-current stroke-2";

const config: Record<ConnectionStatus, { label: string; tone: string; icon: ReactNode }> = {
  connecting: {
    label: "Connecting",
    tone: "border-secondary/40 bg-secondary-soft text-secondary-text",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(iconClass, "motion-safe:animate-spin")}>
        <circle cx="12" cy="12" r="9" className="opacity-25" />
        <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
      </svg>
    ),
  },
  live: {
    label: "Live",
    tone: "border-primary/40 bg-primary/15 text-accent-text",
    icon: <LiveDot pulsing />,
  },
  stale: {
    label: "No recent data",
    tone: "border-card-yellow/40 bg-card-yellow-soft text-card-yellow",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClass}>
        <path d="M12 3 2.5 20h19L12 3Z" strokeLinejoin="round" />
        <path d="M12 10v4.5M12 17.5v.01" strokeLinecap="round" />
      </svg>
    ),
  },
  reconnecting: {
    label: "Reconnecting",
    tone: "border-secondary/40 bg-secondary-soft text-secondary-text",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={cn(iconClass, "motion-safe:animate-spin")}>
        <path d="M20 12a8 8 0 1 1-2.6-5.9" strokeLinecap="round" />
        <path d="M20 4v5h-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  finished: {
    label: "Match finished",
    tone: "border-line-strong bg-surface-raised text-ink",
    icon: (
      <svg viewBox="0 0 24 24" aria-hidden="true" className={iconClass}>
        <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
};

type StatusBadgeProps = {
  status: ConnectionStatus;
  label?: string;
  className?: string;
};

export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const { label: defaultLabel, tone, icon } = config[status];
  return (
    <span
      role="status"
      className={cn(
        "inline-flex items-center gap-2 rounded-pill border px-3 py-1.5 text-caption font-medium",
        tone,
        className,
      )}
    >
      {icon}
      {label ?? defaultLabel}
    </span>
  );
}
