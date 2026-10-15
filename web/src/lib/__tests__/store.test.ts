import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedEnvelope } from "@/lib/contracts";
import {
  createMatchStore,
  FLUSH_MS,
  notices,
  RECENT_WINDOW_MS,
  ROW_LIMIT,
  STALE_AFTER_MS,
  VISIBLE_ROWS,
  type MatchStore,
} from "@/lib/store";
import { envelope, eventEnv, makeEvent, makeSetup, MATCH, posEnv, statusEnv } from "./fixtures";

const T0 = 1_000_000;

// ---- helpers
let store: MatchStore;
let rejections: string[];

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(T0);
  rejections = [];
  store = createMatchStore(MATCH, { now: () => Date.now(), onReject: (m) => rejections.push(m) });
});

afterEach(() => {
  store.destroy();
  vi.useRealTimers();
});

/** Ingests live (received now) and publishes. */
const live = (...envs: ParsedEnvelope[]) => {
  for (const e of envs) store.ingest(e, Date.now());
  store.flush();
};
const history = (...envs: ParsedEnvelope[]) => {
  for (const e of envs) store.ingest(e, null);
  store.flush();
};
const state = () => store.getState();
const keys = () => state().timeline.rows.map((r) => r.key);

describe("limits from the plan", () => {
  it("keeps 600 rows per category, shows 120, publishes every 250 ms, and calls 10 s of silence stale", () => {
    expect(ROW_LIMIT).toBe(600);
    expect(VISIBLE_ROWS).toBe(120);
    expect(FLUSH_MS).toBe(250);
    expect(STALE_AFTER_MS).toBe(10_000);
    expect(RECENT_WINDOW_MS).toBe(10_000);
  });
});

describe("starting state", () => {
  it("is empty and connecting", () => {
    const s = state();
    expect(s.connection).toEqual({ status: "connecting", rejected: 0 });
    expect(s.scoreboard).toMatchObject({ matchId: MATCH, setup: null, phase: null, score: null, matchMs: -1 });
    expect(s.counters).toEqual({ messages: 0, events: 0, frames: 0, lastAt: null, recent: 0 });
    expect(s.timeline).toEqual({ filter: "events", rows: [] });
    expect(s.latestFrame).toBeNull();
    expect(s.inspector).toEqual({ row: null, following: true });
    expect(s.controls).toEqual({ filter: "events", paused: false });
    expect(s.notice).toEqual({ text: notices.connecting, tone: "info" });
    expect(s.players.size).toBe(0);
  });
});

describe("dedupe on seq", () => {
  it("applies an envelope once and drops a repeat", () => {
    expect(store.ingest(eventEnv(5), Date.now())).toBe("applied");
    expect(store.ingest(eventEnv(5), Date.now())).toBe("duplicate");
    store.flush();
    expect(keys()).toEqual(["5"]);
    expect(state().counters.messages).toBe(1);
    expect(state().counters.events).toBe(1);
  });

  it("treats a repeat as a duplicate even from the snapshot after a live copy", () => {
    store.ingest(eventEnv(5), Date.now());
    expect(store.ingest(eventEnv(5), null)).toBe("duplicate");
  });

  it("does not assume seq is contiguous (a snapshot leaves gaps)", () => {
    history(eventEnv(1), eventEnv(7), eventEnv(2212));
    expect(keys().reverse()).toEqual(["1", "7", "2212"]);
  });

  it("accepts an older seq that arrives late, since it was not applied yet", () => {
    live(eventEnv(10), eventEnv(8));
    expect(keys()).toEqual(["8", "10"]); // newest arrival first
  });

  it("ignores another match's envelopes", () => {
    const foreign = { ...eventEnv(1), match_id: "SYN-0001" } as ParsedEnvelope;
    expect(store.ingest(foreign, Date.now())).toBe("wrong-match");
    store.flush();
    expect(keys()).toEqual([]);
    expect(state().counters.messages).toBe(0);
  });

  it("ignores kinds the screen does not render, without using up the seq", () => {
    const stats = { seq: 3, kind: "stats", match_id: MATCH, match_ms: 1, clock: "0:01", data: {} } as ParsedEnvelope;
    expect(store.ingest(stats, Date.now())).toBe("ignored");
    expect(store.ingest(eventEnv(3), Date.now())).toBe("applied");
  });
});

describe("history versus live", () => {
  it("shows snapshot rows as history and keeps them out of the counters", () => {
    history(eventEnv(1), posEnv(2), statusEnv(3, "live"));
    expect(state().counters).toMatchObject({ messages: 0, events: 0, frames: 0, lastAt: null });
    expect(state().timeline.rows.every((r) => r.received === null)).toBe(true);
  });

  it("still moves the clock and the score from history", () => {
    history(statusEnv(3, "live", { home: 2, away: 1 }, {}, 600_000));
    expect(state().scoreboard).toMatchObject({ phase: "live", score: { home: 2, away: 1 }, clock: "10:00" });
  });

  it("counts live messages, events and frames", () => {
    live(eventEnv(1), eventEnv(2), posEnv(3, 3000, 5), statusEnv(4, "live"));
    expect(state().counters).toMatchObject({ messages: 4, events: 2, frames: 5, lastAt: T0 });
    expect(state().timeline.rows.every((r) => r.received === T0)).toBe(true);
  });

  it("marks live rows with when they arrived", () => {
    live(eventEnv(1));
    expect(state().timeline.rows[0].received).toBe(T0);
  });
});

describe("rows", () => {
  it("describes events with player names once the setup is known", () => {
    store.setSetup(makeSetup());
    live(eventEnv(1));
    expect(state().timeline.rows[0]).toMatchObject({
      key: "1",
      kind: "event",
      title: "Pass",
      detail: "Nora 9 → Nora 11 · success",
      teamId: "NBR",
      seq: 1,
      ms: 1000,
      period: 2,
    });
  });

  it("emphasises goals and cards", () => {
    store.setSetup(makeSetup());
    live(
      eventEnv(1, { type: "Shot", shot_outcome: "goal", situation: "open_play", outcome: undefined, receiver_id: undefined }),
      eventEnv(2, { type: "Card", card: "red", outcome: undefined, receiver_id: undefined }),
    );
    expect(state().timeline.rows.map((r) => r.emphasis)).toEqual(["red", "goal"]);
  });

  it("builds a state row from a status envelope", () => {
    live(statusEnv(1, "half_time", { home: 1, away: 0 }, { period: 1 }));
    expect(state().timeline.rows[0]).toMatchObject({ kind: "status", title: "Match state", detail: "Half time", period: 1 });
  });

  it("builds one tracking row per frame, keyed by envelope and index", () => {
    store.setFilter("tracking");
    live(posEnv(9, 9000, 3));
    expect(keys()).toEqual(["9:2", "9:1", "9:0"]);
    expect(state().timeline.rows[0]).toMatchObject({ kind: "tracking", title: "Position frame", detail: "1 players · ball (24.4, 89.6)" });
  });

  it("shows newest first, at most VISIBLE_ROWS", () => {
    for (let i = 1; i <= VISIBLE_ROWS + 30; i++) store.ingest(eventEnv(i), Date.now());
    store.flush();
    expect(state().timeline.rows).toHaveLength(VISIBLE_ROWS);
    expect(keys()[0]).toBe(String(VISIBLE_ROWS + 30));
    expect(keys()[VISIBLE_ROWS - 1]).toBe("31");
  });

  it("keeps only ROW_LIMIT rows per category (older ones can no longer be selected)", () => {
    for (let i = 1; i <= ROW_LIMIT + 100; i++) store.ingest(eventEnv(i), Date.now());
    store.flush();
    store.select("100"); // dropped
    expect(state().inspector.following).toBe(true);
    store.select("101"); // oldest still kept
    expect(state().inspector.row?.key).toBe("101");
    store.select(String(ROW_LIMIT + 100));
    expect(state().inspector.row?.key).toBe(String(ROW_LIMIT + 100));
  });

  it("keeps events and tracking in separate buffers, so frames cannot push events out", () => {
    live(eventEnv(1));
    for (let i = 0; i < ROW_LIMIT + 50; i++) store.ingest(posEnv(100 + i, 100_000 + i, 1), Date.now());
    store.flush();
    store.select("1");
    expect(state().inspector.row?.key).toBe("1");
  });
});

describe("filters", () => {
  beforeEach(() => {
    live(eventEnv(1), posEnv(2, 2000, 2), statusEnv(3, "live"), eventEnv(4), posEnv(5, 5000, 1));
  });

  it("'events' shows events and state changes, newest first", () => {
    expect(keys()).toEqual(["4", "3", "1"]);
  });

  it("'tracking' shows only frames", () => {
    store.setFilter("tracking");
    expect(keys()).toEqual(["5:0", "2:1", "2:0"]);
  });

  it("'all' interleaves both by arrival, newest first", () => {
    store.setFilter("all");
    expect(keys()).toEqual(["5:0", "4", "3", "2:1", "2:0", "1"]);
  });

  it("changing the filter publishes at once, without waiting for the tick", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.setFilter("tracking");
    expect(listener).toHaveBeenCalledTimes(1);
    expect(state().controls.filter).toBe("tracking");
    expect(state().timeline.filter).toBe("tracking");
  });

  it("does nothing when the filter is unchanged", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.setFilter("events");
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("throttled publishing", () => {
  it("tells subscribers once per FLUSH_MS however many messages arrive", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    for (let i = 1; i <= 200; i++) store.ingest(eventEnv(i), Date.now());
    expect(listener).not.toHaveBeenCalled(); // nothing yet: the burst is batched
    vi.advanceTimersByTime(FLUSH_MS);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(keys()).toHaveLength(VISIBLE_ROWS);
  });

  it("waits out the rest of the interval after a publish", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.ingest(eventEnv(1), Date.now());
    vi.advanceTimersByTime(0); // the first message after a quiet spell is published at once
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    store.ingest(eventEnv(2), Date.now());
    vi.advanceTimersByTime(100); // 200 ms after the last publish: still inside the window
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(60); // 260 ms: the window has passed
    expect(listener).toHaveBeenCalledTimes(2);
  });

  it("at 100 messages a second, notifies at most about 4 times a second", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    for (let t = 0; t < 1000; t += 10) {
      store.ingest(eventEnv(t / 10 + 1), Date.now());
      vi.advanceTimersByTime(10);
    }
    expect(listener.mock.calls.length).toBeLessThanOrEqual(5);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it("does not notify when nothing visible changed", () => {
    live(eventEnv(1));
    const listener = vi.fn();
    store.subscribe(listener);
    store.ingest(eventEnv(1), Date.now()); // duplicate
    vi.advanceTimersByTime(FLUSH_MS);
    expect(listener).not.toHaveBeenCalled();
  });

  it("stops notifying after unsubscribe and after destroy", () => {
    const a = vi.fn();
    const b = vi.fn();
    const unsubscribe = store.subscribe(a);
    store.subscribe(b);
    unsubscribe();
    store.ingest(eventEnv(1), Date.now());
    store.flush();
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
    store.destroy();
    store.ingest(eventEnv(2), Date.now());
    store.flush();
    expect(b).toHaveBeenCalledTimes(1);
  });

  it("keeps the same object for a slice whose content did not change", () => {
    live(eventEnv(1));
    const before = state();
    live(posEnv(2, 2000, 5)); // frames only: the events view, the controls and the notice are untouched
    const after = state();
    expect(after.timeline).toBe(before.timeline);
    expect(after.controls).toBe(before.controls);
    expect(after.notice).toBe(before.notice);
    expect(after.players).toBe(before.players);
    expect(after.latestFrame).not.toBe(before.latestFrame);
    expect(after.counters).not.toBe(before.counters);
  });
});

describe("scoreboard", () => {
  it("takes the phase, period and score from the newest status", () => {
    live(statusEnv(1, "live", { home: 0, away: 0 }), statusEnv(2, "live", { home: 1, away: 0 }));
    expect(state().scoreboard).toMatchObject({ phase: "live", period: 1, score: { home: 1, away: 0 } });
  });

  it("only moves the clock forward", () => {
    live(eventEnv(1, {}, 5000), eventEnv(2, {}, 3000));
    expect(state().scoreboard).toMatchObject({ matchMs: 5000, clock: "0:05" });
    live(eventEnv(3, {}, 7000));
    expect(state().scoreboard).toMatchObject({ matchMs: 7000, clock: "0:07" });
  });

  it("learns the players from the first status envelope", () => {
    live(statusEnv(1, "pre_match", { home: 0, away: 0 }, { setup: makeSetup(), period: 0 }));
    expect(state().scoreboard.setup?.teams.home.name).toBe("Northbridge FC");
    expect(state().players.size).toBe(26);
    expect(state().players.get("NBR-11")).toMatchObject({ name: "Nora 11", side: "home", team_id: "NBR", shirt: 11 });
    expect(state().players.get("HBA-13")).toMatchObject({ side: "away" });
  });

  it("accepts the same setup twice (snapshot, then first status) without republishing the players", () => {
    store.setSetup(makeSetup());
    store.flush();
    const players = state().players;
    live(statusEnv(1, "pre_match", { home: 0, away: 0 }, { setup: makeSetup(), period: 0 }));
    expect(state().players).toBe(players);
  });

  it("describes rows again with names if the setup arrives after the events", () => {
    live(eventEnv(1));
    store.select("1");
    expect(state().timeline.rows[0].detail).toBe("NBR-09 → NBR-11 · success");
    store.setSetup(makeSetup());
    store.flush();
    expect(state().timeline.rows[0].detail).toBe("Nora 9 → Nora 11 · success");
    expect(state().inspector.row?.detail).toBe("Nora 9 → Nora 11 · success");
  });
});

describe("pause", () => {
  it("freezes the display but not the scoreboard or connection", () => {
    store.setConnection("live");
    live(eventEnv(1), eventEnv(2), posEnv(3, 3000, 5));
    const frozen = state();
    expect(keys()).toEqual(["2", "1"]);

    store.setPaused(true);
    live(eventEnv(4), statusEnv(5, "live", { home: 1, away: 0 }), posEnv(6, 6000, 5));

    // display: frozen
    expect(keys()).toEqual(["2", "1"]);
    expect(state().counters).toBe(frozen.counters);
    expect(state().latestFrame).toBe(frozen.latestFrame);
    expect(state().inspector.row?.key).toBe("2");
    // live slices: moving
    expect(state().scoreboard.score).toEqual({ home: 1, away: 0 });
    expect(state().scoreboard.clock).toBe("0:06");
    expect(state().controls.paused).toBe(true);
  });

  it("keeps receiving while paused and catches up on resume", () => {
    live(eventEnv(1));
    store.setPaused(true);
    live(eventEnv(2), eventEnv(3), posEnv(4, 4000, 5));
    expect(state().counters.messages).toBe(1);
    store.setPaused(false);
    expect(keys()).toEqual(["3", "2", "1"]);
    expect(state().counters).toMatchObject({ messages: 4, events: 3, frames: 5 });
    expect(state().latestFrame?.match_ms).toBe(4800);
    expect(state().inspector.row?.key).toBe("3");
  });

  it("shows the pause notice, holds it against other notices, and then the resume notice", () => {
    store.setPaused(true);
    expect(state().notice).toEqual({ text: notices.paused, tone: "warning" });
    store.setNotice("something else");
    store.flush();
    expect(state().notice.text).toBe(notices.paused);
    store.setPaused(false);
    expect(state().notice).toEqual({ text: notices.resumed, tone: "info" });
  });

  it("publishes everything received before the pause first", () => {
    store.ingest(eventEnv(1), Date.now()); // not flushed yet
    store.setPaused(true);
    expect(keys()).toEqual(["1"]);
  });

  it("keeps newer rows hidden when the filter changes while paused", () => {
    live(eventEnv(1), posEnv(2, 2000, 1));
    store.setPaused(true);
    live(eventEnv(3), posEnv(4, 4000, 1));
    store.setFilter("all");
    expect(keys()).toEqual(["2:0", "1"]);
    store.setFilter("tracking");
    expect(keys()).toEqual(["2:0"]);
    store.setPaused(false);
    expect(keys()).toEqual(["4:0", "2:0"]);
  });

  it("is a no-op when already in that state", () => {
    const listener = vi.fn();
    store.subscribe(listener);
    store.setPaused(false);
    expect(listener).not.toHaveBeenCalled();
  });
});

describe("inspector", () => {
  beforeEach(() => {
    store.setSetup(makeSetup());
    live(eventEnv(1), eventEnv(2), posEnv(3, 3000, 1), statusEnv(4, "live"));
  });

  it("follows the newest event by default", () => {
    expect(state().inspector).toMatchObject({ following: true, row: { key: "2" } });
  });

  it("keeps showing a selected row while newer ones arrive", () => {
    store.select("1");
    live(eventEnv(5));
    expect(state().inspector).toMatchObject({ following: false, row: { key: "1" } });
  });

  it("goes back to the newest event on followLatest", () => {
    store.select("1");
    live(eventEnv(5));
    store.followLatest();
    expect(state().inspector).toMatchObject({ following: true, row: { key: "5" } });
  });

  it("can select a tracking row and shows the frame inside it", () => {
    store.select("3:0");
    const raw = state().inspector.row?.raw as { kind: string; frame: { match_id: string } };
    expect(raw.kind).toBe("tracking");
    expect(raw.frame.match_id).toBe(MATCH);
  });

  it("keeps the selected row even after it has scrolled out of the buffer", () => {
    store.select("1");
    for (let i = 10; i < 10 + ROW_LIMIT + 10; i++) store.ingest(eventEnv(i), Date.now());
    store.flush();
    expect(state().inspector.row?.key).toBe("1");
  });

  it("ignores a key that does not exist", () => {
    store.select("nope");
    expect(state().inspector.following).toBe(true);
  });

  it("shows the raw envelope for an event", () => {
    expect((state().inspector.row?.raw as { kind: string }).kind).toBe("event");
  });
});

describe("connection, stale and notices", () => {
  it("records the connection status", () => {
    store.setConnection("live");
    store.flush();
    expect(state().connection.status).toBe("live");
  });

  it("goes stale after STALE_AFTER_MS without a message, and says so", () => {
    store.setConnection("live");
    live(eventEnv(1));
    vi.advanceTimersByTime(STALE_AFTER_MS - 1000);
    store.tick();
    store.flush();
    expect(state().connection.status).toBe("live");

    vi.advanceTimersByTime(2000);
    store.tick();
    store.flush();
    expect(state().connection.status).toBe("stale");
    expect(state().notice.tone).toBe("warning");
    expect(state().notice.text).toMatch(/^No messages for 11 seconds\./);
  });

  it("returns to live when a message arrives", () => {
    store.setConnection("live");
    live(eventEnv(1));
    vi.advanceTimersByTime(STALE_AFTER_MS + 1000);
    store.tick();
    store.flush();
    live(eventEnv(2));
    expect(state().connection.status).toBe("live");
    expect(state().notice).toEqual({ text: notices.connected, tone: "info" });
  });

  it("does not go stale before any message, or when not live", () => {
    store.setConnection("live");
    vi.advanceTimersByTime(STALE_AFTER_MS * 3);
    store.tick();
    store.flush();
    expect(state().connection.status).toBe("live");

    live(eventEnv(1));
    store.setConnection("reconnecting");
    vi.advanceTimersByTime(STALE_AFTER_MS * 3);
    store.tick();
    store.flush();
    expect(state().connection.status).toBe("reconnecting");
  });

  it("counts the messages of the last 10 seconds, and lets them expire", () => {
    live(eventEnv(1));
    vi.advanceTimersByTime(4000);
    live(eventEnv(2), eventEnv(3));
    expect(state().counters.recent).toBe(3);
    vi.advanceTimersByTime(RECENT_WINDOW_MS - 3000); // the first message is now 11 s old
    store.tick();
    store.flush();
    expect(state().counters.recent).toBe(2);
    vi.advanceTimersByTime(RECENT_WINDOW_MS);
    store.tick();
    store.flush();
    expect(state().counters.recent).toBe(0);
  });

  it("sets a notice", () => {
    store.setNotice(notices.historyUnavailable, "warning");
    store.flush();
    expect(state().notice).toEqual({ text: notices.historyUnavailable, tone: "warning" });
  });
});

describe("validation of raw messages", () => {
  it("applies a valid raw envelope", () => {
    expect(store.ingestRaw(envelope("event", makeEvent()), Date.now())).toBe("applied");
    store.flush();
    expect(keys()).toEqual(["7"]);
  });

  it("counts a bad one, logs it, and carries on", () => {
    expect(store.ingestRaw(envelope("event", { nope: 1 }), Date.now())).toBe("rejected");
    expect(store.ingestRaw(null, Date.now())).toBe("rejected");
    store.flush();
    expect(state().connection.rejected).toBe(2);
    expect(rejections).toHaveLength(2);
    expect(rejections[0]).toMatch(/^Rejected event seq 7/);
    expect(keys()).toEqual([]);
  });

  it("logs only the first few rejections, but counts them all", () => {
    for (let i = 0; i < 12; i++) store.ingestRaw({ junk: i }, Date.now());
    store.flush();
    expect(state().connection.rejected).toBe(12);
    expect(rejections).toHaveLength(5);
  });

  it("adds rejections reported by the snapshot loader to the same count", () => {
    store.ingestRaw({ junk: 1 }, Date.now());
    store.addRejected(3);
    store.addRejected(0);
    store.addRejected(-2);
    store.flush();
    expect(state().connection.rejected).toBe(4);
  });

  it("does not count a rejected message as received", () => {
    store.ingestRaw({ junk: 1 }, Date.now());
    store.flush();
    expect(state().counters.messages).toBe(0);
  });
});

describe("reset", () => {
  it("starts a new session: forgets rows, counters, setup and applied seqs", () => {
    store.setSetup(makeSetup());
    live(eventEnv(1), posEnv(2, 2000, 5), statusEnv(3, "live", { home: 1, away: 0 }));
    store.ingestRaw({ junk: 1 }, Date.now());
    store.select("1");
    store.reset();

    const s = state();
    expect(s.timeline.rows).toEqual([]);
    expect(s.counters).toEqual({ messages: 0, events: 0, frames: 0, lastAt: null, recent: 0 });
    expect(s.scoreboard).toMatchObject({ setup: null, phase: null, score: null, matchMs: -1 });
    expect(s.latestFrame).toBeNull();
    expect(s.players.size).toBe(0);
    expect(s.inspector).toEqual({ row: null, following: true });
    expect(s.connection.rejected).toBe(0);
  });

  it("lets the same seq in again (a restarted server counts from 1)", () => {
    live(eventEnv(1));
    store.reset();
    expect(store.ingest(eventEnv(1), Date.now())).toBe("applied");
  });

  it("keeps the filter and the pause state", () => {
    store.setFilter("tracking");
    store.setPaused(true);
    store.reset();
    expect(state().controls).toEqual({ filter: "tracking", paused: true });
  });

  it("stays frozen when paused: new rows stay hidden until resume", () => {
    store.setPaused(true);
    store.reset();
    live(eventEnv(1));
    expect(keys()).toEqual([]);
    store.setPaused(false);
    expect(keys()).toEqual(["1"]);
  });
});
