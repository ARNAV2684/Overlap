// PressingZones.tsx — Pressing zones
//
// Purpose: where one team presses: its Pressure events in the stats engine's 9 × 6 grid (metrics.md §4), shaded over
//          the pitch, attacking left to right
// Inputs:  grid (heavy.pressing_grid[side], sent as [col][row]; null before the first heavy panel: an empty pitch with
//          "First update at the end of the first minute"), team (the club's name), className
// Outputs: a TeamPitch figure whose label gives the total and the split by third
// Spec:    web/specs/charts.md §2 (pressing zones)
//
// No window or highlight yet: they come with overlays.

import { memo } from "react";
import { GridCells } from "@/components/charts/pitch/GridCells";
import { TeamPitch } from "@/components/charts/pitch/TeamPitch";
import { FIRST_HEAVY_NOTE, pressingGrid, thirdsOf } from "@/lib/stat-charts";

type PressingZonesProps = {
  grid: readonly (readonly number[])[] | null;
  team: string;
  className?: string;
};

const actions = (n: number) => `${n} pressing ${n === 1 ? "action" : "actions"}`;

function PressingZonesView({ grid, team, className }: PressingZonesProps) {
  if (!grid) {
    return <TeamPitch label={`Pressing actions, ${team}: ${FIRST_HEAVY_NOTE.toLowerCase()}`} empty={FIRST_HEAVY_NOTE} className={className} />;
  }
  const cells = pressingGrid(grid);
  const t = thirdsOf(cells);
  const label =
    `Pressing actions, ${team}: ${t.total} in total. ${t.attacking} in the attacking third, ` +
    `${t.middle} in the middle third, ${t.own} in their own third.`;
  return (
    <TeamPitch label={label} caption="Pressure events, whole match" className={className}>
      <GridCells grid={cells} describe={(cell) => actions(cell.count)} />
    </TeamPitch>
  );
}

export const PressingZones = memo(PressingZonesView);
