"use client";

// ReplayBar.tsx — Replay controls
//
// Purpose: play and pause, 1× / 5× / 20×, restart, and a progress line through the match, for archived matches
// Inputs:  the replay player from ReplayProvider; an initial speed
// Outputs: UI
// Spec:    web/specs/screens.md §2.4

import { useEffect, useRef } from "react";
import { SPEEDS, type ReplaySpeed } from "@/lib/replay-player";
import { useReplayPlayer, useReplayState } from "@/providers/ReplayProvider";

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
        <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-accent transition-[width] duration-200" style={{ width: `${progress * 100}%` }} />
        </div>
      </div>
      <button type="button" className={`${btn} text-white/60 hover:text-white`} onClick={() => player.restart()} aria-label="Restart from kick-off">
        ↺
      </button>
      {state.buffering && <span className="pr-2 font-mono text-[10px] text-white/50">Loading…</span>}
    </div>
  );
}
