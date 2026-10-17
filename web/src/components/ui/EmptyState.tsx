// EmptyState.tsx — Nothing to show yet
//
// Purpose: a calm placeholder for lists and panels with no data ("Waiting for your first message…")
// Inputs:  title, hint?, className
// Outputs: a div announced politely to screen readers
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type EmptyStateProps = {
  title: ReactNode;
  hint?: ReactNode;
  className?: string;
};

export function EmptyState({ title, hint, className }: EmptyStateProps) {
  return (
    <div role="status" className={cn("px-6 py-9 text-center", className)}>
      <p className="text-body text-ink-muted">{title}</p>
      {hint ? <p className="mt-1.5 text-caption text-ink-muted">{hint}</p> : null}
    </div>
  );
}
