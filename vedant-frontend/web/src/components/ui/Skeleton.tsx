// Skeleton.tsx — Loading placeholder
//
// Purpose: a block that holds the space of content that has not arrived, so the layout does not jump
// Inputs:  className (give it the final size, for example "h-6 w-40")
// Outputs: a decorative div (hidden from screen readers, pulse stops under reduced motion)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { cn } from "@/lib/cn";

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn("rounded-control bg-surface-raised motion-safe:animate-pulse", className)}
    />
  );
}
