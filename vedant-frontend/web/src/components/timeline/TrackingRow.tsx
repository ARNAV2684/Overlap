// TrackingRow.tsx — A tracking frame in the timeline
//
// Purpose: one position frame: "Position frame" and "22 players · ball (x, y)". Muted, with the numbers in mono
// Inputs:  row (a tracking row from the store), plus the shell's selection props
// Outputs: a TimelineRowShell
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2

import { ArrivalCell } from "@/components/timeline/cells/ArrivalCell";
import { DetailCell } from "@/components/timeline/cells/DetailCell";
import { MatchTimeCell } from "@/components/timeline/cells/MatchTimeCell";
import { TimelineRowShell } from "@/components/timeline/TimelineRowShell";
import type { RowProps } from "@/components/timeline/TimelineRow";

export function TrackingRow({ row, label, selected, tabbable, onSelect, onFocusRow }: RowProps) {
  return (
    <TimelineRowShell
      rowKey={row.key}
      label={label}
      selected={selected}
      tabbable={tabbable}
      history={row.received === null}
      onSelect={onSelect}
      onFocusRow={onFocusRow}
    >
      <MatchTimeCell ms={row.ms} period={row.period} seq={row.seq} />
      <DetailCell
        icon="tracking"
        title={row.title}
        titleClassName="font-medium text-ink-muted"
        description={row.detail}
        descriptionClassName="font-mono numeric"
      />
      <ArrivalCell received={row.received} tracking />
    </TimelineRowShell>
  );
}
