// EventTypeIcon.tsx — Small icon per row type
//
// Purpose: a quick visual cue next to a row's title: pass, shot, save, defending, foul, card, substitution, offside or
//          corner flag, period marker, match state, tracking frame
// Inputs:  type (an event type from CONTRACTS.md §3, or "status" / "tracking"), className
// Outputs: a decorative SVG (aria-hidden): the title text next to it carries the meaning
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2
//
// Drawn in currentColor on a 24 × 24 grid, so it takes the row's text colour.

import type { ReactNode } from "react";
import { cn } from "@/lib/cn";
import type { EventType } from "@/lib/contracts";

export type IconType = EventType | "status" | "tracking";

const arrow = <path d="M4 12h14m-5-5 5 5-5 5" />;
const target = (
  <>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="3" />
  </>
);
const shield = <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3Z" />;
const flag = <path d="M6 21V4m0 1h11l-2.5 4L17 13H6" />;

const glyphs: Record<IconType, ReactNode> = {
  Pass: arrow,
  Carry: <path d="M4 16c3-6 6-6 8-2s5 4 8-2m0 0v4m0-4h-4" />,
  TakeOn: <path d="M4 18 10 12 4 6m8 12 6-6-6-6" />,
  Shot: target,
  Save: <path d="M7 11V6a1.5 1.5 0 0 1 3 0v4m0-5a1.5 1.5 0 0 1 3 0v5m0-4a1.5 1.5 0 0 1 3 0v6c0 4-2.5 7-6 7s-6-2-7-5l-1.5-3a1.5 1.5 0 0 1 2.5-1.5L7 13" />,
  Tackle: shield,
  Interception: shield,
  Clearance: shield,
  Aerial: <path d="M12 20V6m-6 6 6-6 6 6" />,
  Pressure: <path d="M4 12h8m-3-4 4 4-4 4m6-8v8" />,
  BallRecovery: <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v4h-4" />,
  Foul: (
    <>
      <path d="M12 3 2.5 20h19L12 3Z" />
      <path d="M12 10v4.5M12 17.5v.01" />
    </>
  ),
  Card: <rect x="7" y="4" width="10" height="16" rx="1.5" />,
  Substitution: <path d="M8 20V5m0 0L4 9m4-4 4 4m4-5v15m0 0 4-4m-4 4-4-4" />,
  Offside: flag,
  Corner: flag,
  PeriodStart: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  PeriodEnd: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v4l3 2" />
    </>
  ),
  status: (
    <>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <path d="M8 12h8" />
    </>
  ),
  tracking: (
    <>
      <circle cx="7" cy="8" r="1.5" />
      <circle cx="16" cy="7" r="1.5" />
      <circle cx="11" cy="15" r="1.5" />
      <circle cx="18" cy="16" r="1.5" />
    </>
  ),
};

export function EventTypeIcon({ type, className }: { type: IconType; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className={cn("size-3.5 shrink-0 fill-none stroke-current stroke-2 [stroke-linecap:round] [stroke-linejoin:round]", className)}
    >
      {glyphs[type]}
    </svg>
  );
}
