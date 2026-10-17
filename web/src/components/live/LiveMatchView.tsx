// LiveMatchView.tsx — Live match screen
//
// Purpose: compose the live match screen from the layout components: header with the connection badge, intro with the
//          source card, the notice line, the screen's content, and the footer
// Inputs:  LiveMatchView: the store from the nearest MatchStreamProvider (read by AppHeader and NoticeBar)
//          LiveMatchFrame: header, notice, children (the parts that differ between live and loading)
// Outputs: LiveMatchView (live), LiveMatchFallback (the same frame in its starting "Connecting" state, with no store,
//          for the route's Suspense fallback), LiveMatchFrame (the shared layout)
// Spec:    web/specs/screens.md (live match screen). web/IMPLEMENTATION_PLAN.md Phase 6 (frame), Phase 10 (composition)
//
// The fallback matches the live screen's first render (status Connecting, the connecting notice), so the prerendered
// HTML does not jump when the live screen replaces it. The scoreboard, metrics and workspace (Phases 7 to 9) go inside
// <main>, after the notice.

import type { ReactNode } from "react";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader, AppHeaderView } from "@/components/layout/AppHeader";
import { AppShell } from "@/components/layout/AppShell";
import { IntroHero } from "@/components/layout/IntroHero";
import { NoticeBar, NoticeBarView } from "@/components/layout/NoticeBar";
import { SourceCard } from "@/components/layout/SourceCard";
import { notices } from "@/lib/store";

type LiveMatchFrameProps = {
  header: ReactNode;
  notice: ReactNode;
  children?: ReactNode;
};

export function LiveMatchFrame({ header, notice, children }: LiveMatchFrameProps) {
  return (
    <AppShell>
      {header}
      <main className="flex flex-1 flex-col">
        <IntroHero aside={<SourceCard />} />
        {notice}
        {children}
      </main>
      <AppFooter />
    </AppShell>
  );
}

/** The live screen. Must sit inside a MatchStreamProvider. */
export function LiveMatchView() {
  return <LiveMatchFrame header={<AppHeader />} notice={<NoticeBar />} />;
}

/** The screen before the match id is known and the store exists. Shows, but never announces, the starting notice. */
export function LiveMatchFallback() {
  return (
    <LiveMatchFrame
      header={<AppHeaderView status="connecting" />}
      notice={<NoticeBarView notice={{ text: notices.connecting, tone: "info" }} announce={false} />}
    />
  );
}
