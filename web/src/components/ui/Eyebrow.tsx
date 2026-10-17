// Eyebrow.tsx — Small uppercase label
//
// Purpose: the tiny uppercase label above a heading or number ("HOME", "MESSAGES RECEIVED")
// Inputs:  children, optional element via `as`, className, native attributes
// Outputs: a text element
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type EyebrowProps = ComponentPropsWithoutRef<"p"> & {
  /** Element to render. Use a heading level when the label really is a heading. */
  as?: "p" | "span" | "div" | "h2" | "h3";
};

export function Eyebrow({ as: Component = "p", className, ...props }: EyebrowProps) {
  return <Component className={cn("text-eyebrow uppercase text-ink-muted", className)} {...props} />;
}
