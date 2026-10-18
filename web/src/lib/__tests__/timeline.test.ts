import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TimelineRowsDemo } from "@/app/dev/ui/TimelineRowsDemo";
import { EventTimelinePanelView, teamsFrom } from "@/components/timeline/EventTimelinePanel";
import { TimelineRow, rowLabel } from "@/components/timeline/TimelineRow";
import type { MatchEvent, ParsedEnvelope } from "@/lib/contracts";
import { createMatchStore, type Filter, type TimelineRow as Row } from "@/lib/store";
import { MATCH, eventEnv, makeSetup, posEnv, statusEnv } from "./fixtures";

// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");
const teams = teamsFrom(makeSetup());

/** Rows as the store builds them, newest first. `received` null makes a history (snapshot) row. */
function rowsFrom(envelopes: [ParsedEnvelope, number | null][], filter: Filter = "events"): readonly Row[] {
  const store = createMatchStore(MATCH, { onReject: () => {} });
  store.setSetup(makeSetup());
  for (const [envelope, received] of envelopes) store.ingest(envelope, received);
  store.setFilter(filter);
  store.flush();
  const rows = store.getState().timeline.rows;
  store.destroy();
  return rows;
}

const oneEvent = (over: Partial<MatchEvent>, received: number | null = 1_000) => rowsFrom([[eventEnv(5, over), received]])[0];

function renderRow(row: Row, selected = false) {
  const team = row.teamId ? teams.get(row.teamId) : undefined;
  return visible(renderToString(createElement(TimelineRow, { row, team, selected, tabbable: false })));
}

describe("teamsFrom", () => {
  it("maps each club's id to its name and side", () => {
    expect(teams.get("NBR")).toEqual({ id: "NBR", name: "Northbridge FC", side: "home" });
    expect(teams.get("HBA")).toEqual({ id: "HBA", name: "Harbour Athletic", side: "away" });
    expect(teamsFrom(null).size).toBe(0);
  });
});

describe("rowLabel", () => {
  it("reads an event as title, club, description and clock", () => {
    const row = oneEvent({ type: "Shot", outcome: undefined, receiver_id: undefined, shot_outcome: "saved" });
    expect(rowLabel(row, teams.get("NBR"))).toBe("Shot, Northbridge FC, Nora 9, saved, at 62:14");
  });

  it("says when a row is history", () => {
    const row = oneEvent({ type: "Tackle", receiver_id: undefined }, null);
    expect(rowLabel(row, teams.get("NBR"))).toMatch(/, history$/);
  });

  it("reads a status row with its phase and score, and a frame with its player count", () => {
    const [status] = rowsFrom([[statusEnv(3, "half_time", { home: 1, away: 0 }), 1]]);
    expect(rowLabel(status)).toBe("Match state, Half time, 1–0, at 0:03");
    const [frame] = rowsFrom([[posEnv(4, 4000, 1), 1]], "tracking");
    expect(rowLabel(frame)).toMatch(/^Position frame, 1 players, ball \(24\.4, 89\.6\), at /);
  });
});

describe("TimelineRow variants", () => {
  it("an event row shows its time, envelope, team tag, description and live arrival", () => {
    const html = renderRow(oneEvent({}));
    for (const text of ["P2 · envelope #5", "Pass", "NBR", "Nora 9 → Nora 11", "Success", "Live WebSocket"]) {
      expect(html).toContain(text);
    }
    // The outcome is shown once, as a badge, not again at the end of the description
    expect(html).not.toContain("Nora 11 · success");
    expect(html).toContain('role="option"');
  });

  it("a goal gets the Goal badge and the primary left bar", () => {
    const html = renderRow(oneEvent({ type: "Shot", outcome: undefined, receiver_id: undefined, shot_outcome: "goal" }));
    expect(html).toContain(">Goal<");
    expect(html).toContain("bg-primary");
    expect(html).not.toContain("Nora 9 · goal");
  });

  it("cards get their chip and row tint, including red and second yellow", () => {
    const card = (kind: "yellow" | "second_yellow" | "red") =>
      renderRow(oneEvent({ type: "Card", card: kind, outcome: undefined, receiver_id: undefined }));
    expect(card("yellow")).toContain("Yellow card");
    expect(card("yellow")).toContain("bg-card-yellow-soft");
    expect(card("red")).toContain("Red card");
    expect(card("red")).toContain("bg-card-red-soft");
    expect(card("second_yellow")).toContain("Second yellow");
    expect(card("second_yellow")).toContain(">Red<");
    // The chip says it, so the description does not repeat it
    expect(card("yellow")).not.toContain("Nora 9 · yellow card");
  });

  it("a substitution shows an off arrow and an on arrow, keeping the words", () => {
    const row = oneEvent({ type: "Substitution", player_on_id: "NBR-12", outcome: undefined, receiver_id: undefined });
    const html = renderRow(row);
    expect(html).toMatch(/↓<\/span>Nora 9 off/);
    expect(html).toMatch(/↑<\/span>Nora 12 on/);
    // The accessible name keeps the store's wording
    expect(rowLabel(row, teams.get("NBR"))).toBe("Substitution, Northbridge FC, Nora 9 off → Nora 12 on, at 62:14");
  });

  it("history rows are dimmed and labelled", () => {
    const html = renderRow(oneEvent({}, null));
    expect(html).toContain("opacity-65");
    expect(html).toContain("History");
    expect(html).toContain("Startup snapshot");
  });

  it("a selected row is marked for assistive tech and gets the secondary bar", () => {
    const html = renderRow(oneEvent({}), true);
    expect(html).toContain('aria-selected="true"');
    expect(html).toContain("bg-secondary-soft");
  });

  it("status and tracking rows render their own variant", () => {
    const [status] = rowsFrom([[statusEnv(3, "live", { home: 2, away: 1 }), 1]]);
    expect(renderRow(status)).toContain("Live · 2–1");
    const [frame] = rowsFrom([[posEnv(4, 4000, 1), 1]], "tracking");
    const html = renderRow(frame);
    expect(html).toContain("Position frame");
    expect(html).toContain("Live · bundled frame");
  });
});

describe("EventTimelinePanelView", () => {
  const base = { filter: "events" as const, paused: false, live: true, selectedKey: null, setup: makeSetup() };

  it("empty: header, filters, count, column labels, the empty state and the footer", () => {
    const html = visible(renderToString(createElement(EventTimelinePanelView, { ...base, rows: [] })));
    for (const text of [
      "Event timeline",
      "Pause feed",
      "Match events",
      "Tracking",
      "All data",
      "0 shown",
      "Match elapsed",
      "Waiting for messages in this category…",
      "Latest 120 displayed",
    ]) {
      expect(html).toContain(text);
    }
    expect(html).not.toContain('role="listbox"');
  });

  it("with rows: a listbox with one tabbable row, the newest first", () => {
    const rows = rowsFrom([
      [eventEnv(5), 1],
      [eventEnv(6, { type: "Tackle", receiver_id: undefined }), 2],
    ]);
    const html = renderToString(createElement(EventTimelinePanelView, { ...base, rows }));
    expect(html).toContain('role="listbox"');
    expect(visible(html)).toContain("2 shown");
    // Roving tabindex: exactly one option is in the Tab order, and it is the newest (first) row
    const options = html.match(/<div role="option"[^>]*>/g) ?? [];
    expect(options).toHaveLength(2);
    expect(options.map((tag) => tag.includes('tabindex="0"'))).toEqual([true, false]);
    expect(options[0]).toContain('aria-label="Tackle');
    expect(html).toContain("--team-home:#B3202A");
  });

  it("paused: the button offers to resume and is pressed; without actions the controls are disabled", () => {
    const paused = renderToString(createElement(EventTimelinePanelView, { ...base, rows: [], paused: true, onPause: () => {} }));
    expect(visible(paused)).toContain("Resume feed");
    expect(paused).toContain('aria-pressed="true"');
    const fallback = renderToString(createElement(EventTimelinePanelView, { ...base, rows: [] }));
    expect(fallback).toMatch(/<button[^>]*disabled=""[^>]*aria-pressed="false"|aria-pressed="false"[^>]*disabled=""/);
  });
});

describe("TimelineRowsDemo (/dev/ui)", () => {
  it("renders every variant, including the red and second-yellow rows SYN-9001 never produces", () => {
    const html = visible(renderToString(createElement(TimelineRowsDemo)));
    expect(html.match(/role="option"/g)).toHaveLength(14);
    for (const text of ["Goal", "Yellow card", "Second yellow", "Red card", "Mira Castell", "Half time · 1–0", "Position frame", "History"]) {
      expect(html).toContain(text);
    }
    expect(html).toContain("bg-card-red-soft");
    expect(html).toContain('aria-selected="true"');
  });
});
