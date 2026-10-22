// Kbd.tsx — Keyboard key
//
// Purpose: show a key in a hint ("↑ ↓ to move, Enter to select")
// Inputs:  children, className, native attributes
// Outputs: a kbd element
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ className, ...props }: ComponentPropsWithoutRef<"kbd">) {
  return (
    <kbd
      className={cn(
        "rounded-control border border-line-strong bg-surface-raised px-1.5 py-0.5 font-mono text-code text-ink-muted",
        className,
      )}
      {...props}
    />
  );
}
