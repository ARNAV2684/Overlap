// IntroHero.tsx — Page intro
//
// Purpose: the intro under the header: eyebrow, the page's one h1, a short line, and an optional block on the right
//          (the SourceCard on the live screen)
// Inputs:  eyebrow?, title?, description? (default to the live screen's copy), aside?, titleAs? (default h1), className
// Outputs: a div. Side by side from 680 px, stacked below
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6

import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

type IntroHeroProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  description?: ReactNode;
  /** Right-hand block, for example <SourceCard />. */
  aside?: ReactNode;
  /** Heading level of the title. h1 on a screen (its only h1); h2 when previewed inside another page. */
  titleAs?: "h1" | "h2";
  className?: string;
};

export function IntroHero({
  eyebrow = "Local match observatory",
  title = "Watch the data move.",
  description = "Real incoming messages from your running synthetic match.",
  aside,
  titleAs: Title = "h1",
  className,
}: IntroHeroProps) {
  return (
    <div
      className={cn(
        "mt-7 mb-5 flex flex-col gap-4 min-[680px]:flex-row min-[680px]:items-start min-[680px]:justify-between",
        "min-[680px]:gap-6 lg:items-center",
        className,
      )}
    >
      <div className="min-w-0">
        <Eyebrow className="text-accent-text">{eyebrow}</Eyebrow>
        <Title className="mt-2 text-display text-ink">{title}</Title>
        <p className="mt-2 text-body text-ink-muted">{description}</p>
      </div>
      {aside ? <div className="min-[680px]:max-w-[300px] min-[680px]:shrink-0">{aside}</div> : null}
    </div>
  );
}
