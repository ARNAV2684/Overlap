// HeatmapZones.tsx — Touch zones
//
// Purpose: where one team has the ball: its touches (events with a position) in the stats engine's 18 zones, 6
//          columns by 3 channels of its own frame (metrics.md §6), shaded over the pitch, attacking left to right
// Inputs:  zones (heavy.zones[side], sent as [channel][col]; null before the first heavy panel: an empty pitch with
//          "First update at the end of the first minute"), team (the club's name), className
// Outputs: a TeamPitch figure whose label gives the total, the split by third and the busiest channel
// Spec:    web/specs/charts.md §2 (heatmap zones). Shown under the tab name "Touches"
//
// No window or highlight yet: they come with overlays.

import { memo } from "react";
import { GridCells } from "@/components/charts/pitch/GridCells";
import { TeamPitch } from "@/components/charts/pitch/TeamPitch";
import { busiestChannel, FIRST_HEAVY_NOTE, thirdsOf, zoneGrid } from "@/lib/stat-charts";

type HeatmapZonesProps = {
  zones: readonly (readonly number[])[] | null;
  team: string;
  className?: string;
};

const touches = (n: number) => `${n} ${n === 1 ? "touch" : "touches"}`;

function HeatmapZonesView({ zones, team, className }: HeatmapZonesProps) {
  if (!zones) {
    return <TeamPitch label={`Touches, ${team}: ${FIRST_HEAVY_NOTE.toLowerCase()}`} empty={FIRST_HEAVY_NOTE} className={className} />;
  }
  const cells = zoneGrid(zones);
  const t = thirdsOf(cells);
  const channel = busiestChannel(cells);
  const label =
    `Touches, ${team}: ${t.total} in total. ${t.attacking} in the attacking third, ${t.middle} in the middle third, ` +
    `${t.own} in their own third.${channel ? ` Busiest channel: ${channel}.` : ""}`;
  return (
    <TeamPitch label={label} caption="Touches, whole match" className={className}>
      <GridCells grid={cells} describe={(cell) => touches(cell.count)} />
    </TeamPitch>
  );
}

export const HeatmapZones = memo(HeatmapZonesView);
