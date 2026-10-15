// Card.tsx — Small padded surface
//
// Purpose: the container for a single figure or short block (metric cards, the source card)
// Inputs:  children, className, native div attributes
// Outputs: a div
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: ComponentPropsWithoutRef<"div">) {
  return <div className={cn("rounded-panel border border-line bg-surface p-4 sm:p-5", className)} {...props} />;
}
