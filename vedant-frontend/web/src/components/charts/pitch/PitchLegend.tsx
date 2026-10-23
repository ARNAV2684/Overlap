// PitchLegend.tsx — Who is who on the pitch
//
// Purpose: a swatch and the club's name for each side, and the ball ("● Northbridge FC  ● Harbour Athletic  ● Ball")
// Inputs:  home, away ({ name, colour } each; null before the setup: "Home team" / "Away team" in the default colours)
// Outputs: a <ul>. The swatches are decorative: the names carry the meaning
// Spec:    web/specs/charts.md (live pitch). web/IMPLEMENTATION_PLAN.md Phase 9.1

import { cn } from "@/lib/cn";

type Club = { name: string; colour: string } | null;

function Swatch({ colour, className }: { colour?: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      style={colour ? { backgroundColor: colour } : undefined}
      className={cn("inline-block size-2.5 shrink-0 rounded-full border border-pitch-marker-edge", className)}
    />
  );
}

export function PitchLegend({ home, away }: { home: Club; away: Club }) {
  return (
    <ul className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-caption text-ink-muted">
      <li className="flex items-center gap-1.5">
        <Swatch colour={home?.colour} className={home ? undefined : "bg-team-home"} />
        {home?.name ?? "Home team"}
      </li>
      <li className="flex items-center gap-1.5">
        <Swatch colour={away?.colour} className={away ? undefined : "bg-team-away"} />
        {away?.name ?? "Away team"}
      </li>
      <li className="flex items-center gap-1.5">
        <span aria-hidden="true" className="inline-block size-2 shrink-0 rounded-full bg-greys-950 ring-1 ring-white" />
        Ball
      </li>
    </ul>
  );
}
