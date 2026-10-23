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

describe("scoreSheet", () => {
  it("lists goals and cards under each team in match order, up to the playhead", () => {
    const events: FieldEvent[] = [
      { ...card("y1", "HBA-04", 1_140_000, "yellow", "HBA") },
      { id: "g1", kind: "goal", ms: 360_000, period: 1, clock: "6:03", teamId: "NBR", playerId: "NBR-09", x: 90, y: 50 },
      { id: "g2", kind: "goal", ms: 3_000_000, period: 2, clock: "50:00", teamId: "NBR", playerId: "NBR-09", x: 89, y: 50, penalty: true },
      { ...card("y2", "HBA-04", 2_400_000, "yellow", "HBA") },
    ];
    const at40 = scoreSheet(events, setup, 2_400_000);
    expect(at40.home).toEqual([{ id: "g1", kind: "goal", minute: "6′", name: "9", note: undefined }]);
    expect(at40.away.map((e) => [e.kind, e.note])).toEqual([
      ["yellow", undefined],
      ["red", "2nd yellow"],
    ]);
    expect(scoreSheet(events, setup, 4_000_000).home[1]).toMatchObject({ kind: "goal", note: "pen" });
    expect(scoreSheet(events, null, 4_000_000)).toEqual({ home: [], away: [] });
  });

  it("formats minutes, stoppage time included", () => {
    expect(minuteOf("62:14")).toBe("62′");
    expect(minuteOf("45+2:10")).toBe("45+2′");
  });
});
