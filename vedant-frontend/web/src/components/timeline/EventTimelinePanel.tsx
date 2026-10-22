"use client";

// EventTimelinePanel.tsx — Event timeline
//
// Purpose: the main panel of the live screen: header with the live dot and pause button, filter tabs and row count,
//          column labels, the row list (newest first), and a footer explaining the columns
// Inputs:  EventTimelinePanel: the store from the nearest MatchStreamProvider (timeline, controls, inspector,
//          connection, scoreboard setup)
//          EventTimelinePanelView: rows, filter, paused, live, selectedKey, setup, and the actions onFilter?, onPause?,
//          onSelect? (absent on the loading fallback, which shows the same panel with its controls disabled)
// Outputs: a <section> labelled by its heading
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8
//
// The timeline, counters and pitch are display slices: pausing freezes them while reception and the scoreboard carry
// on. Selecting a row freezes the inspector on it; with nothing selected it follows the newest event.

import { useId, useMemo } from "react";
import { PauseButton } from "@/components/timeline/PauseButton";
import { TimelineFooter } from "@/components/timeline/TimelineFooter";
import { TimelineList } from "@/components/timeline/TimelineList";
import type { RowTeam } from "@/components/timeline/TimelineRow";
import { TimelineTableHead } from "@/components/timeline/TimelineTableHead";
import { TimelineToolbar } from "@/components/timeline/TimelineToolbar";
import { LiveDot } from "@/components/ui/LiveDot";
import { Panel } from "@/components/ui/Panel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { cn } from "@/lib/cn";
import type { MatchSetup } from "@/lib/contracts";
import type { Filter, TimelineRow } from "@/lib/store";
import { useConnection, useControls, useMatchStore, useScoreboard, useSelectedRow, useTimelineRows } from "@/lib/store-hooks";
import { teamColourStyle } from "@/lib/team-colours";

const NO_TEAMS: ReadonlyMap<string, RowTeam> = new Map();

/** team_id → the club's id, name and side, for the rows' team tags and accessible names. */
export function teamsFrom(setup: MatchSetup | null): ReadonlyMap<string, RowTeam> {
  if (!setup) return NO_TEAMS;
  return new Map(
    (["home", "away"] as const).map((side) => {
      const team = setup.teams[side];
      return [team.team_id, { id: team.team_id, name: team.name, side }];
    }),
  );
}

type EventTimelinePanelViewProps = {
  rows: readonly TimelineRow[];
  filter: Filter;
  paused: boolean;
  /** The stream is live (the dot pulses unless the feed is paused). */
  live: boolean;
  selectedKey: string | null;
  setup: MatchSetup | null;
  onFilter?: (filter: Filter) => void;
  onPause?: () => void;
  onSelect?: (key: string) => void;
  className?: string;
};

export function EventTimelinePanelView({
  rows,
  filter,
  paused,
  live,
  selectedKey,
  setup,
  onFilter,
  onPause,
  onSelect,
  className,
}: EventTimelinePanelViewProps) {
  const headingId = useId();
  const teams = useMemo(() => teamsFrom(setup), [setup]);

  return (
    <Panel
      aria-labelledby={headingId}
      style={teamColourStyle(setup)}
      className={cn("flex h-[540px] flex-col max-[1000px]:h-[450px] min-[1600px]:h-[610px]", className)}
    >
      <PanelHeader
        id={headingId}
        title="Event timeline"
        titleAdornment={<LiveDot pulsing={live && !paused} />}
        subtitle="Newest received first · select a row to inspect its data"
        action={<PauseButton paused={paused} onToggle={onPause} />}
      />
      <TimelineToolbar filter={filter} onFilter={onFilter} count={rows.length} />
      <TimelineTableHead />
      <TimelineList key={filter} rows={rows} teams={teams} selectedKey={selectedKey} onSelect={onSelect} label="Live event feed" />
      <TimelineFooter />
    </Panel>
  );
}

/** The timeline wired to the live store. Must sit inside a MatchStreamProvider. */
export function EventTimelinePanel({ className }: { className?: string }) {
  const store = useMatchStore();
  const timeline = useTimelineRows();
  const { paused } = useControls();
  const inspector = useSelectedRow();
  const { status } = useConnection();
  const { setup } = useScoreboard();

  return (
    <EventTimelinePanelView
      rows={timeline.rows}
      filter={timeline.filter}
      paused={paused}
      live={status === "live"}
      selectedKey={inspector.following ? null : (inspector.row?.key ?? null)}
      setup={setup}
      onFilter={store.setFilter}
      onPause={() => store.setPaused(!paused)}
      onSelect={store.select}
      className={className}
    />
  );
}
