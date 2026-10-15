import { describe, expect, it } from "vitest";
import { EVENT_TYPES, type EventType, type MatchEvent } from "@/lib/contracts";
import { describeEvent, playerNamer } from "@/lib/describe-event";
import { makeEvent, makeSetup } from "./fixtures";

const nameOf = playerNamer(makeSetup());

/** An event of the given type with no outcome or receiver, plus whatever the case adds. */
const ev = (type: EventType, extra: Partial<MatchEvent> = {}) =>
  makeEvent({ type, outcome: undefined, receiver_id: undefined, ...extra });

describe("playerNamer", () => {
  it("finds players on both teams, in the lineup and on the bench", () => {
    expect(nameOf("NBR-09")).toBe("Nora 9");
    expect(nameOf("HBA-05")).toBe("Hugo 5");
    expect(nameOf("NBR-13")).toBe("Nora 13");
  });

  it("returns the id for an unknown player, so a row never goes blank", () => {
    expect(nameOf("NBR-77")).toBe("NBR-77");
  });

  it("returns an empty string when there is no player", () => {
    expect(nameOf(undefined)).toBe("");
  });

  it("returns the id before the setup has arrived", () => {
    expect(playerNamer(null)("NBR-09")).toBe("NBR-09");
  });
});

describe("describeEvent: one case per event type", () => {
  it("Pass with a receiver", () => {
    expect(describeEvent(makeEvent(), nameOf)).toEqual({ title: "Pass", detail: "Nora 9 → Nora 11 · success" });
  });

  it("Pass that failed has no receiver", () => {
    expect(describeEvent(ev("Pass", { outcome: "fail" }), nameOf).detail).toBe("Nora 9 · fail");
  });

  it("Carry", () => {
    expect(describeEvent(ev("Carry"), nameOf)).toMatchObject({ title: "Carry", detail: "Nora 9" });
  });

  it("TakeOn", () => {
    expect(describeEvent(ev("TakeOn", { outcome: "success" }), nameOf)).toMatchObject({
      title: "Take-on",
      detail: "Nora 9 · success",
    });
  });

  it("Shot that scored is a goal", () => {
    expect(describeEvent(ev("Shot", { shot_outcome: "goal", situation: "open_play" }), nameOf)).toEqual({
      title: "Shot",
      detail: "Nora 9 · goal",
      emphasis: "goal",
    });
  });

  it("Shot that was saved is not emphasised", () => {
    const d = describeEvent(ev("Shot", { shot_outcome: "saved", situation: "open_play" }), nameOf);
    expect(d).toMatchObject({ title: "Shot", detail: "Nora 9 · saved" });
    expect(d.emphasis).toBeUndefined();
  });

  it("Save", () => {
    expect(describeEvent(ev("Save"), nameOf)).toMatchObject({ title: "Save", detail: "Nora 9" });
  });

  it("Tackle", () => {
    expect(describeEvent(ev("Tackle", { outcome: "success" }), nameOf)).toMatchObject({
      title: "Tackle",
      detail: "Nora 9 · success",
    });
  });

  it("Interception", () => {
    expect(describeEvent(ev("Interception"), nameOf)).toMatchObject({ title: "Interception", detail: "Nora 9" });
  });

  it("Clearance", () => {
    expect(describeEvent(ev("Clearance"), nameOf)).toMatchObject({ title: "Clearance", detail: "Nora 9" });
  });

  it("Aerial", () => {
    expect(describeEvent(ev("Aerial", { outcome: "fail" }), nameOf)).toMatchObject({
      title: "Aerial duel",
      detail: "Nora 9 · fail",
    });
  });

  it("Pressure names its target", () => {
    expect(describeEvent(ev("Pressure", { target_player_id: "HBA-05" }), nameOf)).toMatchObject({
      title: "Pressure",
      detail: "Nora 9 → Hugo 5",
    });
  });

  it("Pressure without a target", () => {
    expect(describeEvent(ev("Pressure"), nameOf).detail).toBe("Nora 9");
  });

  it("BallRecovery", () => {
    expect(describeEvent(ev("BallRecovery"), nameOf)).toMatchObject({ title: "Ball recovery", detail: "Nora 9" });
  });

  it("Foul names who was fouled", () => {
    expect(describeEvent(ev("Foul", { fouled_player_id: "HBA-05" }), nameOf)).toMatchObject({
      title: "Foul",
      detail: "Nora 9 → Hugo 5",
    });
  });

  it.each([
    ["yellow", "Nora 9 · yellow card"],
    ["second_yellow", "Nora 9 · second yellow"],
    ["red", "Nora 9 · red card"],
  ] as const)("Card %s", (card, detail) => {
    expect(describeEvent(ev("Card", { card }), nameOf)).toEqual({ title: "Card", detail, emphasis: card });
  });

  it("Substitution reads player_id as the player going off", () => {
    expect(describeEvent(ev("Substitution", { player_on_id: "NBR-13" }), nameOf)).toEqual({
      title: "Substitution",
      detail: "Nora 9 off → Nora 13 on",
      emphasis: "sub",
    });
  });

  it("Offside", () => {
    expect(describeEvent(ev("Offside"), nameOf)).toMatchObject({ title: "Offside", detail: "Nora 9" });
  });

  it("Corner", () => {
    expect(describeEvent(ev("Corner"), nameOf)).toMatchObject({ title: "Corner", detail: "Nora 9" });
  });

  it("PeriodStart has no player", () => {
    expect(describeEvent(ev("PeriodStart", { team_id: undefined, player_id: undefined, period: 2 }), nameOf)).toEqual({
      title: "Period start",
      detail: "Period 2 · kick-off",
    });
  });

  it("PeriodEnd has no player", () => {
    expect(describeEvent(ev("PeriodEnd", { team_id: undefined, player_id: undefined, period: 1 }), nameOf)).toEqual({
      title: "Period end",
      detail: "Period 1 · period finished",
    });
  });
});

describe("describeEvent: coverage and fallbacks", () => {
  it.each(EVENT_TYPES)("%s always gets a non-empty title and detail", (type) => {
    const d = describeEvent(
      ev(type, type === "PeriodStart" || type === "PeriodEnd" ? { team_id: undefined, player_id: undefined } : {}),
      nameOf,
    );
    expect(d.title.length).toBeGreaterThan(0);
    expect(d.detail.length).toBeGreaterThan(0);
  });

  it("shows ids when the setup has not arrived yet", () => {
    expect(describeEvent(makeEvent(), playerNamer(null)).detail).toBe("NBR-09 → NBR-11 · success");
  });

  it("falls back to outcome when a shot has no shot_outcome", () => {
    expect(describeEvent(ev("Shot", { outcome: "fail" }), nameOf).detail).toBe("Nora 9 · fail");
  });
});
