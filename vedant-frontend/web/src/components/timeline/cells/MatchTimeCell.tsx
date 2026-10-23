// MatchTimeCell.tsx — First column of a timeline row
//
// Purpose: when it happened in the match ("62:14.000"), with the period and the envelope it came in ("P2 · envelope #812")
// Inputs:  ms (match_ms), period?, seq (the envelope's seq)
// Outputs: a div
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1

import { formatElapsed } from "@/lib/format";

export function MatchTimeCell({ ms, period, seq }: { ms: number; period?: number; seq: number }) {
  return (
    <div className="min-w-0">
      <p className="font-mono text-body-sm numeric text-ink">{formatElapsed(ms)}</p>
      <p className="mt-0.5 text-label numeric text-ink-muted">
        P{period ?? "–"} · envelope #{seq}
      </p>
    </div>
  );
}
