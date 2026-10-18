// EventRow.tsx — A match event in the timeline
//
// Purpose: one event (pass, shot, card, substitution…): its time, its description with team tag and badges, and when
//          it arrived. A goal gets a primary left bar and a "Goal" badge; a card gets its chip and a row tint
// Inputs:  row (an event row from the store), team? (the row's club), plus the shell's selection props
// Outputs: a TimelineRowShell
// Spec:    web/specs/screens.md (event timeline). web/IMPLEMENTATION_PLAN.md Phase 8.2
//
// The store's description ends in " · <outcome>" (describe-event.ts). When a badge or chip shows that outcome, the
// suffix is dropped from the visible description so it is not said twice; the accessible name keeps the full text.

import { ArrivalCell } from "@/components/timeline/cells/ArrivalCell";
import { DetailCell } from "@/components/timeline/cells/DetailCell";
import { MatchTimeCell } from "@/components/timeline/cells/MatchTimeCell";
import { GoalBadge, OutcomeBadge, type Outcome } from "@/components/timeline/OutcomeBadge";
import { TimelineRowShell } from "@/components/timeline/TimelineRowShell";
import type { RowProps } from "@/components/timeline/TimelineRow";
import { CardChip } from "@/components/ui/CardChip";
import type { MatchEvent } from "@/lib/contracts";

/** The words describe-event.ts appends for each card. */
const cardWords = { yellow: "yellow card", second_yellow: "second yellow", red: "red card" } as const;

const tints = {
  yellow: "bg-card-yellow-soft",
  second_yellow: "bg-card-red-soft",
  red: "bg-card-red-soft",
} as const;

/** The outcome a badge shows for this event, if any. A goal is shown by GoalBadge instead. */
function outcomeOf(event: MatchEvent | undefined): Outcome | undefined {
  if (!event) return undefined;
  if (event.type === "Shot" && event.shot_outcome) return event.shot_outcome === "goal" ? undefined : event.shot_outcome;
  return event.outcome;
}

function withoutSuffix(text: string, suffix: string | undefined): string {
  const tail = suffix ? ` · ${suffix}` : "";
  return tail && text.endsWith(tail) ? text.slice(0, -tail.length) : text;
}

export function EventRow({ row, team, ...shell }: RowProps) {
  const event = row.event;
  const card = event?.type === "Card" ? event.card : undefined;
  const goal = row.emphasis === "goal";
  const outcome = outcomeOf(event);
  const shown = card ? cardWords[card] : goal ? "goal" : outcome;

  return (
    <TimelineRowShell {...shell} rowKey={row.key} history={row.received === null} accent={goal ? "goal" : undefined} tint={card ? tints[card] : undefined}>
      <MatchTimeCell ms={row.ms} period={row.period} seq={row.seq} />
      <DetailCell
        icon={event?.type ?? "Pass"}
        title={row.title}
        team={row.teamId ? { id: row.teamId, side: team?.side ?? null } : undefined}
        badges={
          <>
            {goal ? <GoalBadge /> : null}
            {card ? <CardChip card={card} /> : null}
            {outcome ? <OutcomeBadge outcome={outcome} /> : null}
          </>
        }
        description={withoutSuffix(row.detail, shown)}
      />
      <ArrivalCell received={row.received} />
    </TimelineRowShell>
  );
}
