// DetailCell.tsx — Middle column of a timeline row
//
// Purpose: what happened: icon, title, team tag and badges on the first line, the description below
// Inputs:  icon (EventTypeIcon type), title, titleClassName?, team? ({ id, side }), badges? (OutcomeBadge, GoalBadge,
//          CardChip), description, descriptionClassName?
// Outputs: a div
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.1
//
// The team tag's border is the club's kit colour, read from --team-home / --team-away on the timeline panel.

import type { ReactNode } from "react";
import { EventTypeIcon, type IconType } from "@/components/timeline/EventTypeIcon";
import { Tag } from "@/components/ui/Tag";
import { cn } from "@/lib/cn";

type DetailCellProps = {
  icon: IconType;
  title: string;
  titleClassName?: string;
  team?: { id: string; side: "home" | "away" | null };
  badges?: ReactNode;
  description: ReactNode;
  descriptionClassName?: string;
};

export function DetailCell({ icon, title, titleClassName, team, badges, description, descriptionClassName }: DetailCellProps) {
  return (
    <div className="min-w-0">
      <p className={cn("flex flex-wrap items-center gap-1.5 text-body-sm font-semibold text-ink", titleClassName)}>
        <EventTypeIcon type={icon} />
        <span>{title}</span>
        {team ? <Tag tone={team.side ?? "neutral"}>{team.id}</Tag> : null}
        {badges}
      </p>
      <p className={cn("mt-0.5 truncate text-caption text-ink-muted", descriptionClassName)}>{description}</p>
    </div>
  );
}
