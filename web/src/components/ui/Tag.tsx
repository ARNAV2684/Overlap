// Tag.tsx — Small outlined chip
//
// Purpose: a short label such as a team id ("NBR") on a timeline row
// Inputs:  children, tone ("neutral" | "home" | "away", default neutral), className
// Outputs: a span. home and away take their border from the team colours set on a parent (see Phase 7)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type TagProps = ComponentPropsWithoutRef<"span"> & {
  tone?: "neutral" | "home" | "away";
};

const tones = {
  neutral: "border-line-strong text-ink-muted",
  home: "border-team-home text-ink",
  away: "border-team-away text-ink",
} as const;

export function Tag({ tone = "neutral", className, ...props }: TagProps) {
  return (
    <span
      className={cn("inline-flex items-center rounded-control border px-1.5 py-0.5 text-label", tones[tone], className)}
      {...props}
    />
  );
}
