import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MetricsGridView } from "@/components/metrics/MetricsGrid";
import { ScoreboardView } from "@/components/Scoreboard";
import { goalAnnouncement, goalBetween, type Score } from "@/components/scoreboard/goal";
import { formatWallTime } from "@/lib/format";
import { createMatchStore, emptyCounters, emptyScoreboard } from "@/lib/store";
import { MATCH, eventEnv, makeSetup, statusEnv } from "./fixtures";

// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");

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

describe("ScoreboardView", () => {
  it("before the setup shows placeholders, Waiting and an empty score", () => {
    const html = visible(renderToString(createElement(ScoreboardView, { scoreboard: emptyScoreboard(MATCH) })));
    for (const text of ["Home team", "Away team", "Waiting", "– : –", "–:–", MATCH, "No score yet"]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain("--team-home");
  });

  it("shows names, kit colours, phase, score and clock once the match is under way", () => {
    const scoreboard = {
      ...emptyScoreboard(MATCH),
      setup: makeSetup(),
      phase: "half_time" as const,
      score: { home: 2, away: 1 },
      clock: "45:00",
    };
    const html = visible(renderToString(createElement(ScoreboardView, { scoreboard })));
    for (const text of ["Northbridge FC", "Harbour Athletic", "Half time", "2 : 1", "45:00", "Northbridge FC 2, Harbour Athletic 1"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("--team-home:#B3202A");
    expect(html).toContain("--team-away:#E0A526");
  });

  it("renders the assertive region only when asked, and a skeleton when the match id is unknown", () => {
    const scoreboard = emptyScoreboard(MATCH);
    expect(renderToString(createElement(ScoreboardView, { scoreboard }))).not.toContain("aria-live");
    expect(renderToString(createElement(ScoreboardView, { scoreboard, announcement: "" }))).toContain(
      'aria-live="assertive"',
    );
    expect(renderToString(createElement(ScoreboardView, { scoreboard, matchId: null }))).not.toContain(MATCH);
  });
});

describe("MetricsGridView", () => {
  it("starts at zero and Waiting", () => {
    const html = visible(renderToString(createElement(MetricsGridView, { counters: emptyCounters() })));
    for (const text of ["Messages received", "Live match events", "Tracking frames", "Last message", "Waiting"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("0 messages / last 10 seconds");
    expect(html).not.toContain("aria-live");
  });

  it("formats counts and the last message's wall time", () => {
    const lastAt = Date.UTC(2026, 9, 24, 19, 4, 11);
    const counters = { messages: 2171, events: 1284, frames: 10_855, lastAt, recent: 1 };
    const html = visible(renderToString(createElement(MetricsGridView, { counters })));
    for (const text of ["2,171", "1,284", "10,855", formatWallTime(lastAt, false), "1 message / last 10 seconds"]) {
      expect(html).toContain(text);
    }
  });
});
