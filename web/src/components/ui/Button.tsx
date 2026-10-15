// Button.tsx — Button
//
// Purpose: every clickable action ("Pause feed", "Follow latest", "Copy")
// Inputs:  variant ("primary" | "secondary" | "ghost"), size ("sm" | "md"), loading?, native button attributes
// Outputs: a button. Type defaults to "button". Touch target is at least 44 px tall below the md breakpoint.
//          The focus ring comes from the global :focus-visible rule in globals.css
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/cn";

type ButtonProps = ComponentPropsWithoutRef<"button"> & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  /** Shows a spinner, sets aria-busy and ignores clicks. The label stays, so the button keeps its width. */
  loading?: boolean;
};

const variants = {
  // Dark text on orange: white on the primary colour is only 2.4:1
  primary: "border-transparent bg-primary text-primary-ink hover:bg-primary-hover",
  secondary: "border-line-strong bg-surface-raised text-ink hover:border-ink-muted",
  ghost: "border-transparent bg-transparent text-ink-muted hover:bg-surface-raised hover:text-ink",
} as const;

const sizes = {
  md: "min-h-11 min-w-11 px-4 py-2 text-body-sm md:min-h-9 md:min-w-0",
  sm: "min-h-11 min-w-11 px-3 py-1.5 text-caption md:min-h-8 md:min-w-0",
} as const;

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  type = "button",
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-control border font-medium transition-colors",
        "motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading ? (
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="size-4 shrink-0 fill-none stroke-current stroke-[3] motion-safe:animate-spin"
        >
          <circle cx="12" cy="12" r="9" className="opacity-25" />
          <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}
