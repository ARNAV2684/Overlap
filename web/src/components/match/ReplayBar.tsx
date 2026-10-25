"use client";

// ReplayBar.tsx — Replay controls
//
// Purpose: play and pause, 1× / 5× / 20×, restart, and a progress line through the match with a mark for every
//          moment explained so far, for archived matches
// Inputs:  the replay player from ReplayProvider; an initial speed; the moments shown so far
// Outputs: UI
// Spec:    web/specs/screens.md §2.4

import { useEffect, useRef } from "react";
import { SPEEDS, type ReplaySpeed } from "@/lib/replay-player";
import { useReplayPlayer, useReplayState } from "@/providers/ReplayProvider";
import { MOMENT_KIND_LABEL, momentKind } from "@/lib/live/live-insights";
import { useVisibleCards } from "./MomentStrip";

export function ReplayBar({ initialSpeed }: { initialSpeed?: ReplaySpeed }) {
  const player = useReplayPlayer();
  const state = useReplayState();
  const applied = useRef(false);
  useEffect(() => {
    if (!applied.current && initialSpeed) {
      applied.current = true;
      player.setSpeed(initialSpeed);
    }
  }, [player, initialSpeed]);

  const duration = state.manifest?.duration_ms ?? 0;
  const progress = duration ? Math.min(1, state.playheadMs / duration) : 0;
  const playing = state.status === "playing";
  // Moments already shown, as marks on the progress line (later ones stay hidden: no spoilers)
  const marks = useVisibleCards();
  const btn = "grid h-9 min-w-9 place-items-center rounded-full px-3 font-mono text-[11px] font-black transition-colors";

  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-white/10 bg-[#0e0e10]/80 p-1.5 text-white backdrop-blur-md">
      <button
        type="button"
        className={`${btn} bg-white text-[#0e0e10] hover:bg-white/90`}
        onClick={() => (playing ? player.pause() : player.play())}
        aria-label={playing ? "Pause" : "Play"}
        disabled={state.status === "loading" || state.status === "failed"}
      >
        {playing ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <rect x="2" y="1" width="3" height="10" rx="1" fill="currentColor" />
            <rect x="7" y="1" width="3" height="10" rx="1" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M3 1.5v9l7.5-4.5z" fill="currentColor" />
          </svg>
        )}
      </button>
      <div className="flex rounded-full bg-white/[0.06] p-0.5" role="radiogroup" aria-label="Replay speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={state.speed === s}
            onClick={() => player.setSpeed(s)}
            className={`${btn} h-8 ${state.speed === s ? "bg-white/90 text-[#0e0e10]" : "text-white/60 hover:text-white"}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <div className="hidden w-28 items-center sm:flex md:w-44" aria-label={`Replay progress ${Math.round(progress * 100)}%`}>
        <div className="relative h-1 w-full rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
          {duration > 0 &&
            marks.map((c) => (
              <span
                key={c.overlay_id}
                className={`absolute top-1/2 h-2.5 w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full ${c.priority === "high" ? "bg-white" : "bg-white/55"}`}
                style={{ left: `${Math.min(1, c.show_at_ms / duration) * 100}%` }}
                title={`${c.clock.split(":")[0]}′ ${MOMENT_KIND_LABEL[momentKind(c)]}`}
              />
            ))}
        </div>
      </div>
      <button type="button" className={`${btn} text-white/60 hover:text-white`} onClick={() => player.restart()} aria-label="Restart from kick-off">
        ↺
      </button>
      {state.buffering && <span className="pr-2 font-mono text-[10px] text-white/50">Loading…</span>}
    </div>
  );
}
