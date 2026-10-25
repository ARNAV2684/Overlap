// first-visit-hint.test.ts — "What you're seeing" on the home page
//
// Purpose: the hint remembers its dismissal in this browser, survives blocked storage, and never renders on the server
//          (so a visitor who dismissed it never sees it flash)
// Inputs:  fake storages
// Outputs: pass / fail
// Spec:    web/specs/screens.md §1

import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { dismissHint, FirstVisitHint, HINT_KEY, hintDismissed } from "@/components/home/FirstVisitHint";

function memoryStorage() {
  const data = new Map<string, string>();
  return { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), data };
}
const blocked = {
  getItem: () => {
    throw new Error("SecurityError");
  },
  setItem: () => {
    throw new Error("SecurityError");
  },
};

describe("first-visit hint", () => {
  it("shows until dismissed, then stays dismissed in this browser", () => {
    const storage = memoryStorage();
    expect(hintDismissed(storage)).toBe(false);
    dismissHint(storage);
    expect(storage.data.get(HINT_KEY)).toBe("1");
    expect(hintDismissed(storage)).toBe(true);
  });

  it("treats blocked or missing storage as not dismissed, without throwing", () => {
    expect(hintDismissed(blocked)).toBe(false);
    expect(() => dismissHint(blocked)).not.toThrow();
    expect(hintDismissed(undefined)).toBe(false);
    expect(() => dismissHint(undefined)).not.toThrow();
  });

  it("renders nothing on the server", () => {
    expect(renderToString(createElement(FirstVisitHint, { source: "replay" }))).toBe("");
  });
});
