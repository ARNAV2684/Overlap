// LiveMatchView.tsx — Live match screen
//
// Purpose: compose the live match screen from the layout components: header with the connection badge, intro with the
//          source card, the notice line, the screen's content, and the footer
// Inputs:  LiveMatchView: the store from the nearest MatchStreamProvider (read by AppHeader, NoticeBar, Scoreboard,
//          MetricsGrid, EventTimelinePanel, LivePositionsPanel and MessageInspectorPanel)
//          LiveMatchFrame: header, notice, intro?, children (the parts that differ between live, loading and replay)
// Outputs: LiveMatchView (live), LiveMatchFallback (the same frame in its starting "Connecting" state, with no store,
//          for the route's Suspense fallback; the replay screen passes its own header, notice, intro and controls),
//          LiveMatchFrame (the shared layout), Workspace (timeline beside pitch and inspector)
// Spec:    web/specs/screens.md (live match screen). web/IMPLEMENTATION_PLAN.md Phase 6 (frame), Phase 7 (scoreboard,
//          metrics), Phase 8 (timeline), Phase 9 (pitch), Phase 10 (composition)
//
// The fallback matches the live screen's first render (status Connecting, the connecting notice, an empty scoreboard
// and zero counters, an empty timeline with its controls disabled), so the prerendered HTML does not jump when the live
// screen replaces it. Only the match id differs: the fallback does not know it yet and shows a skeleton of the same size.
// The workspace is one column below 1000 px, then the timeline (about 1.65 fr) beside the right-hand column: the pitch,
// and the message inspector below it.

import type { ReactNode } from "react";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader, AppHeaderView } from "@/components/layout/AppHeader";
import { AppShell } from "@/components/layout/AppShell";
import { IntroHero } from "@/components/layout/IntroHero";
import { NoticeBar, NoticeBarView } from "@/components/layout/NoticeBar";
import { SourceCard } from "@/components/layout/SourceCard";
import { LivePositionsPanel, LivePositionsPanelView } from "@/components/live/LivePositionsPanel";
import { MessageInspectorPanel, MessageInspectorPanelView } from "@/components/inspector/MessageInspectorPanel";
import { MetricsGrid, MetricsGridView } from "@/components/metrics/MetricsGrid";
import { Scoreboard, ScoreboardView } from "@/components/Scoreboard";
import { EventTimelinePanel, EventTimelinePanelView } from "@/components/timeline/EventTimelinePanel";
import { emptyCounters, emptyScoreboard, notices } from "@/lib/store";

/** Timeline on the left; the right-hand column (pitch, then the inspector) beside it from 1000 px, as a complementary
 *  landmark so screen-reader users can jump to it. Shared with the replay screen. */
export function Workspace({ timeline, side }: { timeline: ReactNode; side: ReactNode }) {
  return (
    <div className="mb-[18px] grid grid-cols-1 gap-[18px] min-[1000px]:grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]">
      {timeline}
      <aside aria-label="Positions and message inspector" className="flex min-w-0 flex-col gap-[18px]">
        {side}
      </aside>
    </div>
  );
}

type LiveMatchFrameProps = {
  header: ReactNode;
  notice: ReactNode;
  /** Replaces the live screen's intro and source card (the replay screen has its own). */
  intro?: ReactNode;
  children?: ReactNode;
};

export function LiveMatchFrame({ header, notice, intro, children }: LiveMatchFrameProps) {
  return (
    <AppShell>
      {header}
      <main className="flex flex-1 flex-col">
        {intro ?? <IntroHero aside={<SourceCard />} />}
        {notice}
        {children}
      </main>
      <AppFooter />
    </AppShell>
  );
}

/** The live screen. Must sit inside a MatchStreamProvider. */
export function LiveMatchView() {
  return (
    <LiveMatchFrame header={<AppHeader />} notice={<NoticeBar />}>
      <Scoreboard />
      <MetricsGrid />
      <Workspace
        timeline={<EventTimelinePanel />}
        side={
          <>
            <LivePositionsPanel />
            <MessageInspectorPanel />
          </>
        }
      />
    </LiveMatchFrame>
  );
}

type LiveMatchFallbackProps = {
  /** The replay screen passes its own header, notice and intro, and its controls as `lead` above the scoreboard. */
  header?: ReactNode;
  notice?: ReactNode;
  intro?: ReactNode;
  lead?: ReactNode;
};

/** The screen before the match id is known and the store exists. Shows, but never announces, the starting notice. */
export function LiveMatchFallback({ header, notice, intro, lead }: LiveMatchFallbackProps = {}) {
  return (
    <LiveMatchFrame
      header={header ?? <AppHeaderView status="connecting" />}
      notice={notice ?? <NoticeBarView notice={{ text: notices.connecting, tone: "info" }} announce={false} />}
      intro={intro}
    >
      {lead}
      <ScoreboardView scoreboard={emptyScoreboard("")} matchId={null} />
      <MetricsGridView counters={emptyCounters()} />
      <Workspace
        timeline={<EventTimelinePanelView rows={[]} filter="events" paused={false} live={false} selectedKey={null} setup={null} />}
        side={
          <>
            <LivePositionsPanelView frame={null} setup={null} />
            <MessageInspectorPanelView row={null} following rejected={0} />
          </>
        }
      />
    </LiveMatchFrame>
  );
}
