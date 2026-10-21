"use client";

// ReplayMatchView.tsx — Replay screen
//
// Purpose: compose the replay screen from the live screen's frame and panels: the replay header and intro, the notice
//          line, the replay controls, then the scoreboard, counters, timeline, pitch and inspector fed by the player.
//          If the replay can't start, one message card replaces the controls and panels
// Inputs:  ReplayMatchView: the store and player from the nearest ReplayProvider; ReplayFallback: nothing
// Outputs: ReplayMatchView, ReplayFallback (the same screen before the match id is known, for the route's Suspense
//          fallback), ReplayHeaderView, ReplayFailureCard
// Spec:    web/specs/screens.md §1 (replay screen). Plan: plans/active/PLAN_web_replay.md
//
// The fallback matches the first render (badge Loading, the loading notice, the controls disabled, an empty
// scoreboard and zero counters), so the prerendered shell doesn't jump when the replay takes over.

import Link from "next/link";
import { AppHeaderView } from "@/components/layout/AppHeader";
import { NoticeBar, NoticeBarView } from "@/components/layout/NoticeBar";
import { LiveMatchFallback, LiveMatchFrame, Workspace } from "@/components/live/LiveMatchView";
import { LivePositionsPanel } from "@/components/live/LivePositionsPanel";
import { MessageInspectorPanel } from "@/components/inspector/MessageInspectorPanel";
import { MetricsGrid } from "@/components/metrics/MetricsGrid";
import { ReplayControls, ReplayControlsView } from "@/components/replay/ReplayControls";
import { ReplayIntro, ReplayIntroView } from "@/components/replay/ReplayIntro";
import { useReplayPlayer, useReplayState } from "@/components/replay/ReplayProvider";
import { Scoreboard } from "@/components/Scoreboard";
import { EventTimelinePanel } from "@/components/timeline/EventTimelinePanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DEFAULT_SPEED, replayNotices, type ReplayFailure, type ReplayState } from "@/lib/replay-player";
import type { ConnectionStatus } from "@/lib/store";
import { useMatchStore } from "@/lib/store-hooks";

/** The badge: Loading, "Replay · 20×", Paused, Replay finished, or Unavailable (screens.md §1). */
export function replayBadge(state: ReplayState): { status: ConnectionStatus; label: string } {
  switch (state.status) {
    case "loading":
      return { status: "connecting", label: "Loading" };
    case "playing":
      return { status: "live", label: `Replay · ${state.speed}×` };
    case "paused":
      return { status: "finished", label: "Paused" };
    case "finished":
      return { status: "finished", label: "Replay finished" };
    case "failed":
      return { status: "stale", label: "Unavailable" };
  }
}

export function ReplayHeaderView({ state }: { state: ReplayState }) {
  const { status, label } = replayBadge(state);
  return <AppHeaderView section="Replay" status={status} statusLabel={label} />;
}

/** What to say, and offer, when the replay can't start. */
export function ReplayFailureCard({ failure, matchId, onRetry }: { failure: ReplayFailure; matchId: string; onRetry?: () => void }) {
  const message = {
    not_found: `No archived match ${matchId}.`,
    not_finished: `${matchId} is still being played.`,
    not_ready: `${matchId} has no setup in the archive yet.`,
    unreachable: "The match archive can't be reached.",
  }[failure];
  return (
    <Card role="alert" className="mb-[18px] flex flex-col items-start gap-3">
      <p className="text-body text-ink">{message}</p>
      {failure === "not_found" ? (
        <Link href="/" className="text-body-sm font-medium text-secondary-text underline underline-offset-4">
          Back to the match list
        </Link>
      ) : null}
      {failure === "not_finished" ? (
        <Link
          href={`/match/${matchId}`}
          className="text-body-sm font-medium text-secondary-text underline underline-offset-4"
        >
          Watch it live
        </Link>
      ) : null}
      {failure === "unreachable" ? <Button onClick={onRetry}>Retry</Button> : null}
    </Card>
  );
}

/** The replay screen. Must sit inside a ReplayProvider. */
export function ReplayMatchView() {
  const state = useReplayState();
  const player = useReplayPlayer();
  const { matchId } = useMatchStore();
  return (
    <LiveMatchFrame header={<ReplayHeaderView state={state} />} notice={<NoticeBar />} intro={<ReplayIntro />}>
      {state.status === "failed" && state.failure ? (
        <ReplayFailureCard failure={state.failure} matchId={matchId} onRetry={() => player.start()} />
      ) : (
        <>
          <ReplayControls />
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
        </>
      )}
    </LiveMatchFrame>
  );
}

const LOADING: ReplayState = {
  status: "loading",
  speed: DEFAULT_SPEED,
  playheadMs: 0,
  manifest: null,
  buffering: false,
  chunkFailed: false,
  failure: null,
};

/** The replay screen before the match id is known and the store exists. */
export function ReplayFallback() {
  return (
    <LiveMatchFallback
      header={<ReplayHeaderView state={LOADING} />}
      notice={<NoticeBarView notice={{ text: replayNotices.loading, tone: "info" }} announce={false} />}
      intro={<ReplayIntroView manifest={null} />}
      lead={<ReplayControlsView state={LOADING} />}
    />
  );
}
