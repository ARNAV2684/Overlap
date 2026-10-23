// GridCells.tsx — Shaded cells over the pitch
//
// Purpose: one rectangle per non-empty cell of a team-frame grid, shaded by its count relative to the busiest cell,
//          for the pressing zones (9 × 6) and the touch zones (6 × 3)
// Inputs:  grid (from pressingGrid() or zoneGrid()), describe (the cell's <title>, for example "12 pressing actions")
// Outputs: an SVG <g> in metres
// Spec:    web/specs/charts.md §2 (pressing zones, heatmap zones)
//
// Shading is primary at an opacity from 0.15 to 0.75, so the pitch markings stay visible through every cell.

import { cellRect, gridMax, type Grid, type GridCell } from "@/lib/stat-charts";

const OPACITY = { min: 0.15, max: 0.75 };

type GridCellsProps = {
  grid: Grid;
  describe: (cell: GridCell) => string;
};

export function GridCells({ grid, describe }: GridCellsProps) {
  const max = gridMax(grid);
  if (max === 0) return null;
  return (
    <g>
      {grid.cells
        .filter((cell) => cell.count > 0)
        .map((cell) => {
          const rect = cellRect(cell, grid);
          return (
            <rect
              key={`${cell.col},${cell.row}`}
              {...rect}
              className="fill-primary"
              fillOpacity={OPACITY.min + (OPACITY.max - OPACITY.min) * (cell.count / max)}
            >
              <title>{describe(cell)}</title>
            </rect>
          );
        })}
    </g>
  );
}
