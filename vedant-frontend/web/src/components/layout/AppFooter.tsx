// AppFooter.tsx — Page footer
//
// Purpose: the closing line: a reminder that the data is synthetic, and how it is delivered
// Inputs:  note? (default: the local delivery line), className
// Outputs: a <footer> (the page's contentinfo landmark when it sits outside <main>). Side by side from 680 px,
//          stacked below
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6

import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

type AppFooterProps = {
  note?: ReactNode;
  className?: string;
};

export function AppFooter({
  note = "Live local delivery. No paid services. Keep the local stack running.",
  className,
}: AppFooterProps) {
  return (
    <footer
      className={cn(
        "mt-auto flex flex-col gap-1.5 pt-6 min-[680px]:flex-row min-[680px]:items-baseline min-[680px]:justify-between",
        "min-[680px]:gap-5",
        className,
      )}
    >
      <Eyebrow as="span">Synthetic data · invented clubs and players</Eyebrow>
      <span className="text-caption text-ink-muted">{note}</span>
    </footer>
  );
}
