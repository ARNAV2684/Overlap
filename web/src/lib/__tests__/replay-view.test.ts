import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppHeaderView } from "@/components/layout/AppHeader";
import { LiveMatchView } from "@/components/live/LiveMatchView";
import { MatchStreamProvider } from "@/components/live/MatchStreamProvider";
import { ReplayControlsView, replayClockAt } from "@/components/replay/ReplayControls";
import { replaySummary } from "@/components/replay/ReplayIntro";
import { ReplayFailureCard, ReplayFallback, ReplayMatchView, replayBadge } from "@/components/replay/ReplayMatchView";
import { ReplayProvider } from "@/components/replay/ReplayProvider";
import { ArrivalCell } from "@/components/timeline/cells/ArrivalCell";
import type { ReplayClient } from "@/lib/replay-client";
import { buildReplayIndex } from "@/lib/replay-envelopes";
import { DEFAULT_SPEED, replayNotices, type ReplayState } from "@/lib/replay-player";
import { StreamSourceContext } from "@/lib/stream-source";
import { STORED_EVENTS, STORED_MATCH } from "./replay-fixtures";

const built = buildReplayIndex(
  STORED_MATCH,
  STORED_EVENTS.filter((e) => e.type === "PeriodStart" || e.type === "PeriodEnd"),
  STORED_EVENTS.filter((e) => e.type === "Shot"),
  STORED_EVENTS.map((e) => e.seq as number),
);
if (!built.ok) throw new Error("fixture index failed");
const MANIFEST = built.index.manifest;

/** Never answers: the server render happens before any effect, so the client is never called anyway. */
const idle: ReplayClient = { manifest: () => new Promise(() => {}), chunk: () => new Promise(() => {}) };
const Provider = ReplayProvider as ComponentType<{ matchId: string; client: ReplayClient; children?: ReactNode }>;

const replay = () =>
  renderToString(createElement(Provider, { matchId: "SYN-0042", client: idle }, createElement(ReplayMatchView)));
// React adds comment markers between text parts on the server and escapes apostrophes; undo both to compare what a
// viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "").replaceAll("&#x27;", "'");
const text = (html: string) => visible(html).replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");

const state = (over: Partial<ReplayState> = {}): ReplayState => ({
  status: "playing",
  speed: DEFAULT_SPEED,
  playheadMs: 0,
  manifest: MANIFEST,
  buffering: false,
  chunkFailed: false,
  failure: null,
  ...over,
});

describe("ReplayMatchView: first render", () => {
  it("keeps the live screen's landmarks, with one h1, the replay header and the loading notice", () => {
    const html = replay();
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("<footer")).toBeGreaterThan(html.indexOf("</main>"));
    expect(html.match(/<h1/g)).toHaveLength(1);
    const shown = visible(html);
    for (const words of ["Replay", "Loading", "Replay a finished match.", "Match archive · stored by the archiver", replayNotices.loading]) {
      expect(shown).toContain(words);
    }
    expect(shown).not.toContain("Live stream");
    expect(shown).not.toContain("Mock WebSocket");
  });

  it("puts the replay controls between the notice line and the scoreboard, disabled until the manifest loads", () => {
    const html = replay();
    const toolbar = html.indexOf('role="toolbar"');
    expect(html).toContain('aria-label="Replay controls"');
    expect(toolbar).toBeGreaterThan(html.indexOf(replayNotices.loading));
    expect(toolbar).toBeLessThan(html.indexOf("Home team"));
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>.*?Play<\/button>/);
    expect(html).toContain('aria-label="Speed 20×"');
    expect(html).toMatch(/aria-pressed="true"[^>]*aria-label="Speed 20×"|aria-label="Speed 20×"[^>]*aria-pressed="true"/);
  });

  it("matches the Suspense fallback, so the prerendered shell doesn't jump", () => {
    expect(text(renderToString(createElement(ReplayFallback)))).toBe(text(replay()).replace("|SYN-0042|", "|"));
  });
});

describe("replay pieces", () => {
  it("labels the badge for every state", () => {
    expect(replayBadge(state({ status: "loading" }))).toEqual({ status: "connecting", label: "Loading" });
    expect(replayBadge(state({ speed: 5 }))).toEqual({ status: "live", label: "Replay · 5×" });
    expect(replayBadge(state({ status: "paused" }))).toEqual({ status: "finished", label: "Paused" });
    expect(replayBadge(state({ status: "finished" }))).toEqual({ status: "finished", label: "Replay finished" });
    expect(replayBadge(state({ status: "failed", failure: "not_found" }))).toEqual({ status: "stale", label: "Unavailable" });
  });

  it("names Play / Pause by what it will do, shows progress as clocks, and offers Retry after a failed chunk", () => {
    const playing = renderToString(createElement(ReplayControlsView, { state: state({ playheadMs: 70_000 }) }));
    expect(visible(playing)).toContain("Pause");
    expect(visible(playing)).toContain("1:10 / 46:01");
    expect(playing).toContain('aria-valuenow="37.6"');
    expect(visible(playing)).not.toContain("Retry");

    const done = renderToString(createElement(ReplayControlsView, { state: state({ status: "finished" }) }));
    expect(visible(done)).toContain("Replay again");
    const failed = renderToString(createElement(ReplayControlsView, { state: state({ status: "paused", chunkFailed: true }) }));
    expect(visible(failed)).toContain("Retry");
    expect(visible(failed)).toContain("Play");
  });

  it("reads the clock of a match time in either half, stoppage time included", () => {
    expect(replayClockAt(null, 5000)).toBe("0:00");
    expect(replayClockAt(MANIFEST, 70_000)).toBe("1:10");
    expect(replayClockAt(MANIFEST, 125_000 + 20_000)).toBe("45:20");
  });

  it("sums the match up once the manifest has loaded", () => {
    expect(replaySummary(null)).toBe("Loading the match from the archive…");
    expect(replaySummary(MANIFEST)).toBe("Northbridge FC 1–1 Harbour Athletic · final score");
  });

  it("explains each failure in words, with the way forward", () => {
    const card = (failure: Parameters<typeof ReplayFailureCard>[0]["failure"]) =>
      renderToString(createElement(ReplayFailureCard, { failure, matchId: "SYN-0042" }));
    expect(visible(card("not_found"))).toContain("No archived match SYN-0042.");
    expect(card("not_found")).toContain('href="/"');
    expect(visible(card("not_finished"))).toContain("SYN-0042 is still being played.");
    expect(card("not_finished")).toContain('href="/match/SYN-0042"');
    expect(visible(card("not_ready"))).toContain("SYN-0042 has no setup in the archive yet.");
    expect(visible(card("not_ready"))).not.toContain("Retry");
    expect(visible(card("unreachable"))).toContain("The match archive can't be reached.");
    expect(visible(card("unreachable"))).toContain("Retry");
  });
});

describe("live screen unchanged", () => {
  it("rows still say Live WebSocket by default, and Replay · archive under the replay source", () => {
    const cell = (tracking: boolean, source?: "replay") => {
      const element = createElement(ArrivalCell, { received: 1_700_000_000_000, tracking });
      return visible(renderToString(source ? createElement(StreamSourceContext.Provider, { value: source }, element) : element));
    };
    expect(cell(false)).toContain("Live WebSocket");
    expect(cell(true)).toContain("Live · bundled frame");
    expect(cell(false, "replay")).toContain("Replay · archive");
    expect(cell(true, "replay")).toContain("Replay · bundled frame");
  });

  it("keeps the header's Live stream text and the live intro", () => {
    expect(visible(renderToString(createElement(AppHeaderView, { status: "live" })))).toContain("Live stream");
    const LiveProvider = MatchStreamProvider as ComponentType<{ matchId: string; children?: ReactNode }>;
    const live = visible(renderToString(createElement(LiveProvider, { matchId: "SYN-9001" }, createElement(LiveMatchView))));
    expect(live).toContain("Live stream");
    expect(live).toContain("Watch the data move.");
    expect(live).not.toContain("Replay");
  });
});
