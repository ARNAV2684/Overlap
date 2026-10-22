// SourceCard.tsx — Data source
//
// Purpose: say where the live data comes from ("Live WebSocket · Web PubSub hub live"), so nobody mistakes the live
//          feed for the archive replay
// Inputs:  label? (default "Live WebSocket"), channel? (default "Web PubSub hub live"), note?, className
// Outputs: a Card
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

type SourceCardProps = {
  label?: string;
  /** What carries the data, shown in monospace. */
  channel?: string;
  note?: ReactNode;
  className?: string;
};

export function SourceCard({
  label = "Live WebSocket",
  channel = "Web PubSub hub live",
  note = "Connected through this app's /api/negotiate · separate from Event Hubs readback",
  className,
}: SourceCardProps) {
  return (
    <Card className={cn("p-4 sm:p-4", className)}>
      <Eyebrow>Source</Eyebrow>
      <p className="mt-1.5 text-body-sm font-medium text-ink">
        {label} · <span className="font-mono">{channel}</span>
      </p>
      {note ? <p className="mt-1 text-caption text-ink-muted">{note}</p> : null}
    </Card>
  );
}
