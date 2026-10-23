// HeatMap.tsx — Where a player (or a team) has been
//
// Purpose: relative density of observed tracking positions as zones on the blue ramp over the near-black pitch,
//          attacking left → right; an empty state until tracking arrives
// Inputs:  a normalised grid (charts.ts heatGrid: period direction corrected and smoothed), a label
// Outputs: SVG
// Spec:    web/specs/charts.md §5, §10

import { HEAT_COLS, HEAT_ROWS } from "@/lib/live/match-memory";
import { VizPitch, rampColour } from "@/components/viz/Viz";

export function HeatMap({ grid, label }: { grid: Float32Array; label: string }) {
  const cw = 105 / HEAT_COLS;
  const ch = 68 / HEAT_ROWS;
  const populated = grid.some((v) => Number.isFinite(v) && v > 0);
  return (
    <VizPitch label={`${label}. Relative observed tracking density; attacking left to right.`}>
      {Array.from(grid, (value, i) => {
        if (!Number.isFinite(value) || value < 0.04) return null;
        return (
          <rect
            key={i}
            x={(i % HEAT_COLS) * cw + 0.18}
            y={Math.floor(i / HEAT_COLS) * ch + 0.18}
            width={cw - 0.36}
            height={ch - 0.36}
            fill={rampColour(Math.min(1, value))}
            fillOpacity={0.55 + Math.min(1, value) * 0.45}
          />
        );
      })}
      {!populated && (
        <text x="52.5" y="35" textAnchor="middle" className="viz-svg-label" style={{ fontSize: "3px" }}>
          Waiting for observed tracking
        </text>
      )}
    </VizPitch>
  );
}
