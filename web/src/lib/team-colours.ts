// team-colours.ts — Kit colour helpers
//
// Purpose: pick readable text for a kit colour (the number on a player marker, a label on a team-coloured bar)
// Inputs:  a kit colour as #RRGGBB (the setup guarantees this format)
// Outputs: "dark" or "light", plus ready-made Tailwind classes for each; teamColourStyle() for the CSS variables
// Spec:    web/specs/design-system.md §2
//
// The class names are written out in full so Tailwind can see them.

import type { CSSProperties } from "react";
import type { MatchSetup } from "@/lib/contracts";

/** #0b0b0b, the same near-black as the greys-950 token. */
const DARK_INK = [11, 11, 11] as const;
const LIGHT_INK = [255, 255, 255] as const;

function parseHex(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!match) throw new TypeError(`Expected a colour like #B3202A, got ${JSON.stringify(hex)}`);
  return [parseInt(match[1], 16), parseInt(match[2], 16), parseInt(match[3], 16)];
}

/** WCAG relative luminance, 0 (black) to 1 (white). */
function luminance([r, g, b]: readonly [number, number, number]): number {
  const [lr, lg, lb] = [r, g, b].map((channel) => {
    const c = channel / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio between two colours, 1 to 21. */
export function contrastRatio(a: readonly [number, number, number], b: readonly [number, number, number]): number {
  const [light, dark] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (light + 0.05) / (dark + 0.05);
}

/** Whichever of near-black or white gives the higher contrast on this colour. Throws on a malformed colour. */
export function readableInk(hex: string): "dark" | "light" {
  const background = parseHex(hex);
  return contrastRatio(DARK_INK, background) >= contrastRatio(LIGHT_INK, background) ? "dark" : "light";
}

/** Text colour class for the ink that is readable on this kit colour. */
export function inkTextClass(hex: string): string {
  return readableInk(hex) === "dark" ? "text-greys-950" : "text-white";
}

/** SVG fill class for the ink that is readable on this kit colour (for numbers drawn inside an SVG). */
export function inkFillClass(hex: string): string {
  return readableInk(hex) === "dark" ? "fill-greys-950" : "fill-white";
}

/**
 * The --team-home / --team-away variables for an element, from the clubs' primary kit colours, or undefined before the
 * setup arrives (globals.css then falls back to orange-500 and blue-400). bg-team-home, border-team-away and the Tag
 * tones read them from the nearest element that sets them.
 */
export function teamColourStyle(setup: MatchSetup | null): CSSProperties | undefined {
  if (!setup) return undefined;
  return {
    "--team-home": setup.teams.home.colours.primary,
    "--team-away": setup.teams.away.colours.primary,
  } as CSSProperties;
}
