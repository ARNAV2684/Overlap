// ArrivalCell.tsx — Last column of a timeline row
//
// Purpose: when this browser received the row ("19:04:11.532" · "Live WebSocket"), or "History" · "Startup snapshot"
//          for rows that came from the snapshot. In a replay: "Replay · archive" (realtime.md §5.2)
// Inputs:  received (epoch ms, or null for history), tracking (true for a frame: "Live · bundled frame"); the stream
//          source from the nearest StreamSourceContext (default live)
// Outputs: a div, right-aligned
// Spec:    web/specs/screens.md (event timeline, replay screen). web/IMPLEMENTATION_PLAN.md Phase 8.1
//
// Wall time is the viewer's own clock. Rows only exist in the browser, so the server never renders one.

import { formatWallTime } from "@/lib/format";
import { useStreamSource } from "@/lib/stream-source";

const SOURCE_LABELS = {
  live: { row: "Live WebSocket", frame: "Live · bundled frame" },
  replay: { row: "Replay · archive", frame: "Replay · bundled frame" },
} as const;

export function ArrivalCell({ received, tracking = false }: { received: number | null; tracking?: boolean }) {
  const labels = SOURCE_LABELS[useStreamSource()];
  const history = received === null;
  return (
    <div className="min-w-0 text-right">
      <p className="font-mono text-body-sm numeric text-ink">{history ? "History" : formatWallTime(received)}</p>
      <p className="mt-0.5 text-label text-ink-muted">
        {history ? "Startup snapshot" : tracking ? labels.frame : labels.row}
      </p>
    </div>
  );
}
