// HeatMap.tsx — Where a player (or a team) has been
//
// Purpose: time spent per zone from tracking, as soft blobs over the pitch, attacking left → right
// Inputs:  a normalised grid (charts.ts heatGrid), a colour
// Outputs: SVG
// Spec:    web/specs/charts.md §5

import { HEAT_COLS, HEAT_ROWS } from "@/lib/live/match-memory";
import { MiniPitch } from "./MiniPitch";

export function HeatMap({ grid, colour, label }: { grid: Float32Array; colour: string; label: string }) {
  const cw = 105 / HEAT_COLS;
  const ch = 68 / HEAT_ROWS;
  const id = `heat-blur-${label.replace(/\W/g, "")}`;
  return (
    <MiniPitch label={label}>
      <defs>
        <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
          <feGaussianBlur stdDeviation="2.2" />
        </filter>
      </defs>
      <g filter={`url(#${id})`}>
        {Array.from(grid, (v, i) => {
          if (v < 0.04) return null;
          const c = i % HEAT_COLS;
          const r = Math.floor(i / HEAT_COLS);
          return <rect key={i} x={c * cw} y={r * ch} width={cw + 0.2} height={ch + 0.2} fill={colour} fillOpacity={Math.min(0.92, v * 0.95)} />;
        })}
      </g>
    </MiniPitch>
  );
}
