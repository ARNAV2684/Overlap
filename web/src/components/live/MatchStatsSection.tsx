"use client";

// MatchStatsSection.tsx — Match stats
//
// Purpose: the stats engine's panels on the screen: team stats beside the momentum tide, then one "Team shape" panel
//          with a tab per pitch chart (pass network, pressing, touches) and a team switch
// Inputs:  MatchStatsSection: the store from the nearest MatchStreamProvider or ReplayProvider (stats, setup, players)
//          MatchStatsSectionView: stats, setup, players? (for the loading fallback without a store)
// Outputs: a <section> named "Match stats" holding three panels
// Spec:    web/specs/screens.md §1 (match stats). web/specs/charts.md §2 (charts fed by stat panels)
//
// Stats are a display slice: the section freezes with the rest of the display while the feed is paused. The chart and
// team choices are this viewer's own and stay put when new panels arrive. Kit colours come from teamColourStyle().

import { useId, useMemo, useState } from "react";
import { HeatmapZones } from "@/components/charts/HeatmapZones";
import { MomentumTide } from "@/components/charts/MomentumTide";
import { PassNetwork } from "@/components/charts/PassNetwork";
import { PressingZones } from "@/components/charts/PressingZones";
import { StatBars } from "@/components/charts/StatBars";
import { Panel } from "@/components/ui/Panel";
import { PanelHeader } from "@/components/ui/PanelHeader";
import { SegmentedControl, type SegmentedOption } from "@/components/ui/SegmentedControl";
import { cn } from "@/lib/cn";
import type { MatchSetup } from "@/lib/contracts";
import type { Side } from "@/lib/coordinates";
import { tideSeries } from "@/lib/stat-charts";
import type { PlayerInfo, Stats } from "@/lib/store";
import { usePlayers, useScoreboard, useStats } from "@/lib/store-hooks";
import { teamColourStyle } from "@/lib/team-colours";

export type ShapeChart = "network" | "pressing" | "touches";

const CHARTS: readonly SegmentedOption<ShapeChart>[] = [
  { value: "network", label: "Pass network" },
  { value: "pressing", label: "Pressing" },
  { value: "touches", label: "Touches" },
];

const NO_PLAYERS: ReadonlyMap<string, PlayerInfo> = new Map();

function PanelClock({ clock, label }: { clock: string | undefined; label: string }) {
  return (
    <p className="font-mono text-body-sm numeric text-ink">
      <span className="sr-only">{label} </span>
      {clock ?? "–"}
    </p>
  );
}

type MatchStatsSectionViewProps = {
  stats: Stats;
  setup: MatchSetup | null;
  players?: ReadonlyMap<string, PlayerInfo>;
  className?: string;
};

export function MatchStatsSectionView({ stats, setup, players = NO_PLAYERS, className }: MatchStatsSectionViewProps) {
  const barsId = useId();
  const tideId = useId();
  const shapeId = useId();
  const [chart, setChart] = useState<ShapeChart>("network");
  const [side, setSide] = useState<Side>("home");

  const names = { home: setup?.teams.home.name ?? "Home team", away: setup?.teams.away.name ?? "Away team" };
  const teams: readonly SegmentedOption<Side>[] = [
    { value: "home", label: names.home },
    { value: "away", label: names.away },
  ];
  const buckets = useMemo(() => tideSeries(stats.latest, stats.heavy), [stats.latest, stats.heavy]);
  const heavy = stats.heavy?.heavy ?? null;
  const team = names[side];

  return (
    <section
      aria-label="Match stats"
      style={teamColourStyle(setup)}
      className={cn("mb-[18px] flex flex-col gap-[18px]", className)}
    >
      <div className="grid grid-cols-1 gap-[18px] min-[1000px]:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <Panel aria-labelledby={barsId} className="flex flex-col">
          <PanelHeader
            id={barsId}
            title="Team stats"
            subtitle="Every match second"
            action={<PanelClock clock={stats.latest?.clock} label="Stats at" />}
          />
          <div className="p-4 sm:p-5">
            <StatBars panel={stats.latest} home={names.home} away={names.away} />
          </div>
        </Panel>
        <Panel aria-labelledby={tideId} className="flex flex-col">
          <PanelHeader id={tideId} title="Momentum" subtitle="Weighted actions per 5-minute spell" />
          <div className="p-4 sm:p-5">
            <MomentumTide buckets={buckets} home={names.home} away={names.away} />
          </div>
        </Panel>
      </div>

      <Panel aria-labelledby={shapeId} className="flex flex-col">
        <PanelHeader
          id={shapeId}
          title="Team shape"
          subtitle="Every match minute · starting XI for the pass network"
          action={<PanelClock clock={stats.heavy?.clock} label="Shape at" />}
        />
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
          <SegmentedControl options={CHARTS} value={chart} onChange={setChart} label="Team shape chart" />
          <SegmentedControl options={teams} value={side} onChange={setSide} label="Team" />
        </div>
        <div className="p-4 sm:p-5">
          <div className="mx-auto max-w-[720px]">
            {chart === "network" ? (
              <PassNetwork
                network={heavy?.pass_network[side] ?? null}
                players={players}
                team={team}
                colour={setup?.teams[side].colours.primary}
              />
            ) : chart === "pressing" ? (
              <PressingZones grid={heavy?.pressing_grid[side] ?? null} team={team} />
            ) : (
              <HeatmapZones zones={heavy?.zones[side] ?? null} team={team} />
            )}
          </div>
        </div>
      </Panel>
    </section>
  );
}

/** The section wired to the store. Must sit inside a MatchStreamProvider or a ReplayProvider. */
export function MatchStatsSection({ className }: { className?: string }) {
  const stats = useStats();
  const players = usePlayers();
  const { setup } = useScoreboard();
  return <MatchStatsSectionView stats={stats} setup={setup} players={players} className={className} />;
}
