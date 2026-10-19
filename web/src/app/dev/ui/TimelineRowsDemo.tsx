// TimelineRowsDemo.tsx — Every timeline row variant, for the dev page
//
// Purpose: show each row component and emphasis side by side with hand-written rows: pass, saved shot, goal, yellow,
//          second yellow and red cards, substitution, period start, match state, tracking frame, a history row and a
//          selected row. SYN-9001 has no red card, so this is where the red and second-yellow rows are checked
// Inputs:  none
// Outputs: a static listbox of TimelineRows (development only; no selection or keyboard handling)
// Spec:    web/IMPLEMENTATION_PLAN.md Phase 8.2
//
// Invented clubs and players only.

import { TimelineRow, type RowTeam } from "@/components/timeline/TimelineRow";
import type { MatchEvent } from "@/lib/contracts";
import { describeEvent, type PlayerNamer } from "@/lib/describe-event";
import type { TimelineRow as Row } from "@/lib/store";
import { teamColourStyle } from "@/lib/team-colours";

const NAMES: Record<string, string> = {
  "NBR-09": "Nora Vale",
  "NBR-11": "Ines Okafor",
  "NBR-12": "Tomas Reyes",
  "HBA-04": "Hugo Lind",
  "HBA-07": "Mira Castell",
};
const nameOf: PlayerNamer = (id) => (id === undefined ? "" : (NAMES[id] ?? id));

const TEAMS: Record<string, RowTeam> = {
  NBR: { id: "NBR", name: "Northbridge FC", side: "home" },
  HBA: { id: "HBA", name: "Harbour Athletic", side: "away" },
};

// Only the colours are read (teamColourStyle); the rest of the setup is not needed here
const COLOURS = teamColourStyle({
  teams: { home: { colours: { primary: "#B3202A" } }, away: { colours: { primary: "#E0A526" } } },
} as Parameters<typeof teamColourStyle>[0]);

const RECEIVED = Date.UTC(2026, 9, 24, 19, 4, 11, 532);
let seq = 800;

function eventRow(over: Partial<MatchEvent>, received: number | null = RECEIVED): Row {
  seq += 1;
  const event: MatchEvent = {
    event_id: `SYN-9001-${String(seq).padStart(5, "0")}`,
    match_id: "SYN-9001",
    seq,
    possession_id: 120,
    period: 2,
    period_ms: 1_034_000,
    match_ms: 3_734_000,
    clock: "62:14",
    type: "Pass",
    team_id: "NBR",
    player_id: "NBR-09",
    ...over,
  };
  const d = describeEvent(event, nameOf);
  return {
    key: String(seq),
    order: seq,
    seq,
    kind: "event",
    ms: event.match_ms,
    period: event.period,
    title: d.title,
    detail: d.detail,
    teamId: event.team_id,
    emphasis: d.emphasis,
    received,
    raw: event,
    event,
  };
}

const ROWS: { row: Row; selected?: boolean }[] = [
  { row: eventRow({ type: "Pass", outcome: "success", receiver_id: "NBR-11" }) },
  { row: eventRow({ type: "Pass", outcome: "fail", team_id: "HBA", player_id: "HBA-04" }) },
  { row: eventRow({ type: "Shot", shot_outcome: "saved" }) },
  { row: eventRow({ type: "Shot", shot_outcome: "goal", situation: "open_play" }) },
  { row: eventRow({ type: "Card", card: "yellow", team_id: "HBA", player_id: "HBA-07" }) },
  { row: eventRow({ type: "Card", card: "second_yellow", team_id: "HBA", player_id: "HBA-07" }) },
  { row: eventRow({ type: "Card", card: "red", team_id: "HBA", player_id: "HBA-04" }) },
  { row: eventRow({ type: "Substitution", player_on_id: "NBR-12" }) },
  { row: eventRow({ type: "Foul", team_id: "HBA", player_id: "HBA-04", fouled_player_id: "NBR-11" }) },
  { row: eventRow({ type: "PeriodStart", team_id: undefined, player_id: undefined, period: 2 }) },
  {
    row: {
      key: "900",
      order: 900,
      seq: 900,
      kind: "status",
      ms: 2_700_000,
      period: 1,
      title: "Match state",
      detail: "Half time",
      received: RECEIVED,
      raw: { seq: 900, kind: "status", match_id: "SYN-9001", match_ms: 2_700_000, clock: "45:00", data: { phase: "half_time", period: 1, score: { home: 1, away: 0 } } },
    },
  },
  {
    row: {
      key: "901:0",
      order: 901,
      seq: 901,
      kind: "tracking",
      ms: 3_733_800,
      period: 2,
      title: "Position frame",
      detail: "22 players · ball (54.2, 38.9)",
      received: RECEIVED,
      raw: {},
    },
  },
  { row: eventRow({ type: "Tackle", outcome: "success", team_id: "HBA", player_id: "HBA-04" }, null) },
  { row: eventRow({ type: "Interception" }), selected: true },
];

export function TimelineRowsDemo() {
  return (
    <div role="listbox" aria-label="Timeline row variants" style={COLOURS} className="overflow-hidden rounded-panel border border-line bg-surface">
      {ROWS.map(({ row, selected = false }, i) => {
        const team = row.teamId ? TEAMS[row.teamId] : undefined;
        return <TimelineRow key={row.key} row={row} team={team} selected={selected} tabbable={i === 0} />;
      })}
    </div>
  );
}
