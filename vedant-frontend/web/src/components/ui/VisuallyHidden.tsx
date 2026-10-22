// VisuallyHidden.tsx — Screen-reader-only text
//
// Purpose: text that screen readers read but sighted users don't see (names for icon-only controls, announcements)
// Inputs:  children, native span attributes (for example aria-live)
// Outputs: a span
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function VisuallyHidden({ className, ...props }: ComponentPropsWithoutRef<"span">) {
  return <span className={cn("sr-only", className)} {...props} />;
}
