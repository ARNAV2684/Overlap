// mode-layout.ts — What each viewing mode shows on the match screen
//
// Purpose: one place that decides how the match screen differs per mode, so Casual and Analyst are two genuinely
//          different experiences (rule §4.1(e)): Casual tells the story, Analyst shows the data behind it. Also the
//          plain-language headlines Casual shows in place of the insight cards' tables, and readable labels for the
//          fact keys an AI card says it checked
// Inputs:  the viewer's mode; the insight cards' data (live-insights.ts)
// Outputs: layoutFor(), factLabel(), battleHeadline(), connectionHeadline(), workHeadline(), tempoHeadline()
// Spec:    web/specs/screens.md §2.9
//
// My club and Player focus keep the full screen: they are already shaped by the club and the player picked.

import type { Mode } from "@/lib/preferences";
import type { Battle, Connection, Tempo, Workhorse } from "@/lib/live/live-insights";

export type ScreenLayout = {
  /** The pitch opens on Analyse (story overlays) rather than Watch (the clean pitch). */
  analysisDefault: boolean;
  /** Insight cards as one plain sentence each, or with their numbers and tables. */
  insights: "headline" | "full";
  /** The live numbers rail: score-level numbers only, or everything (xG race, PPDA, press height…). */
  rail: "basic" | "full";
  /** AI cards list the facts the fact-checker verified. */
  showFacts: boolean;
  /** The analysis panel under the screen: behind a "Show the numbers" button, or open. */
  analysisPanel: "collapsed" | "open";
  /** The live commentary is the largest thing under the pitch. */
  commentaryLarge: boolean;
};

const FULL: ScreenLayout = {
  analysisDefault: true,
  insights: "full",
  rail: "full",
  showFacts: false,
  analysisPanel: "open",
  commentaryLarge: false,
};

export function layoutFor(mode: Mode): ScreenLayout {
  if (mode === "casual") {
    return { analysisDefault: false, insights: "headline", rail: "basic", showFacts: false, analysisPanel: "collapsed", commentaryLarge: true };
  }
  if (mode === "analyst") return { ...FULL, showFacts: true };
  return FULL;
}

const FACT_WORDS: Record<string, string> = {
  xg: "xG",
  pct: "%",
  km: "km",
  m: "m",
  kmh: "km/h",
  min: "min",
  "5min": "last 5 min",
  "10min": "last 10 min",
  "15min": "last 15 min",
  opp: "opponent",
};

/** `shots_last_5min` → "Shots last 5 min"; `shot_xg` → "Shot xG": a fact key as a viewer reads it. */
export function factLabel(key: string): string {
  const words = key
    .split("_")
    .filter((w) => w !== "match" && w !== "last")
    .map((w) => FACT_WORDS[w] ?? w);
  const text = words.join(" ").replace(/\s+/g, " ").trim();
  return text ? text[0].toUpperCase() + text.slice(1) : key;
}

const surname = (name: string) => name.split(" ").at(-1) ?? name;

/** "Sartori is winning the forwards' battle", or level. */
export function battleHeadline(b: Battle, roleLabel: string): string {
  const lead = b.edge ? b[b.edge] : null;
  if (!b.home || !b.away) return `${roleLabel}: not enough play yet to compare.`;
  if (!lead) return `${roleLabel}: ${surname(b.home.meta.name)} and ${surname(b.away.meta.name)} are level so far.`;
  const other = b.edge === "home" ? b.away : b.home;
  return `${roleLabel}: ${surname(lead.meta.name)} is getting the better of ${surname(other.meta.name)}.`;
}

/** "Vitale and Sartori are linking up most" for a team's strongest passing pair. */
export function connectionHeadline(links: readonly Connection[], name: (playerId: string) => string): string {
  const top = links[0];
  return top ? `${name(top.a)} and ${name(top.b)} are linking up most.` : "No passing pair stands out yet.";
}

/** "Moretti is putting in the most work" for the top of the engine room. */
export function workHeadline(top: readonly Workhorse[], name: (playerId: string) => string): string {
  return top[0] ? `${name(top[0].playerId)} is putting in the most work.` : "Nobody has broken sweat yet.";
}

const TEMPO_PLAIN: Record<Tempo["state"], string> = {
  control: "The game is under control",
  balanced: "The game is finely balanced",
  chaos: "The game has turned chaotic",
};
const RHYTHM_PLAIN: Record<Tempo["rhythm"], string> = { faster: "and speeding up", steady: "at a steady pace", slower: "and slowing down" };

/** "The game has turned chaotic and speeding up. Calverholme are keeping the ball longer." */
export function tempoHeadline(t: Tempo | null, teamName: (side: "home" | "away") => string): string {
  if (!t) return "Reading the rhythm: a few minutes of play first.";
  const who = t.inControl ? ` ${teamName(t.inControl)} are keeping the ball longer.` : "";
  return `${TEMPO_PLAIN[t.state]} ${RHYTHM_PLAIN[t.rhythm]}.${who}`;
}
