"use client";

// MetricsGrid.tsx — The four counters
//
// Purpose: messages received, live match events, tracking frames and the last message, four columns (two below 680 px)
// Inputs:  MetricsGrid: the counters slice from the nearest MatchStreamProvider (useCounters())
//          MetricsGridView: counters (for pages, previews and the loading fallback without a store)
// Outputs: a <dl>
// Spec:    web/specs/screens.md (counters). web/IMPLEMENTATION_PLAN.md Phase 7
//
// Counters are a display slice: they freeze while the feed is paused and catch up on resume. Snapshot history is
// never counted (store.ts). The wall time is the viewer's own clock; the server renders "Waiting", as lastAt is null
// until the first live message.

import { MetricCard } from "@/components/metrics/MetricCard";
import { cn } from "@/lib/cn";
import { formatCount, formatWallTime } from "@/lib/format";
import type { Counters } from "@/lib/store";
import { useCounters } from "@/lib/store-hooks";

export function MetricsGridView({ counters, className }: { counters: Counters; className?: string }) {
  return (
    <dl className={cn("mb-[18px] grid grid-cols-2 gap-3 min-[680px]:grid-cols-4 sm:gap-4", className)}>
      <MetricCard label="Messages received" value={formatCount(counters.messages)} hint="Since this connection" />
      <MetricCard label="Live match events" value={formatCount(counters.events)} hint="Passes, shots, fouls and more" />
      <MetricCard label="Tracking frames" value={formatCount(counters.frames)} hint="All frames received live" />
      <MetricCard
        label="Last message"
        value={counters.lastAt === null ? "Waiting" : formatWallTime(counters.lastAt, false)}
        hint={`${formatCount(counters.recent)} ${counters.recent === 1 ? "message" : "messages"} / last 10 seconds`}
      />
    </dl>
  );
}

/** The counters wired to the live store. Must sit inside a MatchStreamProvider. */
export function MetricsGrid({ className }: { className?: string }) {
  const counters = useCounters();
  return <MetricsGridView counters={counters} className={className} />;
}
