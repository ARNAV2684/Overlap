// BallMarker.tsx — The ball on the pitch
//
// Purpose: a small near-black ball with a white ring (white alone would vanish on the light pitch)
// Inputs:  x, y (SVG units: metres, already through pitchToSvg)
// Outputs: an SVG <g>, moved like the players (200 ms linear, off under reduced motion). Draw it last, above the players
// Spec:    web/specs/charts.md (live pitch). web/IMPLEMENTATION_PLAN.md Phase 9.1

import { memo } from "react";

function BallMarkerView({ x, y }: { x: number; y: number }) {
  return (
    <g
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-linear"
    >
      <title>Ball</title>
      <circle r={0.8} strokeWidth={0.3} className="fill-greys-950 stroke-white" />
    </g>
  );
}

export const BallMarker = memo(BallMarkerView);
