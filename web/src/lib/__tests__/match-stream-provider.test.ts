import { createElement, type ComponentType, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MatchStreamProvider } from "@/providers/MatchStreamProvider";
import { useConnection, useMatchStore, useScoreboard } from "@/lib/store-hooks";

// Same component, typed so that children can be passed the way createElement wants them
const Provider = MatchStreamProvider as ComponentType<{ matchId: string; children?: ReactNode }>;

function Probe() {
  const store = useMatchStore();
  const connection = useConnection();
  const scoreboard = useScoreboard();
  return createElement("p", null, `match=${store.matchId} board=${scoreboard.matchId} status=${connection.status}`);
}

describe("MatchStreamProvider (server render)", () => {
  it("gives the children a store for the match, in its starting state", () => {
    const html = renderToString(createElement(Provider, { matchId: "SYN-0042" }, createElement(Probe)));
    expect(html).toContain("match=SYN-0042");
    expect(html).toContain("board=SYN-0042");
    expect(html).toContain("status=connecting");
  });

  it("gives a different match its own store", () => {
    const html = renderToString(createElement(Provider, { matchId: "SYN-0099" }, createElement(Probe)));
    expect(html).toContain("match=SYN-0099");
    expect(html).not.toContain("SYN-0042");
  });

  it("does not open a connection while rendering on the server", () => {
    const opened: string[] = [];
    const Original = globalThis.WebSocket;
    globalThis.WebSocket = class {
      constructor(url: string) {
        opened.push(url);
      }
    } as never;
    try {
      renderToString(createElement(Provider, { matchId: "SYN-0042" }, createElement(Probe)));
    } finally {
      globalThis.WebSocket = Original;
    }
    expect(opened).toEqual([]); // effects never run on the server
  });

  it("renders its children and nothing else", () => {
    const html = renderToString(
      createElement(Provider, { matchId: "SYN-0042" }, createElement("span", null, "inside")),
    );
    expect(html).toBe("<span>inside</span>");
  });
});
