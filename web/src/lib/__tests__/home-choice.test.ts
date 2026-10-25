// home-choice.test.ts — Which match the home page opens on
//
// Purpose: the home page prefers a live match that is really playing, falls back to the newest replay, and keeps
//          what is already playing
// Inputs:  hand-made match list items
// Outputs: pass / fail
// Spec:    web/specs/screens.md §1

import { describe, expect, it } from "vitest";
import { pickHomeMatch, type HomeChoice } from "@/lib/home-choice";
import type { MatchListItem } from "@/lib/match-list";

const item = (matchId: string, status: "live" | "finished"): MatchListItem => ({
  match_id: matchId,
  status,
  home: { team_id: "NBR", name: "Northbridge FC" },
  away: { team_id: "HBA", name: "Harbour Athletic" },
  phase: status === "finished" ? "full_time" : null,
  score: status === "finished" ? { home: 2, away: 1 } : null,
  clock: null,
});
const none = new Set<string>();

describe("pickHomeMatch", () => {
  it("opens the newest finished match as a replay when nothing is live", () => {
    const list = [item("SYN-3003", "finished"), item("SYN-3002", "finished")];
    expect(pickHomeMatch(list, none, none, null)).toEqual({ matchId: "SYN-3003", source: "replay" });
  });

  it("returns null with no match at all", () => {
    expect(pickHomeMatch([], none, none, null)).toBeNull();
  });

  it("prefers a live match, a moving one first, then the highest match number", () => {
    const list = [item("SYN-3010", "live"), item("SYN-3011", "live"), item("SYN-3003", "finished")];
    expect(pickHomeMatch(list, none, none, null)).toEqual({ matchId: "SYN-3011", source: "live" });
    expect(pickHomeMatch(list, none, new Set(["SYN-3010"]), null)).toEqual({ matchId: "SYN-3010", source: "live" });
  });

  it("skips a live match that went quiet", () => {
    const list = [item("SYN-3011", "live"), item("SYN-3003", "finished")];
    expect(pickHomeMatch(list, new Set(["SYN-3011"]), none, null)).toEqual({ matchId: "SYN-3003", source: "replay" });
  });

  it("keeps the current choice itself when it stays the choice", () => {
    const list = [item("SYN-3011", "live"), item("SYN-3003", "finished")];
    const live: HomeChoice = { matchId: "SYN-3011", source: "live" };
    expect(pickHomeMatch(list, none, none, live)).toBe(live);
    const replay: HomeChoice = { matchId: "SYN-3002", source: "replay" };
    expect(pickHomeMatch([item("SYN-3003", "finished")], none, none, replay)).toBe(replay);
  });

  it("leaves a replay for a live match as soon as one plays", () => {
    const replay: HomeChoice = { matchId: "SYN-3003", source: "replay" };
    const list = [item("SYN-3012", "live"), item("SYN-3003", "finished")];
    expect(pickHomeMatch(list, none, none, replay)).toEqual({ matchId: "SYN-3012", source: "live" });
  });
});
