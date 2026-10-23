// PressingZones.tsx — Where a team presses
//
// Purpose: the stats engine's pressing grid (pressures, tackles, interceptions, fouls and recoveries per zone) as a
//          heat grid over the pitch, the team attacking left → right, with how high the press sits
// Inputs:  one side's grid [col][row] (9 columns from its own goal, 6 rows from its left; CONTRACTS.md §7.4), the
//          team's PPDA and press height from the light panel, the team colour
// Outputs: SVG and a summary line
// Spec:    web/specs/charts.md §9

import { PRESSING_COLS, PRESSING_ROWS } from "@/lib/contracts";
import { MiniPitch } from "./MiniPitch";

export function PressingZones({
  grid,
  colour,
  label,
  ppda,
  heightM,
}: {
  grid: readonly (readonly number[])[] | null;
  colour: string;
  label: string;
  ppda: number | null;
  heightM: number | null;
}) {
  const cw = 105 / PRESSING_COLS;
  const rh = 68 / PRESSING_ROWS;
  const max = grid ? Math.max(1, ...grid.flat()) : 1;
  const total = grid ? grid.flat().reduce((s, v) => s + v, 0) : 0;
  const attackingHalf = grid ? grid.slice(Math.ceil(PRESSING_COLS / 2)).flat().reduce((s, v) => s + v, 0) : 0;
  return (
    <div>
      <MiniPitch label={label}>
        {grid?.map((col, c) =>
          col.map((v, r) =>
            v > 0 ? (
              <g key={`${c}-${r}`}>
                <rect x={c * cw + 0.4} y={r * rh + 0.4} width={cw - 0.8} height={rh - 0.8} rx="1" fill={colour} fillOpacity={0.12 + (v / max) * 0.78} />
                <text x={c * cw + cw / 2} y={r * rh + rh / 2 + 1.1} textAnchor="middle" className="fill-white font-mono text-[3px] font-black">
                  {v}
                </text>
              </g>
            ) : null,
          ),
        )}
        {heightM !== null && (
          <g>
            <line x1={heightM} y1="0" x2={heightM} y2="68" stroke="#fff" strokeWidth="0.4" strokeDasharray="1.2 1" />
            <text x={heightM + 1} y="4" className="fill-white font-mono text-[2.6px] font-black">
              PRESS HEIGHT {Math.round(heightM)} M
            </text>
          </g>
        )}
      </MiniPitch>
      <p className="mt-2 font-mono text-[10px] font-bold uppercase tracking-wider text-ink/45">
        {total
          ? `${total} pressing actions · ${Math.round((attackingHalf / total) * 100)}% in the opponent's half${ppda !== null ? ` · PPDA ${ppda.toFixed(1)} (last 10′)` : ""}`
          : "No pressing actions yet."}
      </p>
    </div>
  );
}
