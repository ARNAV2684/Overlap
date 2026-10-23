// preferences.ts — Viewer preferences
//
// Purpose: what a viewer chose (mode, language, favourite club, followed player) and which insight group that
//          choice reads from
// Inputs:  saved JSON (from the browser) or user choices
// Outputs: Preferences, parsePreferences(), audienceGroup(), labels for the controls
// Spec:    CONTRACTS.md §10.6 (modes, languages, groups). web/specs/screens.md §3
//
// Pure: no React, no storage. PreferencesProvider keeps the current value and saves it.

export const MODES = ["casual", "analyst", "club", "player"] as const;
export type Mode = (typeof MODES)[number];

export const LANGS = ["en", "es", "hi", "fr"] as const;
export type Lang = (typeof LANGS)[number];

export type Preferences = {
  mode: Mode;
  lang: Lang;
  /** Favourite club's team id (3 capital letters), or null. Club mode reads this club's group. */
  club: string | null;
  /** Followed player's id (TEAM-NN), or null. Player mode reads this player's group. */
  player: string | null;
};

export const DEFAULT_PREFERENCES: Preferences = { mode: "casual", lang: "en", club: null, player: null };

export const MODE_LABELS: Record<Mode, string> = {
  casual: "Casual",
  analyst: "Analyst",
  club: "My club",
  player: "Player focus",
};

export const LANG_LABELS: Record<Lang, string> = { en: "English", es: "Español", hi: "हिन्दी", fr: "Français" };

const TEAM_ID = /^[A-Z]{3}$/;
const PLAYER_ID = /^[A-Z]{3}-\d{2}$/;

/** Reads saved preferences; anything unknown or malformed falls back to the default for that field. */
export function parsePreferences(raw: unknown): Preferences {
  if (!raw || typeof raw !== "object") return DEFAULT_PREFERENCES;
  const r = raw as Record<string, unknown>;
  return {
    mode: MODES.includes(r.mode as Mode) ? (r.mode as Mode) : DEFAULT_PREFERENCES.mode,
    lang: LANGS.includes(r.lang as Lang) ? (r.lang as Lang) : DEFAULT_PREFERENCES.lang,
    club: typeof r.club === "string" && TEAM_ID.test(r.club) ? r.club : null,
    player: typeof r.player === "string" && PLAYER_ID.test(r.player) ? r.player : null,
  };
}

/**
 * The mode actually used for a match: club mode needs a club that plays in it, player mode a player who does.
 * Otherwise the viewer gets casual cards rather than none.
 */
export function effectiveMode(prefs: Preferences, teamIds: readonly string[], playerIds: ReadonlySet<string>): Mode {
  if (prefs.mode === "club" && (prefs.club === null || !teamIds.includes(prefs.club))) return "casual";
  if (prefs.mode === "player" && (prefs.player === null || !playerIds.has(prefs.player))) return "casual";
  return prefs.mode;
}

/** The insight group for a match and an (effective) mode (CONTRACTS.md §10.6 groups table). */
export function audienceGroup(matchId: string, mode: Mode, prefs: Preferences): string {
  if (mode === "club" && prefs.club) return `match-${matchId}-club-${prefs.club}-${prefs.lang}`;
  if (mode === "player" && prefs.player) return `match-${matchId}-player-${prefs.player}-${prefs.lang}`;
  const plain = mode === "analyst" ? "analyst" : "casual";
  return `match-${matchId}-${plain}-${prefs.lang}`;
}
