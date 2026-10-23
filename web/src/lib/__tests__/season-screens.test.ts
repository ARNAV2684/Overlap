// season-screens.test.ts — The season pages, rendered
//
// Purpose: each season screen renders from the committed season document: the league table with every club, links
//          only to clubs that have a page, the club page's visuals and squad links, the player's scout card and the
//          compare page; numbers on screen come from the document
// Inputs:  web/data/season/season-S1.json (built by stats/main.py season)
// Outputs: pass / fail
// Spec:    web/specs/screens.md §8–§11

import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { seasonDocumentSchema, type SeasonDocument } from "@/lib/contracts";
import { leagueView, playerView, teamView } from "@/lib/season";
import { ClubScreen } from "@/components/season/ClubScreen";
import { CompareScreen } from "@/components/season/CompareScreen";
import { LeagueScreen } from "@/components/season/LeagueScreen";
import { PlayerScreen } from "@/components/season/PlayerScreen";

const FILE = path.join(process.cwd(), "data", "season", "season-S1.json");
const doc: SeasonDocument = seasonDocumentSchema.parse(JSON.parse(readFileSync(FILE, "utf-8")));

// renderToString escapes apostrophes; compare against the decoded text
const text = (html: string) => html.replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"');

describe("league page", () => {
  const html = text(renderToString(createElement(LeagueScreen, { view: leagueView(doc) })));

  it("lists every club in the table", () => {
    for (const t of doc.teams) expect(html).toContain(t.name);
  });

  it("links only the clubs that have a page", () => {
    for (const t of doc.teams) {
      const linked = html.includes(`href="/club/${t.team_id}"`);
      expect(linked).toBe(!doc.hidden_teams.includes(t.team_id));
    }
  });

  it("shows the leader's points and expected points from the document", () => {
    const leader = doc.teams.find((t) => t.table.position === 1)!;
    expect(html).toContain(`>${leader.table.points}<`);
  });
});

describe("club page", () => {
  const club = doc.teams.find((t) => !doc.hidden_teams.includes(t.team_id))!;
  const view = teamView(doc, club.team_id)!;
  const html = text(renderToString(createElement(ClubScreen, { view })));

  it("shows the club with its DNA, pressing and squad", () => {
    expect(html).toContain(club.name);
    expect(html).toContain("Club DNA");
    expect(html).toContain("Squad");
  });

  it("links every squad player to their scout card", () => {
    const squad = doc.players.filter((p) => p.team_id === club.team_id);
    expect(squad.length).toBeGreaterThan(0);
    for (const p of squad) expect(html).toContain(`href="/player/${p.player_id}"`);
  });

  it("has no page for a reference club", () => {
    for (const id of doc.hidden_teams) expect(teamView(doc, id)).toBeNull();
  });
});

describe("player and compare pages", () => {
  const [first, second] = doc.players.filter((p) => p.group && p.group === doc.players[0].group);
  const a = playerView(doc, first.player_id)!;
  const b = playerView(doc, second.player_id)!;

  it("shows the scout card with the player's name and team", () => {
    const html = text(renderToString(createElement(PlayerScreen, { view: a })));
    expect(html).toContain(a.player.name);
    expect(html).toContain(doc.teams.find((t) => t.team_id === first.team_id)!.name);
  });

  it("puts two players of one group side by side", () => {
    const html = text(renderToString(createElement(CompareScreen, { a, b })));
    expect(html).toContain(`${a.player.name} or ${b.player.name}?`);
  });

  it("asks for a second player when none is picked", () => {
    const html = text(renderToString(createElement(CompareScreen, { a, b: null })));
    expect(html).toContain(`Compare ${a.player.name} with`);
  });
});
