// describe-event.ts — Event descriptions
//
// Purpose: turn an event (CONTRACTS.md §3) into the title and detail text of a timeline row, and say which rows
//          deserve emphasis (goals, cards, substitutions). A port of the demo's describe()
// Inputs:  a validated MatchEvent, and a function that gives a player's name from an id
// Outputs: { title, detail, emphasis? }
// Spec:    web/specs/screens.md
//
// Text only: the numbers shown here come from the event itself. Nothing is calculated.

import type { EventType, MatchEvent, MatchSetup } from "@/lib/contracts";

export type Emphasis = "goal" | "yellow" | "second_yellow" | "red" | "sub";

export type EventDescription = {
  title: string;
  detail: string;
  emphasis?: Emphasis;
};

/** Gives a player's name from an id. Unknown ids come back as the id, so a row never goes blank. */
export type PlayerNamer = (playerId: string | undefined) => string;

const titles: Record<EventType, string> = {
  Pass: "Pass",
  Carry: "Carry",
  TakeOn: "Take-on",
  Shot: "Shot",
  Save: "Save",
  Tackle: "Tackle",
  Interception: "Interception",
  Clearance: "Clearance",
  Aerial: "Aerial duel",
  Pressure: "Pressure",
  BallRecovery: "Ball recovery",
  Foul: "Foul",
  Card: "Card",
  Substitution: "Substitution",
  Offside: "Offside",
  Corner: "Corner",
  PeriodStart: "Period start",
  PeriodEnd: "Period end",
};

/** Builds a PlayerNamer from the match setup. Before the setup arrives it returns the id. */
export function playerNamer(setup: MatchSetup | null): PlayerNamer {
  const names = new Map<string, string>();
  if (setup) {
    for (const side of ["home", "away"] as const) {
      for (const player of [...setup.teams[side].lineup, ...setup.teams[side].bench]) {
        names.set(player.player_id, player.name);
      }
    }
  }
  return (playerId) => (playerId === undefined ? "" : (names.get(playerId) ?? playerId));
}

const cardWords = { yellow: "yellow card", second_yellow: "second yellow", red: "red card" } as const;

export function describeEvent(event: MatchEvent, nameOf: PlayerNamer): EventDescription {
  const title = titles[event.type];
  const who = nameOf(event.player_id);
  const withOutcome = (text: string, outcome: string | undefined) => (outcome ? `${text} · ${outcome}` : text);

  switch (event.type) {
    case "Pass": {
      const target = event.receiver_id ? ` → ${nameOf(event.receiver_id)}` : "";
      return { title, detail: withOutcome(`${who}${target}`, event.outcome) };
    }
    case "Shot": {
      // A goal is a Shot with shot_outcome "goal"; there is no separate goal event (CONTRACTS.md §3)
      const outcome = event.shot_outcome ?? event.outcome;
      return {
        title,
        detail: withOutcome(who, outcome),
        emphasis: event.shot_outcome === "goal" ? "goal" : undefined,
      };
    }
    case "Substitution":
      // player_id is the player going off; player_on_id is the one coming on
      return {
        title,
        detail: `${who} off → ${nameOf(event.player_on_id)} on`,
        emphasis: "sub",
      };
    case "Card":
      return {
        title,
        detail: withOutcome(who, event.card ? cardWords[event.card] : undefined),
        emphasis: event.card,
      };
    case "Foul":
      // One event by the offender, naming who was fouled
      return { title, detail: `${who}${event.fouled_player_id ? ` → ${nameOf(event.fouled_player_id)}` : ""}` };
    case "Pressure":
      return { title, detail: `${who}${event.target_player_id ? ` → ${nameOf(event.target_player_id)}` : ""}` };
    case "PeriodStart":
      return { title, detail: `Period ${event.period} · kick-off` };
    case "PeriodEnd":
      return { title, detail: `Period ${event.period} · period finished` };
    default:
      return { title, detail: withOutcome(who, event.outcome) || title };
  }
}
