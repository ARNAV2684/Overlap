// MiniPitch.tsx — A flat pitch for 2D charts
//
// Purpose: the markings every pitch chart draws on, in metres (viewBox 0 0 105 68), attacking left → right
// Inputs:  children (drawn in pitch units: x × 1.05, y × 0.68), optional `half` to show only the attacking half
// Outputs: SVG
// Spec:    web/specs/charts.md §1

import type { ReactNode } from "react";

export const toM = (x: number, y: number) => ({ x: x * 1.05, y: y * 0.68 });

export function MiniPitch({
  children,
  half = false,
  label,
  className = "",
}: {
  children?: ReactNode;
  half?: boolean;
  label: string;
  className?: string;
}) {
  const viewBox = half ? "50 -1 56 70" : "-1 -1 107 70";
  return (
    <svg viewBox={viewBox} className={`block w-full ${className}`} role="img" aria-label={label}>
      <rect x="0" y="0" width="105" height="68" rx="1.2" className="fill-ink/[0.035]" />
      {/* Mowing stripes, very faint */}
      {Array.from({ length: 10 }, (_, i) => (
        <rect key={i} x={i * 10.5} y="0" width="5.25" height="68" className="fill-ink/[0.015]" />
      ))}
      <g className="stroke-ink/25" fill="none" strokeWidth="0.3">
        <rect x="0" y="0" width="105" height="68" />
        <line x1="52.5" y1="0" x2="52.5" y2="68" />
        <circle cx="52.5" cy="34" r="9.15" />
        <rect x="0" y="13.84" width="16.5" height="40.32" />
        <rect x="88.5" y="13.84" width="16.5" height="40.32" />
        <rect x="0" y="24.84" width="5.5" height="18.32" />
        <rect x="99.5" y="24.84" width="5.5" height="18.32" />
        <path d="M16.5 26.7 A9.15 9.15 0 0 1 16.5 41.3" />
        <path d="M88.5 26.7 A9.15 9.15 0 0 0 88.5 41.3" />
      </g>
      <g className="fill-ink/30">
        <circle cx="52.5" cy="34" r="0.45" />
        <circle cx="11" cy="34" r="0.4" />
        <circle cx="94" cy="34" r="0.4" />
      </g>
      <line x1="105" y1="30.34" x2="105" y2="37.66" className="stroke-ink/60" strokeWidth="0.9" />
      {children}
    </svg>
  );
}
