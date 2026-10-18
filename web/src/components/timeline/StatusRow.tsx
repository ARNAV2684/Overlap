// StatusRow.tsx — A match state change in the timeline
//
// Purpose: a status envelope: "Match state" with the phase and the score ("Half time · 1–0"). Neutral, with the title in
//          secondary text
// Inputs:  row (a status row from the store), plus the shell's selection props
// Outputs: a TimelineRowShell
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2

import { ArrivalCell } from "@/components/timeline/cells/ArrivalCell";
import { DetailCell } from "@/components/timeline/cells/DetailCell";
import { MatchTimeCell } from "@/components/timeline/cells/MatchTimeCell";
import { TimelineRowShell } from "@/components/timeline/TimelineRowShell";
import type { RowProps } from "@/components/timeline/TimelineRow";
import type { Envelope, StatusData } from "@/lib/contracts";
import type { TimelineRow } from "@/lib/store";

/** "Half time · 1–0": the phase from the row, the score from its envelope. */
export function statusText(row: TimelineRow): string {
  const score = (row.raw as Envelope<"status", StatusData>).data?.score;
  return score ? `${row.detail} · ${score.home}–${score.away}` : row.detail;
}

export function StatusRow({ row, team: _team, ...shell }: RowProps) {
  return (
    <TimelineRowShell {...shell} rowKey={row.key} history={row.received === null}>
      <MatchTimeCell ms={row.ms} period={row.period} seq={row.seq} />
      <DetailCell icon="status" title={row.title} titleClassName="text-secondary-text" description={statusText(row)} />
      <ArrivalCell received={row.received} />
    </TimelineRowShell>
  );
}
