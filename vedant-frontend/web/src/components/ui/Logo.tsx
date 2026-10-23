// Logo.tsx — Overlap logo
//
// Purpose: the mark (two overlapping circles, orange and blue) and the "OVERLAP" wordmark
// Inputs:  size ("sm" | "md", default md), showWordmark? (default true), className
// Outputs: an inline element. With the wordmark the mark is decorative; without it the mark is labelled "Overlap"
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import { cn } from "@/lib/cn";

type LogoProps = {
  size?: "sm" | "md";
  showWordmark?: boolean;
  className?: string;
};

export function Logo({ size = "md", showWordmark = true, className }: LogoProps) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <svg
        viewBox="0 0 28 28"
        className={size === "sm" ? "size-6" : "size-8"}
        role={showWordmark ? undefined : "img"}
        aria-label={showWordmark ? undefined : "Overlap"}
        aria-hidden={showWordmark ? true : undefined}
      >
        <circle cx="9" cy="14" r="10" className="fill-orange-500" />
        <circle cx="19" cy="14" r="10" className="fill-blue-500" />
        {/* The overlap: the lens where the two circles meet */}
        <path d="M14 5.34A10 10 0 0 1 14 22.66A10 10 0 0 1 14 5.34Z" className="fill-ink" />
      </svg>
      {showWordmark ? (
        <span className={cn("font-extrabold tracking-[0.18em] text-ink", size === "sm" ? "text-heading" : "text-title")}>
          OVERLAP
        </span>
      ) : null}
    </span>
  );
}
