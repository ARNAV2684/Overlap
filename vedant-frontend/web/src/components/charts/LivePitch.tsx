// LivePitch.tsx — Live 2D pitch
//
// Purpose: draw the newest tracking frame: the pitch, 22 players in their kit colours with shirt numbers, and the ball
// Inputs:  frame (the newest TrackingFrame, or null before the first: the empty pitch and a waiting message),
//          players (player_id → name, shirt, side; empty before the setup), colours ({ home, away } kit primaries, or
//          null before the setup), className
// Outputs: an SVG (viewBox "0 0 105 68", metres) with role="img" and a label such as "Positions at 62:14"
// Spec:    web/specs/charts.md (live pitch). web/IMPLEMENTATION_PLAN.md Phase 9.1
//
// Tracking is already in the pitch frame (x west → east, y north → south), so positions go straight through
// pitchToSvg() with no flips. The newest frame is shown; the markers glide to it (see PlayerMarker), they are not
// tweened through the bundle's five frames. Freezing while paused comes from the store (latestFrame is a display slice).
// No window or highlight: this chart reads no overlay.

import { BallMarker } from "@/components/charts/pitch/BallMarker";
import { PitchMarkings } from "@/components/charts/pitch/PitchMarkings";
import { PlayerMarker } from "@/components/charts/pitch/PlayerMarker";
import { cn } from "@/lib/cn";
import type { TrackingFrame } from "@/lib/contracts";
import { PITCH_VIEW_BOX, pitchToSvg } from "@/lib/coordinates";
import { formatElapsed } from "@/lib/format";
import type { PlayerInfo } from "@/lib/store";

export type KitColours = { home: string; away: string } | null;

type LivePitchProps = {
  frame: TrackingFrame | null;
  players: ReadonlyMap<string, PlayerInfo>;
  colours: KitColours;
  className?: string;
};

/** "62:14": the frame's play time in minutes and seconds, for the accessible name. */
export function pitchTime(frame: TrackingFrame): string {
  return formatElapsed(frame.match_ms).slice(0, -4);
}

export function LivePitch({ frame, players, colours, className }: LivePitchProps) {
  const ball = frame ? pitchToSvg(frame.ball) : null;

  return (
    <div className={cn("relative rounded-control bg-pitch-surface p-[2.5%]", className)}>
      <svg
        viewBox={PITCH_VIEW_BOX}
        role="img"
        aria-label={frame ? `Positions at ${pitchTime(frame)}` : "Pitch, waiting for the first position frame"}
        className="block h-auto w-full overflow-visible"
      >
        <PitchMarkings />
        {frame?.players.map((p) => {
          const info = players.get(p.player_id);
          const at = pitchToSvg(p);
          return (
            <PlayerMarker
              key={p.player_id}
              x={at.x}
              y={at.y}
              colour={info && colours ? colours[info.side] : undefined}
              shirt={info?.shirt}
              name={info?.name ?? p.player_id}
            />
          );
        })}
        {ball ? <BallMarker x={ball.x} y={ball.y} /> : null}
      </svg>
      {frame ? null : (
        <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-body-sm font-semibold text-pitch-line">
          Waiting for the first position frame
        </p>
      )}
    </div>
  );
}
