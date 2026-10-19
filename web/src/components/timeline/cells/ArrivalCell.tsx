// ArrivalCell.tsx — Last column of a timeline row
//
// Purpose: when this browser received the row ("19:04:11.532" · "Live WebSocket"), or "History" · "Startup snapshot"
//          for rows that came from the snapshot
// Inputs:  received (epoch ms, or null for history), tracking (true for a frame: "Live · bundled frame")
// Outputs: a div, right-aligned
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1
//
// Wall time is the viewer's own clock. Rows only exist in the browser, so the server never renders one.

import { formatWallTime } from "@/lib/format";

export function ArrivalCell({ received, tracking = false }: { received: number | null; tracking?: boolean }) {
  const history = received === null;
  return (
    <div className="min-w-0 text-right">
      <p className="font-mono text-body-sm numeric text-ink">{history ? "History" : formatWallTime(received)}</p>
      <p className="mt-0.5 text-label text-ink-muted">
        {history ? "Startup snapshot" : tracking ? "Live · bundled frame" : "Live WebSocket"}
      </p>
    </div>
  );
}
