// TeamBlock.tsx — One side of the scoreboard
//
// Purpose: a club's colour bar, "Home" / "Away" label and name. The away block is mirrored (right-aligned)
// Inputs:  side ("home" | "away"), name (null before the setup arrives: "Home team" / "Away team"), className
// Outputs: a div
// Spec:    web/specs/screens.md (scoreboard). web/IMPLEMENTATION_PLAN.md Phase 7

import { TeamColourBar } from "@/components/scoreboard/TeamColourBar";
import { Eyebrow } from "@/components/ui/Eyebrow";
import { cn } from "@/lib/cn";

type TeamBlockProps = {
  side: "home" | "away";
  name: string | null;
  className?: string;
};

export function TeamBlock({ side, name, className }: TeamBlockProps) {
  const away = side === "away";
  return (
    <div className={cn("flex min-w-0 flex-col gap-2", away ? "items-end text-right" : "items-start", className)}>
      <TeamColourBar side={side} ready={name !== null} />
      <Eyebrow>{away ? "Away" : "Home"}</Eyebrow>
      <p className={cn("text-heading break-words min-[680px]:text-title", name === null && "text-ink-muted")}>
        {name ?? (away ? "Away team" : "Home team")}
      </p>
    </div>
  );
}
