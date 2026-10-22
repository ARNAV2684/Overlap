import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { LiveMatchFallback, LiveMatchView } from "@/components/live/LiveMatchView";
import { MatchStreamProvider } from "@/components/live/MatchStreamProvider";
import { isMatchId } from "@/lib/contracts";
import { notices } from "@/lib/store";

const Provider = MatchStreamProvider as ComponentType<{ matchId: string; children?: ReactNode }>;

const live = () => renderToString(createElement(Provider, { matchId: "SYN-9001" }, createElement(LiveMatchView)));
const fallback = () => renderToString(createElement(LiveMatchFallback));
// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");

describe("LiveMatchView", () => {
  it("has the landmarks in order: header, main, footer, with main holding the one h1", () => {
    const html = live();
    const header = html.indexOf("<header");
    const main = html.indexOf("<main");
    const footer = html.indexOf("<footer");
    expect(header).toBeGreaterThanOrEqual(0);
    expect(main).toBeGreaterThan(header);
    expect(footer).toBeGreaterThan(html.indexOf("</main>"));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html.indexOf("<h1")).toBeGreaterThan(main);
  });

  it("has a named complementary landmark for the pitch and inspector, inside main, and an h2 per panel", () => {
    const html = live();
    const aside = html.indexOf('<aside aria-label="Positions and message inspector"');
    expect(aside).toBeGreaterThan(html.indexOf("<main"));
    expect(aside).toBeLessThan(html.indexOf("</main>"));
    for (const title of ["Event timeline", "Live positions", "Message inspector"]) {
      expect(html).toMatch(new RegExp(`<h2[^>]*>${title}`));
    }
  });

  it("starts as Connecting with the connecting notice, read from the store", () => {
    const html = visible(live());
    expect(html).toContain("Connecting");
    expect(html).toContain(notices.connecting);
    expect(html).toContain("Live WebSocket");
  });

  it("throws outside a MatchStreamProvider", () => {
    expect(() => renderToString(createElement(LiveMatchView))).toThrow(/MatchStreamProvider/);
  });
});

describe("LiveMatchFallback", () => {
  it("renders the same visible frame as the live screen's first render", () => {
    expect(visible(fallback())).toContain(notices.connecting);
    // Same text in the same order, apart from the live screen's (empty) announcement regions and the match id, which
    // the fallback does not know yet (it shows a skeleton of the same size)
    const text = (html: string) => visible(html).replace(/<[^>]+>/g, "|").replace(/\|+/g, "|");
    expect(text(fallback())).toBe(text(live()).replace("|SYN-9001|", "|"));
  });

  it("does not announce its notice (the live NoticeBar does)", () => {
    expect(fallback()).not.toContain('aria-live="polite"');
    expect(live()).toContain('aria-live="polite"');
  });
});

describe("isMatchId", () => {
  it("accepts SYN-NNNN only", () => {
    expect(isMatchId("SYN-9001")).toBe(true);
    expect(isMatchId("SYN-0042")).toBe(true);
    for (const bad of ["syn-9001", "SYN-901", "SYN-90012", "NBR-9001", "", " SYN-9001", null, 9001]) {
      expect(isMatchId(bad)).toBe(false);
    }
  });
});
