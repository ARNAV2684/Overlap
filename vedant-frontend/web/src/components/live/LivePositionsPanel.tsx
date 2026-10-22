"use client";

// LivePositionsPanel.tsx — Live positions
//
// Purpose: the pitch panel in the right-hand column: header with the frame's elapsed time, the live pitch, a legend with
//          the clubs' names, and a note on how positions arrive
// Inputs:  LivePositionsPanel: the store from the nearest MatchStreamProvider (latest frame, players, setup)
//          LivePositionsPanelView: frame, players?, setup (for pages, previews and the loading fallback without a store)
// Outputs: a <section> labelled by its heading
// Spec:    web/specs/charts.md (live pitch). web/specs/screens.md (live match screen). web/IMPLEMENTATION_PLAN.md Phase 9.1
//
// The latest frame is a display slice: the pitch and its timestamp freeze while the feed is paused.

import { useId } from "react";
import { LivePitch, type KitColours } from "@/components/charts/LivePitch";
import { PitchLegend } from "@/components/charts/pitch/PitchLegend";
import { Panel } from "@/components/ui/Panel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { cn } from "@/lib/cn";
import type { MatchSetup, TrackingFrame } from "@/lib/contracts";
import { formatElapsed } from "@/lib/format";
import type { PlayerInfo } from "@/lib/store";
import { useLatestFrame, usePlayers, useScoreboard } from "@/lib/store-hooks";

const NO_PLAYERS: ReadonlyMap<string, PlayerInfo> = new Map();

function PitchTimestamp({ frame }: { frame: TrackingFrame | null }) {
  return (
    <p className="font-mono text-body-sm numeric text-ink">
      <span className="sr-only">Frame elapsed time </span>
      {frame ? formatElapsed(frame.match_ms) : "–"}
    </p>
  );
}

function PitchNote() {
  return (
    <p className="text-caption text-ink-muted">
      The stream delivers five tracking frames together, about once a second at 1×. The pitch shows the newest frame.
    </p>
  );
}

type LivePositionsPanelViewProps = {
  frame: TrackingFrame | null;
  players?: ReadonlyMap<string, PlayerInfo>;
  setup: MatchSetup | null;
  className?: string;
};

export function LivePositionsPanelView({ frame, players = NO_PLAYERS, setup, className }: LivePositionsPanelViewProps) {
  const headingId = useId();
  const home = setup ? { name: setup.teams.home.name, colour: setup.teams.home.colours.primary } : null;
  const away = setup ? { name: setup.teams.away.name, colour: setup.teams.away.colours.primary } : null;
  const colours: KitColours = home && away ? { home: home.colour, away: away.colour } : null;

  return (
    <Panel aria-labelledby={headingId} className={cn("flex flex-col", className)}>
      <PanelHeader
        id={headingId}
        title="Live positions"
        subtitle="Latest received tracking frame"
        action={<PitchTimestamp frame={frame} />}
      />
      <div className="flex flex-col gap-3 p-4 sm:p-5">
        <LivePitch frame={frame} players={players} colours={colours} />
        <PitchLegend home={home} away={away} />
        <PitchNote />
      </div>
    </Panel>
  );
}

/** The pitch panel wired to the live store. Must sit inside a MatchStreamProvider. */
export function LivePositionsPanel({ className }: { className?: string }) {
  const frame = useLatestFrame();
  const players = usePlayers();
  const { setup } = useScoreboard();
  return <LivePositionsPanelView frame={frame} players={players} setup={setup} className={className} />;
}
