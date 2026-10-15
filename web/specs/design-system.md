# Design system spec

> **Status: in progress.** Only the contrast results in §5 are filled in (measured from the real tokens in
> `web/src/app/globals.css`). Everything else is still open. Write and agree this before coding any component.

Decides Overlap's own visual identity. It must be original.

## 1. Identity

- Palette, typography and logo for Overlap.
- Dark and light themes.

_Answer:_

## 2. Club theming

- How a favourite club recolours the UI, and the contrast rules for any two clubs.

_Answer:_

## 3. Layout

- Breakpoints, spacing and the card style.
- Minimum text size.

_Answer:_

## 4. Motion

- Animation timings, and behaviour under reduced motion.

_Answer:_

## 5. Accessibility

- Keyboard navigation, screen-reader text and contrast targets.

_Answer:_

**Contrast targets and results (done).** Targets: 4.5 : 1 for text, 3 : 1 for UI parts and graphics (WCAG 2.x AA).
Dark theme only. Ratios are computed from the token values in `globals.css`, with translucent tints composited over
the surface they sit on. Rows marked "known failure" are combinations that are **not allowed**; the rule beside them says
what to use instead. Keyboard navigation and screen-reader text are still to be decided.

| Foreground | Background | Ratio | Needs | Result | Where |
|---|---|---|---|---|---|
| `ink` | `bg` | 18.86 : 1 | 4.5 : 1 (text) | Pass | Main text on page |
| `ink` | `surface` | 16.67 : 1 | 4.5 : 1 (text) | Pass | Main text on panels |
| `ink` | `surface-raised` | 14.31 : 1 | 4.5 : 1 (text) | Pass | Main text on hover/raised rows |
| `ink-muted` | `bg` | 7.80 : 1 | 4.5 : 1 (text) | Pass | Secondary text on page |
| `ink-muted` | `surface` | 6.90 : 1 | 4.5 : 1 (text) | Pass | Secondary text on panels |
| `ink-muted` | `surface-raised` | 5.92 : 1 | 4.5 : 1 (text) | Pass | Secondary text on hover/raised rows |
| `accent-text` | `surface` | 8.68 : 1 | 4.5 : 1 (text) | Pass | Orange text (eyebrows, live labels) |
| `primary` | `bg` | 8.12 : 1 | 4.5 : 1 (text) | Pass | Orange text/icon on page |
| `primary-ink` | `primary` | 8.12 : 1 | 4.5 : 1 (text) | Pass | Primary button label |
| `primary-ink` | `primary-hover` | 9.81 : 1 | 4.5 : 1 (text) | Pass | Primary button label, hover |
| white | `primary` | 2.42 : 1 | known failure | Fail (as expected) | White on primary: never |
| `secondary-text` | `surface` | 7.02 : 1 | 4.5 : 1 (text) | Pass | Blue text/links on panels |
| `secondary-text` | `bg` | 7.94 : 1 | 4.5 : 1 (text) | Pass | Blue text/links on page |
| `secondary-text` | `secondary-soft` tint over `surface` | 5.60 : 1 | 4.5 : 1 (text) | Pass | Blue text on a selected row |
| `ink` | `secondary-soft` tint over `surface` | 13.30 : 1 | 4.5 : 1 (text) | Pass | Main text on a selected row |
| `ink-muted` | `secondary-soft` tint over `surface` | 5.50 : 1 | 4.5 : 1 (text) | Pass | Secondary text on a selected row |
| `card-yellow-ink` | `card-yellow` | 12.85 : 1 | 4.5 : 1 (text) | Pass | Yellow-card chip label |
| `card-red-ink` | `card-red` | 4.83 : 1 | 4.5 : 1 (text) | Pass | Red-card chip label |
| `card-red-text` | `surface` | 6.29 : 1 | 4.5 : 1 (text) | Pass | Red text on panels |
| `card-red-text` | `color-card-red-soft` tint over `surface` | 5.50 : 1 | 4.5 : 1 (text) | Pass | Red text on a red-card row |
| `ink` | `color-card-red-soft` tint over `surface` | 14.57 : 1 | 4.5 : 1 (text) | Pass | Main text on a red-card row |
| `ink` | `color-card-yellow-soft` tint over `surface` | 12.11 : 1 | 4.5 : 1 (text) | Pass | Main text on a yellow-card row |
| `card-red` | `surface` | 3.60 : 1 | known failure | Fail (as expected) | Plain #dc2626 as text: use card-red-text |
| `greys-500` | `bg` | 4.09 : 1 | known failure | Fail (as expected) | greys-500 as body text: decoration/disabled only |
| `primary` | `bg` | 8.12 : 1 | 3 : 1 (UI / graphics) | Pass | Focus ring on page |
| `primary` | `surface` | 7.18 : 1 | 3 : 1 (UI / graphics) | Pass | Focus ring on panels |
| `line-strong` | `surface` | 3.62 : 1 | 3 : 1 (UI / graphics) | Pass | Button/control border on panels (3:1 desired) |
| `team-home-default` | `surface` | 7.18 : 1 | 3 : 1 (UI / graphics) | Pass | Default home colour (orange-500) on panels |
| `team-away-default` | `surface` | 7.02 : 1 | 3 : 1 (UI / graphics) | Pass | Default away colour (blue-400) on panels |
| `card-yellow` | `surface` | 11.36 : 1 | 3 : 1 (UI / graphics) | Pass | Yellow card swatch on panels |
| `card-red` | `surface` | 3.60 : 1 | 3 : 1 (UI / graphics) | Pass | Red card swatch on panels (3.6 > 3) |
| `pitch-line` | `pitch-surface` | 6.21 : 1 | 3 : 1 (UI / graphics) | Pass | Pitch lines on pitch |
| `pitch-line` | `pitch-stripe` | 7.44 : 1 | 3 : 1 (UI / graphics) | Pass | Pitch lines on stripe |
| `pitch-marker-edge` | `pitch-surface` | 13.15 : 1 | 3 : 1 (UI / graphics) | Pass | Marker outline on pitch |
| `orange-500` | `pitch-surface` | 1.62 : 1 | known failure | Fail (as expected) | Orange kit fill alone on pitch: needs outline |
| `blue-500` | `pitch-surface` | 2.37 : 1 | known failure | Fail (as expected) | Blue kit fill alone on pitch: needs outline |

Rules that follow from this table:

- Text on the orange primary is `text-primary-ink` (near-black), never white.
- Red text uses `text-card-red-text`; plain `card-red` is for chip fills and swatches.
- `greys-500` is not for text. Controls use `border-line-strong` (`greys-500`).
- Kit colours are never used alone on the pitch: markers always get the dark outline.

