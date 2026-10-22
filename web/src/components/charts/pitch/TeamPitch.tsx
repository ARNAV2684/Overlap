// TeamPitch.tsx — A pitch for one team's whole-match data
//
// Purpose: the frame the team-frame charts share (pass network, pressing zones, heatmap zones): the pitch surface and
//          markings, the chart's own graphics on top, an optional message over an empty pitch, and a caption that
//          says which way the team attacks
// Inputs:  label (the SVG's accessible name), children (SVG content in metres), empty? (a message instead of data),
//          caption? (added after "Attacking →"), className
// Outputs: a <figure> holding an SVG (viewBox "0 0 105 68") with role="img"
// Spec:    web/specs/charts.md §2 (charts fed by stat panels: team-frame charts)
//
// Whole-match data spans both halves, so it is drawn in the team's own frame, attacking left to right; callers map
// points with teamToPitch(point, true) and pitchToSvg (see stat-charts.ts), never by hand.

import type { ReactNode } from "react";
import { PitchMarkings } from "@/components/charts/pitch/PitchMarkings";
import { cn } from "@/lib/cn";
import { PITCH_VIEW_BOX } from "@/lib/coordinates";

type TeamPitchProps = {
  label: string;
  children?: ReactNode;
  empty?: string;
  caption?: string;
  className?: string;
};

export function TeamPitch({ label, children, empty, caption, className }: TeamPitchProps) {
  return (
    <figure className={cn("flex flex-col gap-2", className)}>
      <div className="relative rounded-control bg-pitch-surface p-[2.5%]">
        <svg viewBox={PITCH_VIEW_BOX} role="img" aria-label={label} className="block h-auto w-full overflow-visible">
          <PitchMarkings />
          {empty ? null : children}
        </svg>
        {empty ? (
          <p className="absolute inset-0 flex items-center justify-center px-4 text-center text-body-sm font-semibold text-pitch-line">
            {empty}
          </p>
        ) : null}
      </div>
      <figcaption className="text-caption text-ink-muted">
        <span aria-hidden="true">Attacking →</span>
        <span className="sr-only">Drawn attacking left to right.</span>
        {caption ? ` · ${caption}` : null}
      </figcaption>
    </figure>
  );
}
