"use client";

// ReplayControls.tsx — Replay controls
//
// Purpose: the toolbar between the notice line and the scoreboard: Play / Pause (or "Replay again"), the three speeds,
//          and how far the replay has got, as a clock and a read-only progress bar. "Retry" appears when a chunk could
//          not be loaded
// Inputs:  ReplayControls: the player (useReplayPlayer(), useReplayState()); ReplayControlsView: state and handlers
// Outputs: a role="toolbar" named "Replay controls"
// Spec:    web/specs/screens.md §1 (replay screen), web/specs/realtime.md §5.2
//
// Play / Pause is one button whose accessible name says what it will do, so focus stays on it when the name changes.
// The progress bar is not a seek control.

import { useReplayPlayer, useReplayState } from "@/components/replay/ReplayProvider";
import { Button } from "@/components/ui/Button";
import { replayClock, type ReplayManifest } from "@/lib/replay-envelopes";
import { SPEEDS, type ReplaySpeed, type ReplayState } from "@/lib/replay-player";

/** The display clock at a match time: "62:14", or "90+5:31" in stoppage time. */
export function replayClockAt(manifest: ReplayManifest | null, matchMs: number): string {
  const period = manifest?.periods.findLast((p) => matchMs >= p.start_ms);
  return period ? replayClock(period.period, Math.min(matchMs, period.end_ms) - period.start_ms) : "0:00";
}

type ReplayControlsViewProps = {
  state: ReplayState;
  onPlayPause?: () => void;
  onSpeed?: (speed: ReplaySpeed) => void;
  onRetry?: () => void;
};

export function ReplayControlsView({ state, onPlayPause, onSpeed, onRetry }: ReplayControlsViewProps) {
  const ready = state.manifest !== null && state.status !== "failed";
  const playing = state.status === "playing";
  const action = state.status === "finished" ? "Replay again" : playing ? "Pause" : "Play";
  const duration = state.manifest?.duration_ms ?? 0;
  const percent = duration > 0 ? Math.round((state.playheadMs / duration) * 1000) / 10 : 0;
  const progress = `${replayClockAt(state.manifest, state.playheadMs)} / ${state.manifest ? replayClockAt(state.manifest, duration) : "–:––"}`;

  return (
    <div
      role="toolbar"
      aria-label="Replay controls"
      className="mb-[18px] flex flex-wrap items-center gap-x-4 gap-y-3 rounded-panel border border-line bg-surface px-4 py-3"
    >
      <Button variant="primary" onClick={onPlayPause} disabled={!ready} className="min-w-[132px]">
        <svg viewBox="0 0 24 24" aria-hidden="true" className="size-4 shrink-0 fill-current">
          {playing ? <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" /> : <path d="M8 5.5v13l10.5-6.5z" />}
        </svg>
        {action}
      </Button>

      <div className="flex items-center gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((speed) => (
          <Button
            key={speed}
            size="sm"
            variant={state.speed === speed ? "secondary" : "ghost"}
            aria-pressed={state.speed === speed}
            aria-label={`Speed ${speed}×`}
            disabled={!ready}
            onClick={() => onSpeed?.(speed)}
          >
            {speed}×
          </Button>
        ))}
      </div>

      <div className="flex min-w-[200px] flex-1 items-center gap-3">
        <span className="shrink-0 font-mono text-body-sm numeric text-ink">{progress}</span>
        <div
          role="progressbar"
          aria-label="Replay progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          aria-valuetext={progress}
          className="h-1.5 flex-1 overflow-hidden rounded-pill bg-surface-raised"
        >
          <div
            className="h-full rounded-pill bg-primary motion-safe:transition-[width] motion-safe:duration-100"
            style={{ width: `${percent}%` }}
          />
        </div>
      </div>

      {state.chunkFailed ? (
        <Button size="sm" onClick={onRetry}>
          Retry
        </Button>
      ) : null}
    </div>
  );
}

export function ReplayControls() {
  const player = useReplayPlayer();
  const state = useReplayState();
  return (
    <ReplayControlsView
      state={state}
      onPlayPause={() => (state.status === "playing" ? player.pause() : player.play())}
      onSpeed={(speed) => player.setSpeed(speed)}
      onRetry={() => player.retry()}
    />
  );
}
