import { describe, expect, it } from "vitest";
import { formatCount, formatElapsed, formatPhase, formatWallTime } from "@/lib/format";

describe("formatElapsed", () => {
  it.each([
    [0, "00:00.000"],
    [3_734_000, "62:14.000"],
    [61_005, "01:01.005"],
    [59_999, "00:59.999"],
    [60_000, "01:00.000"],
    [7_500_000, "125:00.000"], // minutes keep counting past 59
    [1234.9, "00:01.234"], // fractions of a millisecond are dropped, not rounded up
  ])("%i ms → %s", (ms, expected) => {
    expect(formatElapsed(ms)).toBe(expected);
  });

  it("shows 00:00.000 for negative and non-numeric input", () => {
    expect(formatElapsed(-5)).toBe("00:00.000");
    expect(formatElapsed(Number.NaN)).toBe("00:00.000");
    expect(formatElapsed(Number.POSITIVE_INFINITY)).toBe("00:00.000");
  });
});

describe("formatWallTime", () => {
  const t = Date.UTC(2026, 9, 15, 19, 4, 11, 532);

  it("prints 24-hour time with milliseconds", () => {
    expect(formatWallTime(t, true, "UTC")).toBe("19:04:11.532");
  });

  it("can leave the milliseconds out", () => {
    expect(formatWallTime(t, false, "UTC")).toBe("19:04:11");
  });

  it("zero-pads the milliseconds", () => {
    expect(formatWallTime(Date.UTC(2026, 0, 1, 0, 0, 0, 5), true, "UTC")).toBe("00:00:00.005");
  });

  it("shows midnight as 00, not 24", () => {
    expect(formatWallTime(Date.UTC(2026, 0, 1, 0, 0, 0, 0), false, "UTC")).toBe("00:00:00");
  });

  it("uses the time zone it is given", () => {
    expect(formatWallTime(t, true, "Asia/Kolkata")).toBe("00:34:11.532"); // UTC+5:30, next day
  });
});

describe("formatPhase", () => {
  it.each([
    ["pre_match", "Pre-match"],
    ["live", "Live"],
    ["half_time", "Half time"],
    ["full_time", "Full time"],
  ] as const)("%s → %s", (phase, expected) => {
    expect(formatPhase(phase)).toBe(expected);
  });
});

describe("formatCount", () => {
  it.each([
    [0, "0"],
    [999, "999"],
    [1284, "1,284"],
    [1_234_567, "1,234,567"],
  ])("%i → %s", (n, expected) => {
    expect(formatCount(n)).toBe(expected);
  });
});
