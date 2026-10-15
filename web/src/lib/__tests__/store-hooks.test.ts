import { createElement, type ReactNode } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MatchStoreContext,
  useConnection,
  useControls,
  useCounters,
  useLatestFrame,
  useMatchStore,
  useNotice,
  usePlayers,
  useScoreboard,
  useSelectedRow,
  useTimelineRows,
} from "@/lib/store-hooks";
import { createMatchStore } from "@/lib/store";
import { makeEvent, makeFrame, makeSetup } from "./fixtures";

/** Reads every hook and prints the values as plain text. */
function Probe() {
  const connection = useConnection();
  const scoreboard = useScoreboard();
  const counters = useCounters();
  const timeline = useTimelineRows();
  const frame = useLatestFrame();
  const inspector = useSelectedRow();
  const notice = useNotice();
  const controls = useControls();
  const players = usePlayers();
  return createElement(
    "p",
    null,
    [
      `status=${connection.status}`,
      `phase=${scoreboard.phase}`,
      `home=${scoreboard.setup?.teams.home.name}`,
      `messages=${counters.messages}`,
      `rows=${timeline.rows.length}`,
      `frame=${frame ? frame.match_ms : "none"}`,
      `inspect=${inspector.row?.key ?? "none"}`,
      `notice=${notice.text}`,
      `filter=${controls.filter}`,
      `players=${players.size}`,
    ].join(" | "),
  );
}

const withStore = (store: ReturnType<typeof createMatchStore>, child: ReactNode) =>
  createElement(MatchStoreContext.Provider, { value: store }, child);

describe("store hooks", () => {
  it("render the empty state on a fresh store", () => {
    const store = createMatchStore("SYN-0042");
    const html = renderToString(withStore(store, createElement(Probe)));
    expect(html).toContain("status=connecting");
    expect(html).toContain("phase=null");
    expect(html).toContain("messages=0");
    expect(html).toContain("rows=0");
    expect(html).toContain("frame=none");
    expect(html).toContain("inspect=none");
    expect(html).toContain("filter=events");
    expect(html).toContain("players=0");
    store.destroy();
  });

  it("render what the store holds", () => {
    const store = createMatchStore("SYN-0042");
    store.setSetup(makeSetup());
    store.setConnection("live");
    store.ingest({ seq: 1, kind: "status", match_id: "SYN-0042", match_ms: 0, clock: "0:00", data: { phase: "live", period: 1, score: { home: 0, away: 0 } } }, 1000);
    store.ingest({ seq: 2, kind: "event", match_id: "SYN-0042", match_ms: 1000, clock: "0:01", data: makeEvent() }, 1001);
    store.ingest({ seq: 3, kind: "positions", match_id: "SYN-0042", match_ms: 2000, clock: "0:02", data: { frames: [makeFrame({ match_ms: 2000 })] } }, 1002);
    store.flush();
    const html = renderToString(withStore(store, createElement(Probe)));
    expect(html).toContain("status=live");
    expect(html).toContain("phase=live");
    expect(html).toContain("home=Northbridge FC");
    expect(html).toContain("messages=3");
    expect(html).toContain("rows=2"); // the state row and the event; frames are on another filter
    expect(html).toContain("frame=2000");
    expect(html).toContain("inspect=2");
    expect(html).toContain("players=26");
    store.destroy();
  });

  it("give two components the same slice object, so neither re-renders needlessly", () => {
    const store = createMatchStore("SYN-0042");
    store.flush();
    expect(store.getState().timeline).toBe(store.getState().timeline);
    expect(store.getState().scoreboard).toBe(store.getState().scoreboard);
  });

  it("throw a clear error outside a provider", () => {
    expect(() => renderToString(createElement(Probe))).toThrow(/MatchStreamProvider/);
  });

  it("let a component reach the store's actions", () => {
    const store = createMatchStore("SYN-0042");
    const Grab = () => {
      const fromContext = useMatchStore();
      return createElement("p", null, fromContext === store ? "same store" : "different store");
    };
    expect(renderToString(withStore(store, createElement(Grab)))).toContain("same store");
    store.destroy();
  });
});
