// format.ts — Formatting helpers
//
// Purpose: turn numbers and phases into the text the screen shows (match elapsed, receive time, phase, counts)
// Inputs:  milliseconds, epoch times, a match phase, counts
// Outputs: strings. Pure functions, no state
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 4.3
//
// Counts use a fixed locale ("en") so the server and the browser print the same text, and a mismatch cannot break
// hydration. Wall-clock time is the viewer's own clock and is only meant for client-side rendering.

import type { Phase } from "@/lib/contracts";

const pad = (n: number, width = 2) => String(n).padStart(width, "0");

/**
 * Match elapsed time from `match_ms`: minutes:seconds.milliseconds, for example 3,734,000 → "62:14.000".
 * Minutes keep counting past 59 (a match is never shown in hours). Negative or non-numeric input shows 00:00.000.
 * This is the play-time clock. It is not the envelope `clock` string, which is display text from the server.
 */
export function formatElapsed(matchMs: number): string {
  const total = Number.isFinite(matchMs) ? Math.max(0, Math.floor(matchMs)) : 0;
  const minutes = Math.floor(total / 60_000);
  const seconds = Math.floor(total / 1000) % 60;
  return `${pad(minutes)}:${pad(seconds)}.${pad(total % 1000, 3)}`;
}

/** The browser's wall-clock time of day, 24-hour, for example "19:04:11.532" (or "19:04:11" without milliseconds). */
export function formatWallTime(epochMs: number, withMs = true, timeZone?: string): string {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZone,
  });
  const time = formatter.format(new Date(epochMs));
  return withMs ? `${time}.${pad(((Math.floor(epochMs) % 1000) + 1000) % 1000, 3)}` : time;
}

const phaseLabels: Record<Phase, string> = {
  pre_match: "Pre-match",
  live: "Live",
  half_time: "Half time",
  full_time: "Full time",
};

/** "full_time" → "Full time". Show it in capitals with the uppercase class where the design wants that. */
export function formatPhase(phase: Phase): string {
  return phaseLabels[phase];
}

const countFormatter = new Intl.NumberFormat("en");

/** 1284 → "1,284". */
export function formatCount(n: number): string {
  return countFormatter.format(n);
}
