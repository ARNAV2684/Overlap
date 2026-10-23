// PanelHeader.tsx — Panel title row
//
// Purpose: the heading row of a Panel: title, optional subtitle, optional marker next to the title, optional action
// Inputs:  title, subtitle?, titleAdornment?, action?, as? (heading level), id?, className
// Outputs: a header element
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 3

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PanelHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small marker after the title, for example a LiveDot. Keep it decorative. */
  titleAdornment?: ReactNode;
  /** Right-hand control, for example a Button. */
  action?: ReactNode;
  /** Heading level. Defaults to h2 (the page has one h1). */
  as?: "h2" | "h3";
  /** id for the heading, so a Panel can point at it with aria-labelledby. */
  id?: string;
  className?: string;
};

export function PanelHeader({
  title,
  subtitle,
  titleAdornment,
  action,
  as: Heading = "h2",
  id,
  className,
}: PanelHeaderProps) {
  return (
    <header className={cn("flex items-center justify-between gap-3 border-b border-line p-4 sm:p-5", className)}>
      <div className="min-w-0">
        <Heading id={id} className="flex items-center gap-2 text-heading text-ink">
          {title}
          {titleAdornment}
        </Heading>
        {subtitle ? <p className="mt-1.5 text-caption text-ink-muted">{subtitle}</p> : null}
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
