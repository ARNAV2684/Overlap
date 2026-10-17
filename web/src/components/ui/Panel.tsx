// Panel.tsx — Bordered surface
//
// Purpose: the container for each main block (event timeline, live positions, message inspector)
// Inputs:  children, optional element via `as`, className, native attributes (aria-labelledby, ...)
// Outputs: a section (or div, aside, article)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type PanelProps = ComponentPropsWithoutRef<"section"> & {
  as?: "section" | "div" | "aside" | "article";
};

export function Panel({ as: Component = "section", className, ...props }: PanelProps) {
  return (
    <Component
      className={cn("overflow-hidden rounded-panel border border-line bg-surface", className)}
      {...props}
    />
  );
}
