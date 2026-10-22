// TimelineRow.tsx — One timeline row, whatever its kind
//
// Purpose: pick the row component for row.kind (EventRow, StatusRow, TrackingRow), and word the row's accessible name
// Inputs:  row, team? (the row's club, for event rows), selected, tabbable, onSelect(key), onFocusRow(key)
// Outputs: TimelineRow (memoised: a row re-renders only when its own props change), rowLabel()
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1, 8.3 (performance)
//
// Rows are immutable in the store and keyed by row.key, so with stable handlers only new or (de)selected rows render.

import { memo } from "react";
import { EventRow } from "@/components/timeline/EventRow";
import { StatusRow, statusText } from "@/components/timeline/StatusRow";
import { TrackingRow } from "@/components/timeline/TrackingRow";
import { formatElapsed } from "@/lib/format";
import type { TimelineRow as Row } from "@/lib/store";

/** The club a row belongs to: its id (shown in the tag), name (read out) and side (the tag's colour). */
export type RowTeam = { id: string; name: string; side: "home" | "away" };

export type RowProps = {
  row: Row;
  team?: RowTeam;
  label: string;
  selected: boolean;
  tabbable: boolean;
  onSelect?: (key: string) => void;
  onFocusRow?: (key: string) => void;
};

/** The match clock a row is read out at: the server's display clock when the message has one, else from match_ms. */
function clockOf(row: Row): string {
  const clock = row.event?.clock ?? (row.raw as { clock?: unknown }).clock;
  return typeof clock === "string" ? clock : formatElapsed(row.ms).slice(0, -4);
}

/** What a screen reader says for a row, e.g. "Shot, Northbridge FC, Nora 9, saved, at 62:14". */
export function rowLabel(row: Row, team?: RowTeam): string {
  const detail = row.kind === "status" ? statusText(row) : row.detail;
  const parts = [row.title, ...(team ? [team.name] : []), detail.replaceAll(" · ", ", ")];
  return `${parts.join(", ")}, at ${clockOf(row)}${row.received === null ? ", history" : ""}`;
}

function TimelineRowView(props: Omit<RowProps, "label">) {
  const label = rowLabel(props.row, props.team);
  if (props.row.kind === "status") return <StatusRow {...props} label={label} />;
  if (props.row.kind === "tracking") return <TrackingRow {...props} label={label} />;
  return <EventRow {...props} label={label} />;
}

export const TimelineRow = memo(TimelineRowView);
