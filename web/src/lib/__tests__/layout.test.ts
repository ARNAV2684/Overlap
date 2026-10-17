import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AppFooter } from "@/components/layout/AppFooter";
import { AppHeader, AppHeaderView } from "@/components/layout/AppHeader";
import { AppShell } from "@/components/layout/AppShell";
import { IntroHero } from "@/components/layout/IntroHero";
import { NoticeBar, NoticeBarView } from "@/components/layout/NoticeBar";
import { SourceCard, sourceHost } from "@/components/layout/SourceCard";
import { MatchStreamProvider } from "@/components/live/MatchStreamProvider";
import { env } from "@/lib/env";
import { notices } from "@/lib/store";

const Provider = MatchStreamProvider as ComponentType<{ matchId: string; children?: ReactNode }>;
const Shell = AppShell as ComponentType<{ children?: ReactNode }>;
const render = (element: Parameters<typeof renderToString>[0]) => renderToString(element);

describe("AppShell", () => {
  it("is a plain div so header and footer stay page landmarks", () => {
    const html = render(createElement(Shell, null, createElement("p", null, "inside")));
    expect(html).toMatch(/^<div class="[^"]*max-w-\[1510px\]/);
    expect(html).toContain("<p>inside</p>");
  });
});

describe("AppHeader", () => {
  it("renders a header with the logo, the subtitle and the badge", () => {
    const html = render(createElement(AppHeaderView, { status: "live" }));
    expect(html).toMatch(/^<header/);
    expect(html).toContain("OVERLAP");
    expect(html).toContain("Live stream");
    expect(html).toContain('role="status"');
    expect(html).toContain(">Live<");
  });

  it("uses a custom badge label", () => {
    const html = render(createElement(AppHeaderView, { status: "stale", statusLabel: "Connected · no recent data" }));
    expect(html).toContain("Connected · no recent data");
  });

  it("reads the connection from the store (starts as Connecting)", () => {
    const html = render(createElement(Provider, { matchId: "SYN-0042" }, createElement(AppHeader)));
    expect(html).toContain("Connecting");
  });
});

describe("IntroHero", () => {
  it("renders the page's h1 with the default copy and the aside", () => {
    const html = render(createElement(IntroHero, { aside: createElement("p", null, "aside here") }));
    expect(html.match(/<h1/g)).toHaveLength(1);
    expect(html).toContain("Watch the data move.");
    expect(html).toContain("Local match observatory");
    expect(html).toContain("aside here");
  });

  it("leaves out the aside wrapper when there is no aside", () => {
    const html = render(createElement(IntroHero, { title: "Other" }));
    expect(html).toContain("Other");
    expect(html).not.toContain("max-w-[300px]");
  });
});

describe("SourceCard", () => {
  it("shows host and port only", () => {
    expect(sourceHost("http://localhost:8787")).toBe("localhost:8787");
    expect(sourceHost("https://example.webpubsub.azure.com/")).toBe("example.webpubsub.azure.com");
    expect(sourceHost("not a url")).toBe("not a url");
  });

  it("defaults to the configured stream server", () => {
    const html = render(createElement(SourceCard));
    expect(html).toContain("Mock WebSocket");
    expect(html).toContain(sourceHost(env.streamBaseUrl));
  });
});

describe("NoticeBar", () => {
  it("shows the text; the live region starts empty (announcements happen in the browser, throttled)", () => {
    const html = render(createElement(NoticeBarView, { notice: { text: "Connected.", tone: "info" } }));
    expect(html).toContain("Connected.");
    expect(html).toContain("text-ink-muted");
    expect(html).toMatch(/<span[^>]*role="status"[^>]*aria-live="polite"[^>]*><\/span>/);
  });

  it("marks a warning with accent text and an icon, not colour alone", () => {
    const html = render(createElement(NoticeBarView, { notice: { text: notices.paused, tone: "warning" } }));
    expect(html).toContain("text-accent-text");
    expect(html).toContain("<svg");
  });

  it("reads the notice from the store", () => {
    const html = render(createElement(Provider, { matchId: "SYN-0042" }, createElement(NoticeBar)));
    expect(html).toContain(notices.connecting);
  });
});

describe("AppFooter", () => {
  it("renders a footer that says the data is synthetic", () => {
    const html = render(createElement(AppFooter));
    expect(html).toMatch(/^<footer/);
    expect(html).toContain("Synthetic data");
  });
});
