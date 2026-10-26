"use client";

// StartMatchButton.tsx — Kick off a live match
//
// Purpose: one button that asks /api/start-match for a new live match; the home page switches to it by itself as soon
//          as its first frames arrive
// Inputs:  none
// Outputs: UI (hidden where starting is not available, e.g. locally)
// Spec:    web/specs/realtime.md §8

import { useEffect, useState } from "react";

type Phase = { kind: "idle" } | { kind: "starting" } | { kind: "started"; matchId: string } | { kind: "error"; text: string };

const MESSAGES: Record<string, string> = {
  match_running: "A match is already being played. It will show here in a moment.",
  rate_limited: "That's enough kick-offs for now. Try again in a little while.",
  start_pending: "The start is awaiting confirmation. Please wait; another match will not be started.",
  start_failed: "The match couldn't start. Try again in a minute.",
};

export function StartMatchButton() {
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let stopped = false;
    const refresh = async () => {
      try {
        const response = await fetch("/api/start-match", { cache: "no-store" });
        const body = await response.json();
        if (!stopped) setAvailable(response.ok && body.available === true);
      } catch { if (!stopped) setAvailable(false); }
    };
    void refresh();
    const timer = setInterval(refresh, 30_000);
    return () => { stopped = true; clearInterval(timer); };
  }, []);
  if (!available) return null;

  const start = async () => {
    setPhase({ kind: "starting" });
    try {
      const response = await fetch("/api/start-match", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { match_id?: string; error?: string };
      if (response.status === 503) return setAvailable(false);
      if (response.ok && body.match_id) return setPhase({ kind: "started", matchId: body.match_id });
      setPhase({ kind: "error", text: MESSAGES[body.error ?? ""] ?? MESSAGES.start_failed });
    } catch {
      setPhase({ kind: "error", text: MESSAGES.start_failed });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={start}
        disabled={phase.kind === "starting" || phase.kind === "started"}
        className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[13px] font-bold text-on-accent transition-opacity hover:opacity-90 disabled:opacity-60"
      >
        <span className="ov-live-dot" />
        {phase.kind === "starting" ? "Starting…" : phase.kind === "started" ? "Kicking off…" : "Start a live match"}
      </button>
      {phase.kind === "started" && (
        <span className="text-[13px] text-ink/55">{phase.matchId} is warming up: it appears here when the first frames arrive (about a minute).</span>
      )}
      {phase.kind === "error" && <span className="text-[13px] text-ink/55">{phase.text}</span>}
    </div>
  );
}
