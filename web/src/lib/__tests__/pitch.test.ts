import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LivePitch, pitchTime } from "@/components/charts/LivePitch";
import { LivePositionsPanelView } from "@/components/live/LivePositionsPanel";
import type { TrackingFrame } from "@/lib/contracts";
import { attacksEast, teamToPitch } from "@/lib/coordinates";
import type { PlayerInfo } from "@/lib/store";
import { makeFrame, makeSetup } from "./fixtures";

// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");

const colours = { home: "#B3202A", away: "#E0A526" };
const players: ReadonlyMap<string, PlayerInfo> = new Map([
  ["NBR-11", { player_id: "NBR-11", name: "Nora 11", pos: "LW", shirt: 11, team_id: "NBR", side: "home" as const }],
  ["HBA-04", { player_id: "HBA-04", name: "Hugo 4", pos: "CB", shirt: 4, team_id: "HBA", side: "away" as const }],
]);

function frameWith(over: Partial<TrackingFrame> = {}): TrackingFrame {
  return makeFrame({
    period: 1,
    match_ms: 3_734_000,
    ball: { x: 50, y: 50, z: 0, speed_kmh: 10 },
    players: [
      { player_id: "NBR-11", x: 80, y: 10, speed_kmh: 20, dist_m: 5000 },
      { player_id: "HBA-04", x: 20, y: 60, speed_kmh: 5, dist_m: 4000 },
    ],
    ...over,
  });
}

const render = (frame: TrackingFrame | null, map = players, kits: typeof colours | null = colours) =>
  renderToString(createElement(LivePitch, { frame, players: map, colours: kits }));

describe("LivePitch", () => {
  it("before the first frame: the markings, a waiting message and no markers", () => {
    const html = render(null);
    expect(html).toContain('viewBox="0 0 105 68"');
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Pitch, waiting for the first position frame"');
    expect(visible(html)).toContain("Waiting for the first position frame");
    expect(html).toContain("stroke-pitch-line");
    expect(html).not.toContain("<title>");
  });

  it("is labelled with the frame's play time", () => {
    expect(pitchTime(frameWith())).toBe("62:14");
    expect(render(frameWith())).toContain('aria-label="Positions at 62:14"');
  });

  it("places each player through pitchToSvg with no flips, in the kit colour, numbered and named", () => {
    const html = render(frameWith());
    expect(html).toContain("transform:translate(84px, 6.8px)"); // (80, 10) × (1.05, 0.68)
    expect(html).toContain("transform:translate(21px, 40.8px)");
    expect(html).toContain('fill="#B3202A"');
    expect(html).toContain('fill="#E0A526"');
    expect(html).toContain("<title>Nora 11 (11)</title>");
    // readableInk: white on the dark red kit, near-black on the light gold one
    expect(html).toMatch(/fill-white[^>]*>11</);
    expect(html).toMatch(/fill-greys-950[^>]*>4</);
  });

  it("draws the ball last, above the players", () => {
    const html = render(frameWith());
    expect(html.indexOf("<title>Ball</title>")).toBeGreaterThan(html.indexOf("<title>Hugo 4 (4)</title>"));
    expect(html).toContain("transform:translate(52.5px, 34px)");
  });

  it("before the setup: grey markers named by player id, without numbers", () => {
    const html = render(frameWith(), new Map(), null);
    expect(html).toContain("fill-greys-500");
    expect(html).toContain("<title>NBR-11</title>");
    expect(html).not.toContain('fill="#');
  });

  it("sanity check (CONTRACTS.md §1.1): in period 1 the home left winger renders near the top", () => {
    // A left winger has a small team-frame y; home attacks east in period 1, so the pitch frame equals the team frame
    const lw = teamToPitch({ x: 80, y: 10 }, attacksEast("home", 1) ?? true);
    const html = render(frameWith({ players: [{ player_id: "NBR-11", ...lw, speed_kmh: 0, dist_m: 0 }] }));
    const y = Number(/translate\([\d.]+px, ([\d.]+)px\)/.exec(html)?.[1]);
    expect(y).toBeLessThan(68 / 4);
  });
});

describe("LivePositionsPanelView", () => {
  it("before anything arrives: header, an empty timestamp, the default legend and the note", () => {
    const html = visible(renderToString(createElement(LivePositionsPanelView, { frame: null, setup: null })));
    for (const text of ["Live positions", "Latest received tracking frame", "–", "Home team", "Away team", "Ball", "once a second"]) {
      expect(html).toContain(text);
    }
  });

  it("with a frame and the setup: the elapsed time and the clubs' real (invented) names", () => {
    const html = visible(
      renderToString(createElement(LivePositionsPanelView, { frame: frameWith(), players, setup: makeSetup() })),
    );
    expect(html).toContain("62:14.000");
    expect(html).toContain("Northbridge FC");
    expect(html).toContain("Harbour Athletic");
    expect(html).not.toContain("Home team");
  });
});
