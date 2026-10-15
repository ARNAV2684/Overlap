// SourceCard.tsx — Data source
//
// Purpose: say where the live data comes from ("Mock WebSocket · localhost:8787"), so nobody mistakes the local mock
//          for the Azure pipeline
// Inputs:  label? (default "Mock WebSocket"), baseUrl? (default env.streamBaseUrl), note?, className
// Outputs: a Card
// Spec:    web/specs/screens.md (live match screen layout). web/IMPLEMENTATION_PLAN.md Phase 6

import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";
import { env } from "@/lib/env";

type SourceCardProps = {
  label?: string;
  /** Stream server address. Only its host and port are shown. */
  baseUrl?: string;
  note?: ReactNode;
  className?: string;
};

/** "http://localhost:8787" → "localhost:8787". Falls back to the text as given if it is not a URL. */
export function sourceHost(baseUrl: string): string {
  try {
    return new URL(baseUrl).host || baseUrl;
  } catch {
    return baseUrl;
  }
}

export function SourceCard({
  label = "Mock WebSocket",
  baseUrl = env.streamBaseUrl,
  note = "Direct mock preview · separate from Event Hubs readback",
  className,
}: SourceCardProps) {
  return (
    <Card className={cn("p-4 sm:p-4", className)}>
      <Eyebrow>Source</Eyebrow>
      <p className="mt-1.5 text-body-sm font-medium text-ink">
        {label} · <span className="font-mono">{sourceHost(baseUrl)}</span>
      </p>
      {note ? <p className="mt-1 text-caption text-ink-muted">{note}</p> : null}
    </Card>
  );
}
