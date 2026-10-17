import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { cn } from "@/lib/cn";

describe("cn", () => {
  it("keeps a custom text size next to a text colour (tailwind-merge would otherwise drop it)", () => {
    expect(cn("text-score", "text-ink")).toBe("text-score text-ink");
    expect(cn("text-ink", "text-score")).toBe("text-ink text-score");
  });

  it("lets a later custom size replace an earlier size", () => {
    expect(cn("text-body", "text-score")).toBe("text-score");
    expect(cn("text-body-sm", "text-caption", "text-eyebrow")).toBe("text-eyebrow");
    expect(cn("text-lg", "text-code")).toBe("text-code");
  });

  it("lets a later colour replace an earlier colour", () => {
    expect(cn("text-ink", "text-ink-muted")).toBe("text-ink-muted");
    expect(cn("bg-primary", "bg-surface")).toBe("bg-surface");
  });

  it("keeps unrelated classes and ignores falsy values", () => {
    expect(cn("text-label", "text-card-red-text", "uppercase")).toBe("text-label text-card-red-text uppercase");
    expect(cn("text-clock", "font-mono", "numeric")).toBe("text-clock font-mono numeric");
    expect(cn("a", false && "b", undefined, null, "c")).toBe("a c");
  });

  it("accepts the object form", () => {
    expect(cn("text-heading", { "text-ink-muted": true, "text-ink": false })).toBe("text-heading text-ink-muted");
  });

  it("knows every text class that globals.css defines", () => {
    // If a size is added to globals.css but not to cn.ts, it is read as a colour and dropped next to a real colour.
    const css = readFileSync(fileURLToPath(new URL("../../app/globals.css", import.meta.url)), "utf8");
    const sizes = [...css.matchAll(/^\s*--text-([a-z]+(?:-[a-z]+)*):/gm)].map((m) => m[1]);
    expect(sizes.length).toBeGreaterThanOrEqual(12);
    for (const size of sizes) {
      expect(cn(`text-${size}`, "text-ink"), `text-${size}`).toBe(`text-${size} text-ink`);
    }
  });
});
