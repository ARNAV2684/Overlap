import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { announcementKey, createAnnouncer } from "@/lib/announcer";

describe("announcementKey", () => {
  it("ignores numbers only", () => {
    expect(announcementKey("No messages for 11 seconds.")).toBe(announcementKey("No messages for 12 seconds."));
    expect(announcementKey("No messages for 9 seconds.")).toBe(announcementKey("No messages for 120 seconds."));
    expect(announcementKey("Connection lost.")).not.toBe(announcementKey("Connected."));
  });
});

describe("createAnnouncer", () => {
  let said: string[];
  const make = (minGapMs = 3000) => createAnnouncer((text) => said.push(text), { minGapMs });

  beforeEach(() => {
    said = [];
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("announces the first text at once", () => {
    make().push("Connecting to the match stream…");
    expect(said).toEqual(["Connecting to the match stream…"]);
  });

  it("ignores empty text", () => {
    make().push("");
    expect(said).toEqual([]);
  });

  it("does not repeat the same text", () => {
    const a = make();
    a.push("Connected.");
    vi.advanceTimersByTime(10_000);
    a.push("Connected.");
    expect(said).toEqual(["Connected."]);
  });

  it("does not announce a change in numbers only (the stale countdown)", () => {
    const a = make();
    for (let s = 10; s <= 30; s++) {
      a.push(`No messages for ${s} seconds.`);
      vi.advanceTimersByTime(1000);
    }
    expect(said).toEqual(["No messages for 10 seconds."]);
  });

  it("waits out the gap, then says only the newest of a burst", () => {
    const a = make();
    a.push("Connecting…");
    vi.advanceTimersByTime(500);
    a.push("Loading history…");
    a.push("Connected.");
    expect(said).toEqual(["Connecting…"]);
    vi.advanceTimersByTime(2499);
    expect(said).toEqual(["Connecting…"]);
    vi.advanceTimersByTime(1);
    expect(said).toEqual(["Connecting…", "Connected."]);
  });

  it("announces at once when the gap has already passed", () => {
    const a = make();
    a.push("Connected.");
    vi.advanceTimersByTime(3000);
    a.push("Connection lost.");
    expect(said).toEqual(["Connected.", "Connection lost."]);
  });

  it("drops a trailing announcement that returns to what was last said", () => {
    const a = make();
    a.push("Connected.");
    a.push("Feed paused.");
    a.push("Connected.");
    vi.advanceTimersByTime(5000);
    expect(said).toEqual(["Connected."]);
  });

  it("keeps the newest numbers in a trailing announcement", () => {
    const a = make();
    a.push("Connected.");
    a.push("No messages for 10 seconds.");
    vi.advanceTimersByTime(1000);
    a.push("No messages for 11 seconds.");
    vi.advanceTimersByTime(2000);
    expect(said).toEqual(["Connected.", "No messages for 11 seconds."]);
  });

  it("cancel() drops what is waiting and stays usable (StrictMode re-runs effects)", () => {
    const a = make();
    a.push("Connected.");
    a.push("Connection lost.");
    a.cancel();
    vi.advanceTimersByTime(10_000);
    expect(said).toEqual(["Connected."]);
    a.push("Connection lost.");
    expect(said).toEqual(["Connected.", "Connection lost."]);
  });
});
