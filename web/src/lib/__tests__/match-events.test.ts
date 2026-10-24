import { describe, expect, it } from "vitest";
import type { MatchEvent } from "@/lib/contracts";
import { bookingsAt, classifyFieldEvent, minuteOf, scoreSheet, type FieldEvent } from "@/lib/live/match-events";
import { makeEvent, makeSetup } from "./fixtures";

const setup = makeSetup();
const ev = (over: Partial<MatchEvent>) => makeEvent({ receiver_id: undefined, outcome: undefined, ...over });
const field = (over: Partial<MatchEvent>) => classifyFieldEvent(ev(over))!;

describe("classifyFieldEvent", () => {
  it("marks goals, cards and stoppages", () => {
    expect(field({ type: "Shot", shot_outcome: "goal", situation: "penalty" })).toMatchObject({ kind: "goal", penalty: true });
    expect(field({ type: "Card", card: "yellow" })).toMatchObject({ kind: "card", card: "yellow" });
    expect(field({ type: "Corner", x: 100, y: 100 }).kind).toBe("corner");
    expect(field({ type: "Offside" }).kind).toBe("offside");
    expect(field({ type: "Foul", fouled_player_id: "HBA-04" }).kind).toBe("foul");
  });

  it("reads restarts from the pass qualifiers", () => {
    expect(field({ type: "Pass", qualifiers: ["throw_in"] }).kind).toBe("throw_in");
    expect(field({ type: "Pass", qualifiers: ["free_kick", "long_ball"] }).kind).toBe("free_kick");
    expect(field({ type: "Pass", qualifiers: ["goal_kick"] }).kind).toBe("goal_kick");
  });

  it("ignores ordinary play and a corner's delivery pass (the Corner event marks it)", () => {
    expect(classifyFieldEvent(ev({ type: "Pass", qualifiers: ["corner", "cross"] }))).toBeNull();
    expect(classifyFieldEvent(ev({ type: "Pass" }))).toBeNull();
    expect(classifyFieldEvent(ev({ type: "Shot", shot_outcome: "saved", situation: "open_play" }))).toBeNull();
  });
});

const card = (id: string, playerId: string, ms: number, c: FieldEvent["card"], teamId = "NBR"): FieldEvent => ({
  id,
  kind: "card",
  ms,
  period: 1,
  clock: `${Math.floor(ms / 60_000)}:00`,
  teamId,
  playerId,
  x: 50,
  y: 50,
  card: c,
});

describe("bookingsAt", () => {
  it("books a yellow, turns a second yellow red, and ignores the future", () => {
    const cards = [card("a", "NBR-04", 600_000, "yellow"), card("b", "NBR-04", 1_800_000, "yellow"), card("c", "HBA-05", 900_000, "red", "HBA")];
    expect(bookingsAt(cards, 700_000).get("NBR-04")?.colour).toBe("yellow");
    expect(bookingsAt(cards, 700_000).has("HBA-05")).toBe(false);
    expect(bookingsAt(cards, 2_000_000).get("NBR-04")?.colour).toBe("red");
    expect(bookingsAt(cards, 2_000_000).get("HBA-05")?.colour).toBe("red");
  });
});

const goal = (id: string, playerId: string, ms: number, clock: string, teamId = "NBR", penalty?: boolean): FieldEvent => ({
  id,
  kind: "goal",
  ms,
  period: ms < 2_820_000 ? 1 : 2,
  clock,
  teamId,
  playerId,
  x: 90,
  y: 50,
  ...(penalty ? { penalty } : {}),
});

describe("scoreSheet", () => {
  it("groups a player's goals into one entry with every minute, up to the playhead", () => {
    const events = [
      goal("g3", "NBR-09", 5_500_000, "90:40"),
      goal("g1", "NBR-09", 360_000, "6:03"),
      goal("g2", "NBR-09", 2_700_000, "45:00"),
      goal("g4", "NBR-10", 3_000_000, "50:00", "NBR", true),
    ];
    const at50 = scoreSheet(events, setup, 3_000_000).home;
    expect(at50.map((e) => [e.kind, e.minutes])).toEqual([
      ["goal", [{ minute: "6′" }, { minute: "45′" }]],
      ["goal", [{ minute: "50′", note: "pen" }]],
    ]);
    const final = scoreSheet(events, setup, 6_000_000).home;
    expect(final).toHaveLength(2);
    expect(final[0]).toMatchObject({ id: "goal:NBR-09", lastMs: 5_500_000 });
    expect(final[0].minutes.map((m) => m.minute)).toEqual(["6′", "45′", "90′"]);
    expect(scoreSheet(events, null, 6_000_000)).toEqual({ home: [], away: [] });
  });

  it("shows red cards only: a yellow is left out, a second yellow shows as red", () => {
    const events = [
      card("y1", "HBA-04", 1_140_000, "yellow", "HBA"),
      card("y2", "HBA-04", 2_400_000, "yellow", "HBA"),
      card("y3", "HBA-06", 1_500_000, "yellow", "HBA"),
      card("r1", "NBR-05", 1_800_000, "red"),
      card("s1", "HBA-08", 2_000_000, "second_yellow", "HBA"),
    ];
    expect(scoreSheet(events, setup, 1_700_000)).toEqual({ home: [], away: [] });
    const sheet = scoreSheet(events, setup, 3_000_000);
    expect(sheet.home.map((e) => [e.id, e.kind, e.minutes])).toEqual([["red:NBR-05", "red", [{ minute: "30′" }]]]);
    expect(sheet.away.map((e) => [e.id, e.minutes])).toEqual([
      ["red:HBA-08", [{ minute: "33′", note: "2nd yellow" }]],
      ["red:HBA-04", [{ minute: "40′", note: "2nd yellow" }]],
    ]);
  });

  it("formats minutes, stoppage time included", () => {
    expect(minuteOf("62:14")).toBe("62′");
    expect(minuteOf("45+2:10")).toBe("45+2′");
  });
});
