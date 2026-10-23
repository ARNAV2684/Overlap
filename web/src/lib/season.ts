// season.ts — Season views
//
// Purpose: shape the season document into what each page needs: the league (table, deserved table, title race,
//          style map), one club (its season and squad) and one player (scout card with peers)
// Inputs:  a parsed season document (contracts.ts seasonDocumentSchema)
// Outputs: plain view objects for the routes and pages
// Spec:    web/specs/realtime.md §7, web/specs/screens.md §8–§10
//
// Nothing here computes a football number: every value is read from the document the stats engine built. The views
// only pick, sort and join.

import type { SeasonDocument, SeasonMatch, SeasonPlayer, SeasonTeam } from "@/lib/contracts";

export const SEASON_ID = /^S\d+$/;
export const TEAM_ID = /^[A-Z]{3}$/;
export const PLAYER_ID = /^[A-Z]{3}-\d{2}$/;

export type LeagueTeam = Omit<SeasonTeam, "shots_for" | "shots_against" | "pressing_grid" | "zones">;

export type PlayerRow = Pick<
  SeasonPlayer,
  "player_id" | "team_id" | "name" | "pos" | "group" | "role" | "minutes" | "apps" | "low_sample"
> & { goals: number; assists: number; npxg: number; shots: number; key_passes: number };

export interface SeasonMeta {
  season_id: string;
  world_version: number | null;
  matches: number;
  matchweeks: number[];
  hidden_teams: string[];
  dna_correlations: Record<string, number | null>;
  min_minutes_for_percentiles: number;
}

export interface LeagueView {
  meta: SeasonMeta;
  teams: LeagueTeam[];
  matches: SeasonMatch[];
  players: PlayerRow[];
}

export interface TeamView {
  meta: SeasonMeta;
  team: SeasonTeam;
  matches: SeasonMatch[];
  squad: PlayerRow[];
  /** The other clubs' season values, for the league comparison on the club page. */
  league: Pick<LeagueTeam, "team_id" | "name" | "colours" | "season" | "table" | "xpts">[];
}

export interface PlayerView {
  meta: SeasonMeta;
  player: SeasonPlayer;
  team: Pick<SeasonTeam, "team_id" | "name" | "colours" | "formation">;
  /** Players of the same group with enough minutes, as rows, for the compare picker and the peer context. */
  peers: PlayerRow[];
  radar: string[];
  group_median: Record<string, number>;
}

export function meta(doc: SeasonDocument): SeasonMeta {
  return {
    season_id: doc.season_id,
    world_version: doc.world_version,
    matches: doc.built_from.matches,
    matchweeks: doc.matchweeks,
    hidden_teams: doc.hidden_teams,
    dna_correlations: doc.dna_correlations,
    min_minutes_for_percentiles: doc.rules.min_minutes_for_percentiles,
  };
}

export function playerRow(p: SeasonPlayer): PlayerRow {
  return {
    player_id: p.player_id,
    team_id: p.team_id,
    name: p.name,
    pos: p.pos,
    group: p.group,
    role: p.role,
    minutes: p.minutes,
    apps: p.apps,
    low_sample: p.low_sample,
    goals: p.totals.goals ?? 0,
    assists: p.totals.assists ?? 0,
    npxg: p.totals.npxg ?? 0,
    shots: p.totals.shots ?? 0,
    key_passes: p.totals.key_passes ?? 0,
  };
}

function leagueTeam(t: SeasonTeam): LeagueTeam {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { shots_for, shots_against, pressing_grid, zones, ...rest } = t;
  return rest;
}

export function leagueView(doc: SeasonDocument): LeagueView {
  return {
    meta: meta(doc),
    teams: [...doc.teams].sort((a, b) => a.table.position - b.table.position).map(leagueTeam),
    matches: doc.matches,
    players: doc.players.map(playerRow),
  };
}

export function teamView(doc: SeasonDocument, teamId: string): TeamView | null {
  const team = doc.teams.find((t) => t.team_id === teamId);
  // The reference clubs are internal test fixtures: they stay in the table but get no page (season.md §6)
  if (!team || doc.hidden_teams.includes(teamId)) return null;
  return {
    meta: meta(doc),
    team,
    matches: doc.matches.filter((m) => m.home === teamId || m.away === teamId),
    squad: doc.players
      .filter((p) => p.team_id === teamId)
      .map(playerRow)
      .sort((a, b) => b.minutes - a.minutes),
    league: doc.teams.map((t) => ({
      team_id: t.team_id,
      name: t.name,
      colours: t.colours,
      season: t.season,
      table: t.table,
      xpts: t.xpts,
    })),
  };
}

function median(values: number[]): number {
  const v = [...values].sort((a, b) => a - b);
  if (v.length === 0) return 0;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

/** A per-90 value or a rate, whichever the key names (the document keeps them apart). */
export function playerValue(p: SeasonPlayer, key: string): number | null {
  if (key in p.rates) return p.rates[key];
  return p.per90[key] ?? null;
}

export function playerView(doc: SeasonDocument, playerId: string): PlayerView | null {
  const player = doc.players.find((p) => p.player_id === playerId);
  if (!player) return null;
  const team = doc.teams.find((t) => t.team_id === player.team_id);
  if (!team) return null;
  const radar = player.group ? (doc.rules.radar[player.group] ?? []) : [];
  const peers = doc.players.filter(
    (p) => p.group === player.group && p.minutes >= doc.rules.min_minutes_for_percentiles,
  );
  const group_median: Record<string, number> = {};
  for (const key of radar) {
    const values = peers.map((p) => playerValue(p, key)).filter((v): v is number => v !== null);
    group_median[key] = Math.round(median(values) * 100) / 100;
  }
  return {
    meta: meta(doc),
    player,
    team: { team_id: team.team_id, name: team.name, colours: team.colours, formation: team.formation },
    peers: peers.map(playerRow).sort((a, b) => b.minutes - a.minutes),
    radar,
    group_median,
  };
}
