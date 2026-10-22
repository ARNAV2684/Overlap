"use client";

// MessageInspectorPanel.tsx — Message inspector
//
// Purpose: show the exact message behind the selected timeline row, or the newest event while following: a label
//          ("Shot · elapsed 62:14.000 · 19:04:11.532"), the JSON, a copy button, and the count of rejected messages
// Inputs:  MessageInspectorPanel: the store from the nearest MatchStreamProvider (inspector, connection)
//          MessageInspectorPanelView: row, following, rejected, onFollowLatest? (absent on the loading fallback: the
//          button is disabled) (for pages, previews and the fallback without a store)
// Outputs: a <section> labelled by its heading
// Spec:    web/specs/screens.md (message inspector). web/IMPLEMENTATION_PLAN.md Phase 9.2 (B14)
//
// The inspector is a display slice: while the feed is paused it stays on what it showed. Selecting a row freezes it on
// that row; "Follow latest" goes back to the newest event. The footer only appears when a message has been rejected.

import { useId, useMemo } from "react";
import { CopyButton } from "@/components/inspector/CopyButton";
import { JsonViewer } from "@/components/inspector/JsonViewer";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { cn } from "@/lib/cn";
import { formatCount, formatElapsed, formatWallTime } from "@/lib/format";
import type { TimelineRow } from "@/lib/store";
import { useConnection, useMatchStore, useSelectedRow } from "@/lib/store-hooks";

/** "Shot · elapsed 62:14.000 · 19:04:11.532", or "… · history" for a snapshot row. */
export function inspectorLabel(row: TimelineRow | null): string {
  if (!row) return "Select any timeline row";
  return `${row.title} · elapsed ${formatElapsed(row.ms)} · ${row.received === null ? "history" : formatWallTime(row.received)}`;
}

function InspectorFooter({ rejected }: { rejected: number }) {
  if (rejected === 0) return null;
  return (
    <p className="border-t border-line px-4 py-3 text-caption text-accent-text sm:px-5">
      {formatCount(rejected)} {rejected === 1 ? "message" : "messages"} rejected by contract validation
    </p>
  );
}

type MessageInspectorPanelViewProps = {
  row: TimelineRow | null;
  following: boolean;
  rejected: number;
  onFollowLatest?: () => void;
  className?: string;
};

export function MessageInspectorPanelView({ row, following, rejected, onFollowLatest, className }: MessageInspectorPanelViewProps) {
  const headingId = useId();
  const json = useMemo(() => (row ? JSON.stringify(row.raw, null, 2) : null), [row]);

  return (
    <Panel aria-labelledby={headingId} className={cn("flex flex-col", className)}>
      <PanelHeader
        id={headingId}
        title="Message inspector"
        subtitle={inspectorLabel(row)}
        action={
          <Button size="sm" disabled={!onFollowLatest || following} onClick={onFollowLatest}>
            Follow latest
          </Button>
        }
      />
      <JsonViewer json={json} />
      <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 sm:px-5">
        <p className="text-caption text-ink-muted">{following ? "Following the newest event" : "Pinned to the selected row"}</p>
        <CopyButton text={json} />
      </div>
      <InspectorFooter rejected={rejected} />
    </Panel>
  );
}

/** The inspector wired to the live store. Must sit inside a MatchStreamProvider. */
export function MessageInspectorPanel({ className }: { className?: string }) {
  const store = useMatchStore();
  const { row, following } = useSelectedRow();
  const { rejected } = useConnection();
  return (
    <MessageInspectorPanelView
      row={row}
      following={following}
      rejected={rejected}
      onFollowLatest={store.followLatest}
      className={className}
    />
  );
}
