import { describe, expect, it } from "vitest";
import { attacksEast, PITCH_VIEW_BOX, pitchToSvg, teamToPitch } from "@/lib/coordinates";

describe("pitchToSvg", () => {
  it("maps the corners and the centre of the pitch to metres, with no flip", () => {
    expect(pitchToSvg({ x: 0, y: 0 })).toEqual({ x: 0, y: 0 }); // north-west corner is top-left
    expect(pitchToSvg({ x: 100, y: 100 })).toEqual({ x: 105, y: 68 }); // south-east corner is bottom-right
    expect(pitchToSvg({ x: 50, y: 50 })).toEqual({ x: 52.5, y: 34 });
    expect(pitchToSvg({ x: 100, y: 0 })).toEqual({ x: 105, y: 0 }); // east is right, north is up
  });

  it("scales x by 1.05 and y by 0.68", () => {
    const p = pitchToSvg({ x: 24, y: 90 });
    expect(p.x).toBeCloseTo(25.2, 10);
    expect(p.y).toBeCloseTo(61.2, 10);
  });

  it("uses the viewBox the contract names", () => {
    expect(PITCH_VIEW_BOX).toBe("0 0 105 68");
  });
});

describe("attacksEast", () => {
  it.each([
    ["home", 1, true],
    ["home", 2, false],
    ["home", 3, true],
    ["home", 4, false],
    ["away", 1, false],
    ["away", 2, true],
    ["away", 3, false],
    ["away", 4, true],
  ] as const)("%s in period %i attacks east: %s", (side, period, expected) => {
    expect(attacksEast(side, period)).toBe(expected);
  });

  it("has no direction for a shootout, because the contract does not define one", () => {
    expect(attacksEast("home", 5)).toBeNull();
    expect(attacksEast("away", 5)).toBeNull();
  });
});

describe("teamToPitch", () => {
  it("leaves a team that attacks east unchanged", () => {
    expect(teamToPitch({ x: 76, y: 10 }, true)).toEqual({ x: 76, y: 10 });
  });

  it("turns a team that attacks west through 180 degrees", () => {
    expect(teamToPitch({ x: 76, y: 10 }, false)).toEqual({ x: 24, y: 90 });
  });

  it("reproduces the worked example in CONTRACTS.md §4", () => {
    // Period 2: the home team attacks west. Its left winger's team-frame position (76, 10) is pitch-frame (24, 90).
    const homeAttacksEast = attacksEast("home", 2);
    expect(homeAttacksEast).toBe(false);
    expect(teamToPitch({ x: 76, y: 10 }, homeAttacksEast === true)).toEqual({ x: 24, y: 90 });
  });

  it("applying it twice gives the original point", () => {
    const p = { x: 33.3, y: 71.2 };
    expect(teamToPitch(teamToPitch(p, false), false)).toEqual(p);
  });

  it("sanity check from CONTRACTS.md §1.1: a left winger attacking east renders near the top of the screen", () => {
    const winger = { x: 80, y: 10 }; // small team-frame y = the team's left
    const onScreen = pitchToSvg(teamToPitch(winger, attacksEast("home", 1) === true));
    expect(onScreen.y).toBeLessThan(68 / 2);
  });

  it("the same winger, with the team attacking west, renders near the bottom", () => {
    const onScreen = pitchToSvg(teamToPitch({ x: 80, y: 10 }, attacksEast("home", 2) === true));
    expect(onScreen.y).toBeGreaterThan(68 / 2);
  });
});
