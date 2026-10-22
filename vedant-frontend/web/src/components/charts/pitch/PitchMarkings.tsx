// PitchMarkings.tsx — The pitch itself
//
// Purpose: the light grey surface with lighter stripes, and every marking in dark grey: outline, halfway line, centre
//          circle and spot, penalty areas and arcs, goal areas, penalty spots and goals
// Inputs:  none
// Outputs: an SVG <g> in metres (viewBox "0 0 105 68"), decorative (aria-hidden). Memoised: it never re-renders
// Spec:    web/specs/charts.md (live pitch). web/IMPLEMENTATION_PLAN.md Phase 9.1
//
// Sizes are the standard ones in metres. The goals sit just outside the goal lines, so the SVG must not clip
// (LivePitch sets overflow-visible and pads the surface around it).

import { memo } from "react";
import { PITCH_LENGTH_M as L, PITCH_WIDTH_M as W } from "@/lib/coordinates";

const STRIPES = 10;
const CENTRE_CIRCLE_R = 9.15;
const PENALTY_AREA = { depth: 16.5, width: 40.32 };
const GOAL_AREA = { depth: 5.5, width: 18.32 };
const PENALTY_SPOT = 11;
const GOAL = { depth: 1.2, width: 7.32 };
/** About 26 cm at pitch scale: still visible at phone width. */
const LINE = 0.25;

/** Where the penalty arc (radius 9.15 around the spot) meets the edge of the penalty area, above and below the spot. */
const ARC_HALF = Math.sqrt(CENTRE_CIRCLE_R ** 2 - (PENALTY_AREA.depth - PENALTY_SPOT) ** 2);

function PitchMarkingsView() {
  const midY = W / 2;
  const box = (depth: number, width: number) => ({ y: midY - width / 2, width: depth, height: width });
  const penalty = box(PENALTY_AREA.depth, PENALTY_AREA.width);
  const goalArea = box(GOAL_AREA.depth, GOAL_AREA.width);
  const goal = box(GOAL.depth, GOAL.width);

  return (
    <g aria-hidden="true">
      {Array.from({ length: STRIPES }, (_, i) =>
        i % 2 === 1 ? <rect key={i} x={(i * L) / STRIPES} y={0} width={L / STRIPES} height={W} className="fill-pitch-stripe" /> : null,
      )}
      <g className="fill-none stroke-pitch-line" strokeWidth={LINE}>
        <rect x={0} y={0} width={L} height={W} />
        <line x1={L / 2} y1={0} x2={L / 2} y2={W} />
        <circle cx={L / 2} cy={midY} r={CENTRE_CIRCLE_R} />
        {/* West end */}
        <rect x={0} {...penalty} />
        <rect x={0} {...goalArea} />
        <path d={`M${PENALTY_AREA.depth} ${midY - ARC_HALF}A${CENTRE_CIRCLE_R} ${CENTRE_CIRCLE_R} 0 0 1 ${PENALTY_AREA.depth} ${midY + ARC_HALF}`} />
        <rect x={-GOAL.depth} {...goal} />
        {/* East end */}
        <rect x={L - PENALTY_AREA.depth} {...penalty} />
        <rect x={L - GOAL_AREA.depth} {...goalArea} />
        <path d={`M${L - PENALTY_AREA.depth} ${midY - ARC_HALF}A${CENTRE_CIRCLE_R} ${CENTRE_CIRCLE_R} 0 0 0 ${L - PENALTY_AREA.depth} ${midY + ARC_HALF}`} />
        <rect x={L} {...goal} />
      </g>
      <g className="fill-pitch-line">
        <circle cx={L / 2} cy={midY} r={0.35} />
        <circle cx={PENALTY_SPOT} cy={midY} r={0.3} />
        <circle cx={L - PENALTY_SPOT} cy={midY} r={0.3} />
      </g>
    </g>
  );
}

export const PitchMarkings = memo(PitchMarkingsView);
