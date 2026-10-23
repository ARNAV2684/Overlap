import { describe, expect, it } from "vitest";
import { goalAnnouncement, goalBetween, type Score } from "@/lib/goal";
import { createMatchStore } from "@/lib/store";
import { MATCH, eventEnv, makeSetup, statusEnv } from "./fixtures";


describe("goalBetween", () => {
  it("finds a goal for the side whose score rose", () => {
    expect(goalBetween({ home: 0, away: 0 }, { home: 1, away: 0 })).toEqual({ side: "home", score: { home: 1, away: 0 } });
    expect(goalBetween({ home: 1, away: 0 }, { home: 1, away: 1 })).toEqual({ side: "away", score: { home: 1, away: 1 } });
  });

  it("names no side when both rose between two publishes", () => {
    expect(goalBetween({ home: 0, away: 0 }, { home: 1, away: 1 })?.side).toBeNull();
  });

  it("is not a goal when nothing rose, the score fell, or a session starts or ends", () => {
    expect(goalBetween({ home: 1, away: 0 }, { home: 1, away: 0 })).toBeNull();
    expect(goalBetween({ home: 1, away: 0 }, { home: 0, away: 0 })).toBeNull();
    expect(goalBetween(null, { home: 3, away: 2 })).toBeNull();
    expect(goalBetween({ home: 3, away: 2 }, null)).toBeNull();
  });
});

describe("goalAnnouncement", () => {
  it("names the club and the score", () => {
    expect(goalAnnouncement({ side: "home", score: { home: 1, away: 0 } }, makeSetup())).toBe("Goal, Northbridge FC. 1–0.");
    expect(goalAnnouncement({ side: "away", score: { home: 1, away: 1 } }, makeSetup())).toBe(
      "Goal, Harbour Athletic. 1–1.",
    );
  });

  it("falls back to the side without a setup, and to no club for two goals at once", () => {
    expect(goalAnnouncement({ side: "away", score: { home: 0, away: 1 } }, null)).toBe("Goal, away team. 0–1.");
    expect(goalAnnouncement({ side: null, score: { home: 2, away: 1 } }, makeSetup())).toBe("Goals. 2–1.");
  });
});

describe("goals over a real store", () => {
  // What the Scoreboard sees: every published score, in order, and goalBetween over each consecutive pair
  function watch() {
    const store = createMatchStore(MATCH, { now: () => Date.now(), onReject: () => {} });
    const published: (Score | null)[] = [store.getState().scoreboard.score];
    store.subscribe(() => {
      const score = store.getState().scoreboard.score;
      if (published.at(-1) !== score) published.push(score);
    });
    const goals = () =>
      published.flatMap((score, i) => {
        const goal = i === 0 ? null : goalBetween(published[i - 1], score);
        return goal ? [goal] : [];
      });
    return { store, goals };
  }

  it("finds each live goal once", () => {
    const { store, goals } = watch();
    store.ingest(statusEnv(1, "live", { home: 0, away: 0 }, { setup: makeSetup() }), 1);
    store.flush();
    store.ingest(statusEnv(2, "live", { home: 1, away: 0 }), 2);
    store.flush();
    store.ingest(eventEnv(3), 3); // a later message must not repeat the goal
    store.flush();
    store.ingest(statusEnv(4, "live", { home: 1, away: 1 }), 4);
    store.flush();
    expect(goals().map((g) => g.side)).toEqual(["home", "away"]);
    store.destroy();
  });

  it("never finds a goal in snapshot history, on the first connection or after a reconnect", () => {
    const { store, goals } = watch();
    // Same order as socket.ts catchUp: reset (publishes at once), then the snapshot's envelopes, then one flush
    const catchUp = (history: number[][]) => {
      store.reset();
      history.forEach(([seq, home, away]) => store.ingest(statusEnv(seq, "live", { home, away }), null));
      store.flush();
    };
    catchUp([
      [1, 0, 0],
      [2, 1, 0],
      [3, 2, 0],
    ]);
    catchUp([
      [1, 0, 0],
      [2, 1, 0],
      [3, 2, 0],
      [4, 2, 1],
    ]);
    expect(goals()).toEqual([]);
    store.destroy();
  });
});
