import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { tokenizeJson } from "@/components/inspector/JsonViewer";
import { MessageInspectorPanelView, inspectorLabel } from "@/components/inspector/MessageInspectorPanel";
import { formatWallTime } from "@/lib/format";
import { createMatchStore, type TimelineRow } from "@/lib/store";
import { MATCH, eventEnv, makeSetup } from "./fixtures";

// React adds comment markers between text parts on the server; drop them to compare what a viewer sees
const visible = (html: string) => html.replace(/<!--.*?-->/g, "");
// Text without tags, with the HTML entities React escapes turned back
const text = (html: string) => visible(html).replace(/<[^>]+>/g, "").replaceAll("&quot;", '"').replaceAll("&amp;", "&");

const RECEIVED = Date.UTC(2026, 9, 24, 19, 4, 11, 532);

function rowFor(received: number | null): TimelineRow {
  const store = createMatchStore(MATCH, { onReject: () => {} });
  store.setSetup(makeSetup());
  store.ingest(eventEnv(5, { type: "Shot", outcome: undefined, receiver_id: undefined, shot_outcome: "saved" }, 3_734_000), received);
  store.flush();
  const row = store.getState().inspector.row;
  store.destroy();
  if (!row) throw new Error("expected a row");
  return row;
}

describe("tokenizeJson", () => {
  const json = JSON.stringify({ kind: "event", seq: 812, data: { x: -1.5e3, ok: true, none: null, s: 'a "q" \\ b' } }, null, 2);

  it("gives the input back unchanged when the tokens are joined", () => {
    expect(tokenizeJson(json).map((t) => t.text).join("")).toBe(json);
  });

  it("tells keys from string values, and finds numbers and literals", () => {
    const tokens = tokenizeJson(json);
    const of = (kind: string) => tokens.filter((t) => t.kind === kind).map((t) => t.text);
    expect(of("key")).toEqual(['"kind"', '"seq"', '"data"', '"x"', '"ok"', '"none"', '"s"']);
    expect(of("string")).toEqual(['"event"', '"a \\"q\\" \\\\ b"']);
    expect(of("number")).toEqual(["812", "-1500"]);
    expect(of("literal")).toEqual(["true", "null"]);
  });
});

describe("inspectorLabel", () => {
  it("names the row, its play time and when it arrived, or history", () => {
    expect(inspectorLabel(rowFor(RECEIVED))).toBe(`Shot · elapsed 62:14.000 · ${formatWallTime(RECEIVED)}`);
    expect(inspectorLabel(rowFor(null))).toBe("Shot · elapsed 62:14.000 · history");
    expect(inspectorLabel(null)).toBe("Select any timeline row");
  });
});

describe("MessageInspectorPanelView", () => {
  it("before anything arrives: the placeholder, both buttons disabled, no rejection footer", () => {
    const html = renderToString(createElement(MessageInspectorPanelView, { row: null, following: true, rejected: 0 }));
    expect(text(html)).toContain("Message inspector");
    expect(text(html)).toContain("Incoming event data will appear here.");
    expect(html.match(/<button[^>]*disabled=""/g)).toHaveLength(2);
    expect(text(html)).not.toContain("rejected");
  });

  it("shows the row's exact payload, coloured", () => {
    const row = rowFor(RECEIVED);
    const html = renderToString(createElement(MessageInspectorPanelView, { row, following: true, rejected: 0 }));
    expect(text(html)).toContain(JSON.stringify(row.raw, null, 2));
    expect(html).toContain('<span class="text-blue-300">&quot;kind&quot;</span>');
    expect(html).toContain('<span class="text-orange-200">&quot;event&quot;</span>');
  });

  it("Follow latest is enabled only when pinned to a selected row", () => {
    const row = rowFor(RECEIVED);
    const follow = (following: boolean) =>
      /<button[^>]*>Follow latest<\/button>/.exec(
        renderToString(createElement(MessageInspectorPanelView, { row, following, rejected: 0, onFollowLatest: () => {} })),
      )?.[0] ?? "";
    expect(follow(true)).toContain('disabled=""');
    expect(follow(false)).not.toContain('disabled=""');
  });

  it("counts rejected messages in the footer", () => {
    const say = (rejected: number) =>
      text(renderToString(createElement(MessageInspectorPanelView, { row: null, following: true, rejected })));
    expect(say(1)).toContain("1 message rejected by contract validation");
    expect(say(1284)).toContain("1,284 messages rejected by contract validation");
  });
});
