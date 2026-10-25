// mode-layout.test.ts — Casual and Analyst are two different screens
//
// Purpose: the mode decides what the match screen shows; Casual tells the story, Analyst shows the data; the
//          plain-language headlines and fact labels read as a viewer would say them
// Inputs:  hand-made insight data
// Outputs: pass / fail
// Spec:    web/specs/screens.md §2.9

import { describe, expect, it } from "vitest";
import type { Battle, Connection, Tempo, Workhorse } from "@/lib/live/live-insights";
import { battleHeadline, connectionHeadline, factLabel, layoutFor, tempoHeadline, workHeadline } from "@/lib/live/mode-layout";

const player = (name: string) => ({ meta: { name } as never, line: {} as never });

describe("layoutFor", () => {
  it("makes casual and analyst differ in every switch the screen has", () => {
    const casual = layoutFor("casual");
    const analyst = layoutFor("analyst");
    for (const key of Object.keys(casual) as (keyof typeof casual)[]) expect(casual[key]).not.toEqual(analyst[key]);
  });

  it("gives casual the story and analyst the data", () => {
    expect(layoutFor("casual")).toMatchObject({ insights: "headline", rail: "basic", analysisPanel: "collapsed", commentaryLarge: true });
    expect(layoutFor("analyst")).toMatchObject({ insights: "full", rail: "full", analysisPanel: "open", showFacts: true, analysisDefault: true });
  });

  it("keeps the full screen for my club and player focus", () => {
    expect(layoutFor("club")).toMatchObject({ insights: "full", rail: "full", analysisPanel: "open" });
    expect(layoutFor("player")).toEqual(layoutFor("club"));
  });
});

describe("plain-language pieces", () => {
  it("labels checked facts as a viewer reads them", () => {
    expect(factLabel("shots_last_5min")).toBe("Shots last 5 min");
    expect(factLabel("shot_xg")).toBe("Shot xG");
    expect(factLabel("team_goals_match")).toBe("Team goals");
    expect(factLabel("pressures_per_opp_pass_last_5min")).toBe("Pressures per opponent pass last 5 min");
  });

  it("tells a head-to-head without numbers", () => {
    const b = (edge: Battle["edge"]): Battle => ({ role: "forward", home: player("Lorenzo Sartori"), away: player("Navid Aziz"), rows: [], edge });
    expect(battleHeadline(b("home"), "Forwards")).toBe("Forwards: Sartori is getting the better of Aziz.");
    expect(battleHeadline(b("away"), "Forwards")).toBe("Forwards: Aziz is getting the better of Sartori.");
    expect(battleHeadline(b(null), "Forwards")).toBe("Forwards: Sartori and Aziz are level so far.");
    expect(battleHeadline({ ...b(null), away: null }, "Forwards")).toMatch(/not enough play/);
  });

  it("names the strongest pair, the hardest worker and the tempo in words", () => {
    const name = (id: string) => ({ a: "Vitale", b: "Sartori", w: "Moretti" })[id] ?? id;
    expect(connectionHeadline([{ a: "a", b: "b" } as Connection], name)).toBe("Vitale and Sartori are linking up most.");
    expect(connectionHeadline([], name)).toMatch(/No passing pair/);
    expect(workHeadline([{ playerId: "w" } as Workhorse], name)).toBe("Moretti is putting in the most work.");
    const t = { state: "chaos", rhythm: "faster", inControl: "home" } as Tempo;
    expect(tempoHeadline(t, () => "Calverholme Athletic")).toBe(
      "The game has turned chaotic and speeding up. Calverholme Athletic are keeping the ball longer.",
    );
    expect(tempoHeadline(null, () => "")).toMatch(/a few minutes of play/);
    expect(tempoHeadline(t, () => "x")).not.toMatch(/\d/);
  });
});
