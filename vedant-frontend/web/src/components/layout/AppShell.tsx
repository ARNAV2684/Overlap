// AppShell.tsx — Page frame
//
// Purpose: the centred, padded column every screen sits in (header, intro, content, footer)
// Inputs:  children, className
// Outputs: a div, at most 1510 px wide. The background glow is on <body> (globals.css), so it is not repeated here
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6
//
// A plain div on purpose: AppHeader and AppFooter render <header> and <footer>, which only count as the page's
// banner and contentinfo landmarks when they are not inside <main>, <section> or similar. The screen puts its own
// <main> between them.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function AppShell({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("mx-auto flex w-full max-w-[1510px] flex-1 flex-col px-4 pb-6 sm:px-5 lg:px-10", className)}>
      {children}
    </div>
  );
}
