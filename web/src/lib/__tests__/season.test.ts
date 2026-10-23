// season.test.ts — Season document and views
//
// Purpose: the committed season document matches its schema; the league, club and player views pick from it
//          without inventing numbers; the reference clubs get no pages; the routes answer with the documented codes
// Inputs:  web/data/season/season-S1.json (built by stats/main.py season)
// Outputs: pass / fail
// Spec:    web/specs/realtime.md §7; stats/specs/season.md

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { seasonDocumentSchema, type SeasonDocument } from "@/lib/contracts";
import { leagueView, playerValue, playerView, teamView } from "@/lib/season";
import { GET as leagueGET } from "@/app/api/season/[id]/route";
import { GET as playerGET } from "@/app/api/season/[id]/player/[playerId]/route";
import { GET as teamGET } from "@/app/api/season/[id]/team/[teamId]/route";

const FILE = path.join(process.cwd(), "data", "season", "season-S1.json");
const doc: SeasonDocument = seasonDocumentSchema.parse(JSON.parse(readFileSync(FILE, "utf-8")));

const call = <P>(handler: (r: Request, c: { params: Promise<P> }) => Promise<Response>, params: P) =>
  handler(new Request("http://localhost/api/season"), { params: Promise.resolve(params) });

describe("season document", () => {
  it("is the full S1 league", () => {
    expect(doc.built_from.matches).toBe(90);
    expect(doc.teams).toHaveLength(10);
    expect(doc.matches).toHaveLength(90);
    const points = doc.teams.map((t) => t.table.points);
    expect(points.reduce((a, b) => a + b, 0)).toBe(
      doc.matches.reduce((sum, m) => sum + (m.score.home === m.score.away ? 2 : 3), 0),
    );
  });

  it("keeps the reference clubs' players out", () => {
    expect(doc.hidden_teams).toEqual(["CAL", "DTN"]);
    expect(doc.players.some((p) => doc.hidden_teams.includes(p.team_id))).toBe(false);
  });
});

describe("views", () => {
  it("league: table order, every team's numbers straight from the document", () => {
    const view = leagueView(doc);
    expect(view.teams.map((t) => t.table.position)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    for (const t of view.teams) {
      const source = doc.teams.find((d) => d.team_id === t.team_id)!;
      expect(t.xpts).toBe(source.xpts);
      expect(t.season).toEqual(source.season);
      expect("shots_for" in t).toBe(false);
    }
    expect(view.players).toHaveLength(doc.players.length);
  });

  it("club: a generated club has a page with its squad, a reference club has none", () => {
    const kes = teamView(doc, "KES");
    expect(kes?.team.team_id).toBe("KES");
    expect(kes?.matches).toHaveLength(18);
    expect(kes?.squad.every((p) => p.team_id === "KES")).toBe(true);
    expect(teamView(doc, "CAL")).toBeNull();
    expect(teamView(doc, "ZZZ")).toBeNull();
  });

  it("player: radar keys come from the group, values from the player", () => {
    const regular = doc.players.find((p) => p.group === "attackers" && !p.low_sample)!;
    const view = playerView(doc, regular.player_id)!;
    expect(view.radar).toEqual(doc.rules.radar.attackers);
    for (const key of view.radar) {
      expect(view.player.percentiles?.[key]).toBeGreaterThanOrEqual(0);
      expect(typeof view.group_median[key]).toBe("number");
    }
    expect(playerValue(view.player, "pass_completion_pct")).toBe(view.player.rates.pass_completion_pct);
    expect(playerValue(view.player, "goals")).toBe(view.player.per90.goals);
    expect(view.peers.every((p) => p.group === "attackers" && !p.low_sample)).toBe(true);
  });
});

describe("routes", () => {
  it("answer the league, a club and a player", async () => {
    const league = await call(leagueGET, { id: "S1" });
    expect(league.status).toBe(200);
    expect(league.headers.get("Cache-Control")).toContain("max-age");
    expect((await call(teamGET, { id: "S1", teamId: "KES" })).status).toBe(200);
    const player = doc.players[0].player_id;
    expect((await call(playerGET, { id: "S1", playerId: player })).status).toBe(200);
  });

  it("refuse bad ids and missing seasons with the documented codes", async () => {
    expect((await call(leagueGET, { id: "season1" })).status).toBe(400);
    expect((await call(teamGET, { id: "S1", teamId: "kes" })).status).toBe(400);
    expect((await call(playerGET, { id: "S1", playerId: "KES-7" })).status).toBe(400);
    expect((await call(teamGET, { id: "S1", teamId: "CAL" })).status).toBe(404);
    const missing = await call(leagueGET, { id: "S99" });
    expect(missing.status).toBe(503);
    expect(await missing.json()).toEqual({ error: "season_unavailable" });
  });
});
