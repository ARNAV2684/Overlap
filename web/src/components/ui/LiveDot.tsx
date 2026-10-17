// LiveDot.tsx — Live marker
//
// Purpose: the small dot that says "this is live"
// Inputs:  pulsing? (default false), className
// Outputs: a decorative span. The pulse only runs when the user has not asked for reduced motion
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { cn } from "@/lib/cn";

export function LiveDot({ pulsing = false, className }: { pulsing?: boolean; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("relative inline-flex size-1.5 shrink-0", className)}>
      {pulsing ? (
        <span className="absolute inline-flex size-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
      ) : null}
      <span className="relative inline-flex size-full rounded-full bg-primary" />
    </span>
  );
}
