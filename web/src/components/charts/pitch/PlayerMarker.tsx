// PlayerMarker.tsx — One player on the pitch
//
// Purpose: a circle in the club's kit colour with a dark outline and the shirt number, named in its <title>
// Inputs:  x, y (SVG units: metres, already through pitchToSvg), colour (#RRGGBB, or undefined before the setup:
//          a neutral grey), shirt?, name
// Outputs: an SVG <g>, moved with a CSS transform so each new frame glides there (200 ms linear, off under reduced
//          motion). Memoised: only markers whose player moved re-render
// Spec:    web/specs/charts.md (live pitch). web/IMPLEMENTATION_PLAN.md Phase 9.1
//
// The dark outline is required: orange and blue kit fills are only 1.6:1 and 2.4:1 against the grey pitch. The number
// uses readableInk() so it stays legible on any kit colour. On an SVG element, CSS transform lengths in px are user units.

import { memo } from "react";
import { cn } from "@/lib/cn";
import { inkFillClass } from "@/lib/team-colours";

export const PLAYER_RADIUS = 1.5;

type PlayerMarkerProps = {
  x: number;
  y: number;
  colour?: string;
  shirt?: number;
  name: string;
};

function PlayerMarkerView({ x, y, colour, shirt, name }: PlayerMarkerProps) {
  return (
    <g
      style={{ transform: `translate(${x}px, ${y}px)` }}
      className="motion-safe:transition-transform motion-safe:duration-200 motion-safe:ease-linear"
    >
      <title>{shirt === undefined ? name : `${name} (${shirt})`}</title>
      <circle
        r={PLAYER_RADIUS}
        fill={colour}
        strokeWidth={0.25}
        className={cn("stroke-pitch-marker-edge", colour === undefined && "fill-greys-500")}
      />
      {shirt === undefined ? null : (
        <text
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={1.5}
          className={cn("font-semibold select-none", colour ? inkFillClass(colour) : "fill-white")}
        >
          {shirt}
        </text>
      )}
    </g>
  );
}

export const PlayerMarker = memo(PlayerMarkerView);
