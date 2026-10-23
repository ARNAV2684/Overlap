// live-screen-controls.test.ts — The live screen's own controls
//
// Purpose: the site-styled dropdown moves and jumps through options as the keyboard says and renders as an ARIA
//          select-only combobox; the score header splits a club's name into its two stacked lines; the folded
//          caption's flank bar names every lane
// Inputs:  hand-made options and names
// Outputs: pass / fail
// Spec:    web/specs/screens.md §2.1, §2.2, §3

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { splitTeamName } from "@/components/match/ScoreHeader";
import { FlankBar } from "@/components/match/PitchOverlay";
import { moveIndex, Select, typeAhead } from "@/components/ui/Select";

describe("Select keyboard", () => {
  it("moves with the arrows, Home, End and the page keys, stopping at either end", () => {
    expect(moveIndex("ArrowDown", 0, 5)).toBe(1);
    expect(moveIndex("ArrowDown", 4, 5)).toBe(4);
    expect(moveIndex("ArrowUp", 0, 5)).toBe(0);
    expect(moveIndex("Home", 3, 5)).toBe(0);
    expect(moveIndex("End", 1, 5)).toBe(4);
    expect(moveIndex("PageDown", 1, 30)).toBe(11);
    expect(moveIndex("PageUp", 3, 30)).toBe(0);
    expect(moveIndex("a", 1, 5)).toBeNull();
    expect(moveIndex("ArrowDown", 0, 0)).toBeNull();
  });

  it("jumps to the next option starting with what was typed, ignoring case and accents", () => {
    const labels = ["Nobody", "9 · Kai Sartori", "Español", "English", "Ekow"];
    expect(typeAhead(labels, "e", 0)).toBe(2);
    expect(typeAhead(labels, "e", 2)).toBe(3);
    expect(typeAhead(labels, "ee", 3)).toBe(4); // a repeated letter cycles
    expect(typeAhead(labels, "en", 0)).toBe(3);
    expect(typeAhead(labels, "es", 0)).toBe(2); // "Español" without its accent
    expect(typeAhead(labels, "z", 0)).toBe(-1);
  });

  it("renders a combobox button and a hidden listbox with grouped options", () => {
    const html = renderToString(
      createElement(Select, {
        value: "b",
        labelledBy: "follow-label",
        onChange: () => {},
        options: [
          { value: "", label: "Nobody" },
          { value: "a", label: "Ama", group: "North" },
          { value: "b", label: "Bea", group: "North" },
          { value: "c", label: "Cy", group: "South" },
        ],
      }),
    );
    expect(html).toContain('role="combobox"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-labelledby="follow-label"');
    expect(html).toMatch(/role="listbox"[^>]*hidden/);
    expect(html.match(/role="option"/g)).toHaveLength(4);
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
    // One heading per group, before its first option
    expect(html.match(/>North</g)).toHaveLength(1);
    expect(html.match(/>South</g)).toHaveLength(1);
    // The button shows the chosen option
    expect(html).toMatch(/role="combobox"[\s\S]*?>Bea</);
  });
});

describe("score header names", () => {
  it("puts the first word on the first line and the rest on the second", () => {
    expect(splitTeamName("Northbridge Rovers")).toEqual(["Northbridge", "Rovers"]);
    expect(splitTeamName("  Harbour  Bay Athletic ")).toEqual(["Harbour", "Bay Athletic"]);
    expect(splitTeamName("Corvale")).toEqual(["Corvale", ""]);
  });
});

describe("folded caption flank bar", () => {
  it("names every lane and its share", () => {
    const html = renderToString(
      createElement(FlankBar, {
        channel: "right",
        flanks: [
          { channel: "left", share: 20, shots: null, xg: null },
          { channel: "centre", share: 25, shots: null, xg: null },
          { channel: "right", share: 55, shots: null, xg: null },
        ],
      }),
    );
    expect(html).toContain("Attack by flank: left 20%, centre 25%, right 55%");
    expect(html).toContain("height:55%");
  });
});
