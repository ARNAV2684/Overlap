"use client";

// Relative observed tracking density. Uses the existing period-normalised heatGrid; no event-derived positions.
import { useId } from "react";
import { HEAT_COLS, HEAT_ROWS } from "@/lib/live/match-memory";

export function HeatMap({ grid, colour, label }: { grid: Float32Array; colour: string; label: string }) {
  const id = useId().replace(/:/g, "");
  const cw = 105 / HEAT_COLS;
  const ch = 68 / HEAT_ROWS;
  const populated = grid.some((v) => Number.isFinite(v) && v > 0);
  return (
    <div className="ov-heat-map">
      <svg viewBox="-3 -3 111 74" className="block w-full" role="img" aria-label={`${label}. Relative observed tracking density; attacking left to right.`}>
        <defs>
          <filter id={`${id}-blur`} x="-15%" y="-15%" width="130%" height="130%"><feGaussianBlur stdDeviation="1.5" /></filter>
          <clipPath id={`${id}-clip`}><rect width="105" height="68" rx="1" /></clipPath>
          <linearGradient id={`${id}-grass`} x2="0" y2="1"><stop stopColor="#102e31" /><stop offset="1" stopColor="#081c22" /></linearGradient>
        </defs>
        <rect width="105" height="68" rx="1" fill={`url(#${id}-grass)`} />
        {Array.from({ length: 10 }, (_, i) => <rect key={i} x={i * 10.5} width="5.25" height="68" fill="#ffffff" opacity="0.025" />)}
        <g clipPath={`url(#${id}-clip)`}>
          <g filter={`url(#${id}-blur)`}>
            {Array.from(grid, (value, i) => {
              if (!Number.isFinite(value) || value < 0.025) return null;
              const v = Math.min(1, Math.max(0, value));
              // Blue → cyan → lime → amber → red. Colour is relative density, not team identity.
              const hue = 220 * (1 - v);
              return <rect key={i} x={(i % HEAT_COLS) * cw - 0.2} y={Math.floor(i / HEAT_COLS) * ch - 0.2} width={cw + 0.4} height={ch + 0.4} fill={`hsl(${hue} 95% 55%)`} opacity={Math.min(0.92, 0.12 + v * 0.85)} />;
            })}
          </g>
        </g>
        <g fill="none" stroke="#d8eef0" strokeOpacity="0.55" strokeWidth="0.3">
          <rect width="105" height="68" rx="1" />
          <path d="M52.5 0V68 M0 13.84H16.5V54.16H0 M105 13.84H88.5V54.16H105 M0 24.84H5.5V43.16H0 M105 24.84H99.5V43.16H105" />
          <circle cx="52.5" cy="34" r="9.15" />
          <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3 M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3" />
        </g>
        <g fill="#d8eef0"><circle cx="52.5" cy="34" r="0.4" /><circle cx="11" cy="34" r="0.35" /><circle cx="94" cy="34" r="0.35" /></g>
        {!populated && <text x="52.5" y="35" textAnchor="middle" fill="#d8eef0" fontSize="3">Waiting for observed tracking</text>}
      </svg>
      <div className="ov-heat-legend">
        <span className="flex items-center gap-2"><i className="h-2 w-2 rounded-full" style={{ background: colour }} />{label}</span>
        <span className="flex items-center gap-2">Low <i className="ov-heat-scale" /> High</span>
      </div>
    </div>
  );
}
