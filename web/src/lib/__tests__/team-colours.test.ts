import { describe, expect, it } from "vitest";
import { contrastRatio, inkFillClass, inkTextClass, readableInk } from "@/lib/team-colours";

describe("readableInk", () => {
  it.each([
    ["#B3202A", "light"], // Northbridge red: white text reads better
    ["#E0A526", "dark"], // Harbour amber: dark text reads better
    ["#FFFFFF", "dark"],
    ["#000000", "light"],
    ["#ff860d", "dark"], // the brand orange: dark text, as the button does
    ["#3d86f4", "dark"],
    ["#1C2340", "light"],
  ])("%s → %s ink", (hex, expected) => {
    expect(readableInk(hex)).toBe(expected);
  });

  it("accepts lower-case hex", () => {
    expect(readableInk("#e0a526")).toBe("dark");
  });

  it("throws on anything that is not #RRGGBB, so bad data fails loudly", () => {
    expect(() => readableInk("red")).toThrow(TypeError);
    expect(() => readableInk("#fff")).toThrow(TypeError);
    expect(() => readableInk("")).toThrow(TypeError);
  });

  it("always gives at least 3:1 on the colours the setup is allowed to send", () => {
    for (const hex of ["#B3202A", "#E0A526", "#1C2340", "#121212", "#3d86f4", "#808080"]) {
      const ink = readableInk(hex) === "dark" ? ([11, 11, 11] as const) : ([255, 255, 255] as const);
      const bg = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
      expect(contrastRatio(ink, bg)).toBeGreaterThanOrEqual(3);
    }
  });
});

describe("contrastRatio", () => {
  it("is 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 5);
    expect(contrastRatio([128, 64, 32], [128, 64, 32])).toBeCloseTo(1, 10);
  });

  it("does not depend on the order of its arguments", () => {
    expect(contrastRatio([255, 134, 13], [11, 11, 11])).toBeCloseTo(contrastRatio([11, 11, 11], [255, 134, 13]), 10);
  });
});

describe("class helpers", () => {
  it("give the Tailwind classes for the chosen ink", () => {
    expect(inkTextClass("#E0A526")).toBe("text-greys-950");
    expect(inkTextClass("#B3202A")).toBe("text-white");
    expect(inkFillClass("#E0A526")).toBe("fill-greys-950");
    expect(inkFillClass("#B3202A")).toBe("fill-white");
  });
});
