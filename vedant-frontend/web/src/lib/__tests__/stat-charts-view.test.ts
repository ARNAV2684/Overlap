import { createElement, type ReactElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeatmapZones } from "@/components/charts/HeatmapZones";
import { MomentumTide } from "@/components/charts/MomentumTide";
import { PassNetwork } from "@/components/charts/PassNetwork";
import { PressingZones } from "@/components/charts/PressingZones";
import { StatBars } from "@/components/charts/StatBars";
import { LiveMatchFallback } from "@/components/live/LiveMatchView";
import { MatchStatsSectionView } from "@/components/live/MatchStatsSection";
import type { HeavyStatPanel } from "@/lib/contracts";
import { FIRST_HEAVY_NOTE, NOT_ENOUGH_DATA, tideSeries } from "@/lib/stat-charts";
import { emptyStats, type PlayerInfo } from "@/lib/store";
import { countGrid, makeHeavy, makePanel, makeSetup } from "./fixtures";

// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");
const render = (element: ReactElement) => visible(renderToString(element));
const count = (html: string, text: string) => html.split(text).length - 1;

const HOME = "Northbridge FC";
const AWAY = "Harbour Athletic";
const heavyPanel = makePanel({ match_ms: 3_840_000, clock: "64:00", heavy: makeHeavy() }) as HeavyStatPanel;
const players: ReadonlyMap<string, PlayerInfo> = new Map(
  [1, 4, 11].map((shirt) => {
    const id = `NBR-${String(shirt).padStart(2, "0")}`;
    return [id, { player_id: id, name: `Nora ${shirt}`, pos: "MF", shirt, team_id: "NBR", side: "home" as const }];
  }),
);

describe("StatBars", () => {
  it("waits for the first panel", () => {
    expect(render(createElement(StatBars, { panel: null, home: HOME, away: AWAY }))).toContain("Waiting for the first stat panel.");
  });

  it("is a captioned table of both teams' numbers, with split bars only where more means more", () => {
    const html = render(createElement(StatBars, { panel: makePanel(), home: HOME, away: AWAY }));
    expect(html).toContain("<caption");
    expect(html).toContain("Team stats at 62:14");
    expect(html).toContain(`<th scope="col" class="pb-1 text-left font-semibold">${HOME}</th>`);
    expect(html).toContain(">58%<");
    expect(html).toContain(">1.42<");
    expect(html).toContain('style="width:58.0%"');
    expect(count(html, 'aria-hidden="true" class="mt-1.5 flex')).toBe(7);
    expect(html).toContain("lower means more intense pressing");
  });

  it("says not enough data for a null value", () => {
    const panel = makePanel();
    panel.teams.home.ppda_last_10min = null;
    expect(render(createElement(StatBars, { panel, home: HOME, away: AWAY }))).toContain(NOT_ENOUGH_DATA);
  });
});

describe("MomentumTide", () => {
  it("waits for the first panel", () => {
    expect(render(createElement(MomentumTide, { buckets: [], home: HOME, away: AWAY }))).toContain("Waiting for the first stat panel.");
  });

  it("draws every spell and names the latest one's numbers", () => {
    const html = render(createElement(MomentumTide, { buckets: tideSeries(makePanel(), heavyPanel), home: HOME, away: AWAY }));
    expect(html).toContain('role="img"');
    expect(html).toContain(
      `aria-label="Momentum by 5-minute spell, ${HOME} above the line and ${AWAY} below. ` +
        `Latest spell, 2nd half 60–65′: ${HOME} 9.5, ${AWAY} 3.0."`,
    );
    expect(count(html, "<title>")).toBe(14);
    expect(html).toContain(`<title>1st half 10–15′: ${HOME} 2.0, ${AWAY} 1.5</title>`);
    expect(html).toContain("1st half");
    expect(html).toContain("2nd half");
  });
});

describe("pitch charts", () => {
  it("say when the first heavy panel is due, over an empty pitch", () => {
    for (const html of [
      render(createElement(PressingZones, { grid: null, team: HOME })),
      render(createElement(HeatmapZones, { zones: null, team: HOME })),
      render(createElement(PassNetwork, { network: null, players, team: HOME })),
    ]) {
      expect(html).toContain(FIRST_HEAVY_NOTE);
      expect(html).toContain('viewBox="0 0 105 68"');
      expect(html).toContain("Attacking →");
    }
  });

  it("pressing zones: shaded cells and a summary by third", () => {
    const html = render(createElement(PressingZones, { grid: makeHeavy().pressing_grid.home, team: HOME }));
    expect(html).toContain(
      `aria-label="Pressing actions, ${HOME}: 20 in total. 12 in the attacking third, 6 in the middle third, 2 in their own third."`,
    );
    expect(count(html, 'class="fill-primary"')).toBe(3);
    expect(html).toContain("<title>12 pressing actions</title>");
  });

  it("touch zones: the busiest channel too", () => {
    const html = render(createElement(HeatmapZones, { zones: makeHeavy().zones.home, team: HOME }));
    expect(html).toContain("70 in total. 40 in the attacking third, 25 in the middle third, 5 in their own third.");
    expect(html).toContain("Busiest channel: left.");
    expect(render(createElement(HeatmapZones, { zones: countGrid(3, 6), team: HOME }))).not.toContain("Busiest channel");
  });

  it("pass network: nodes with shirts, links with titles, and the busiest passer", () => {
    const html = render(createElement(PassNetwork, { network: makeHeavy().pass_network.home, players, team: HOME, colour: "#B3202A" }));
    expect(html).toContain(
      `aria-label="Pass network, ${HOME}: 3 players, 2 links of 3 or more passes. Most passes: Nora 11 (42)."`,
    );
    expect(html).toContain("<title>Nora 4 to Nora 11: 9 passes</title>");
    expect(html).toContain("<title>Nora 11: 42 passes</title>");
    expect(html).toContain('fill="#B3202A"');
    expect(html).toContain(">11</text>");
    expect(html).toContain("Starting XI until the first substitution");
  });
});

describe("MatchStatsSectionView", () => {
  it("before any panel: every part waits", () => {
    const html = render(createElement(MatchStatsSectionView, { stats: emptyStats(), setup: null }));
    expect(html).toContain('aria-label="Match stats"');
    expect(count(html, "Waiting for the first stat panel.")).toBe(2);
    expect(html).toContain(FIRST_HEAVY_NOTE);
    expect(html).toContain("Home team");
  });

  it("with panels: the bars, the tide, the pass network for the home team, and both switches", () => {
    const stats = { latest: makePanel(), heavy: heavyPanel };
    const html = render(createElement(MatchStatsSectionView, { stats, setup: makeSetup(), players }));
    expect(html).toContain("Team stats");
    expect(html).toContain("Momentum");
    expect(html).toContain("Team shape");
    expect(html).toContain('role="radiogroup" aria-label="Team shape chart"');
    expect(html).toContain('role="radiogroup" aria-label="Team"');
    expect(html).toContain(`Pass network, ${HOME}`);
    expect(html).toContain("--team-home:#B3202A");
    expect(html).toContain(">62:14<");
    expect(html).toContain(">64:00<");
  });

  it("is part of the loading fallback, so the shell does not jump", () => {
    expect(render(createElement(LiveMatchFallback, {}))).toContain('aria-label="Match stats"');
  });
});
