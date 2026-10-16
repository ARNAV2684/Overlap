# Design system spec

> **Status: draft for review.** Answers §1 (identity), §3 (layout, minimum text size), §4 (motion) and §5
> (accessibility) for the live match screen, and §2 only where the live screen needs it. It describes the choices
> already built on `web/live-match-ui-setup` (not on `main` yet), so the code can be reviewed against it. Items marked
> *planned* are not built yet (scoreboard, timeline and pitch milestones M4 and M5). Plan:
> [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md) (milestone M1). Nothing here is
> agreed until this PR is approved.

Decides Overlap's own visual identity. It must be original.

## 1. Identity

- Palette, typography and logo for Overlap.
- Dark and light themes.

_Answer:_

- **Dark theme only.** `color-scheme: dark`, no theme toggle, no `data-theme` attribute and no stored theme. A light
  theme is out of scope; if it is wanted later it is a second set of semantic-token values in `globals.css` and no
  component changes, because components never use raw scale steps or hex values.
- **Tokens live in CSS** (`web/src/app/globals.css`, Tailwind v4 `@theme`), in three layers:
  1. **Scales:** `greys` (neutrals), `orange` (primary; 500 `#ff860d` is the brand colour) and `blue` (secondary; 500
     `#3d86f4`), each from 50 to 950. They replace Tailwind's default orange and blue.
  2. **Semantic tokens** (what components use): `bg`, `surface` (panels, cards), `surface-raised` (hover, selected
     base), `line` (decorative dividers), `line-strong` (control borders), `ink`, `ink-muted`, `primary`,
     `primary-hover`, `primary-ink` (text on primary), `accent-text` (orange text on dark), `secondary`,
     `secondary-text`, `secondary-soft` (18 % tint for selection), and the pitch tokens `pitch-surface`,
     `pitch-stripe`, `pitch-line`, `pitch-marker-edge`.
  3. **Card colours, fixed by meaning:** `card-yellow` `#facc15` and `card-red` `#dc2626`, each with `-ink` (text on the
     chip), `-soft` (row tint) and, for red, `card-red-text` (`#f87171`, red as text on dark). Always shown with the
     words "Yellow card" / "Red card"; a second yellow shows a yellow "Second yellow" chip and a red "Red" chip.
- **Rule:** components use semantic tokens only. No raw hex in `src/components` (checked by search in review).
- **Typography:** Inter (UI) and JetBrains Mono (times, ids, JSON), self-hosted through `next/font/google`. Text styles
  are tokens, each one class setting size, line height, spacing and weight:

  | Class | Size | Used for |
  |---|---|---|
  | `text-display` | 32 px | The page's `h1` |
  | `text-score` | 44 px | Score (`numeric`) |
  | `text-metric` | 28 px | Counter values (`numeric`) |
  | `text-title` | 22 px | Team names |
  | `text-heading` | 15 px | Panel titles |
  | `text-body` | 14 px | Default text |
  | `text-body-sm` | 13 px | Timeline event title |
  | `text-caption` | 12 px | Descriptions, notes (`text-ink-muted`) |
  | `text-eyebrow` | 11 px | Uppercase labels, table heads |
  | `text-label` | 11 px | Team tags, small badges |
  | `text-clock` | 22 px | Match clock (`font-mono numeric`) |
  | `text-code` | 12 px | JSON, times (`font-mono`) |

  `numeric` sets tabular figures so changing digits do not jitter. `src/lib/cn.ts` registers these class names with
  `tailwind-merge`, and a test fails if a new `--text-*` token is not registered.
- **Logo:** an SVG mark of two overlapping circles (orange and blue, the overlap drawn in `ink`) with the "OVERLAP"
  wordmark. No glyph or image file.
- **Background:** `bg` with two radial glows (orange top-right, blue top-left) at 12 % opacity, fixed to the viewport.
  Text keeps at least 6.7 : 1 at the brightest point of the glow (table in §5).

## 2. Club theming

- How a favourite club recolours the UI, and the contrast rules for any two clubs.

_Answer:_

- **Decided for the live screen only:** the scoreboard and pitch use the two clubs' `colours.primary` from the match
  setup, through the CSS variables `--team-home` and `--team-away` (defaults: orange-500 and blue-400). A club colour is
  always paired with the club's name or id as text; colour is never the only signal.
- Text drawn on a kit colour uses `readableInk(hex)` (`src/lib/team-colours.ts`), which picks near-black or white by
  contrast and throws on anything that is not `#RRGGBB`, so bad data fails loudly. The setup schema already guarantees
  the format.
- Kit fills on the light pitch always get the dark `pitch-marker-edge` outline (orange alone is 1.6 : 1 and blue 2.4 : 1
  against the pitch; see §5).
- **Not decided:** recolouring the whole UI for a favourite club, and the contrast rule between any two clubs' colours
  (the generator's world spec §6 owns the kit rules; the web app does not re-check them).

## 3. Layout

- Breakpoints, spacing and the card style.
- Minimum text size.

_Answer:_

- **Frame:** one centred column, at most 1510 px wide, with 16 px side padding on phones, 20 px from 640 px and 40 px
  from 1024 px. No horizontal scroll from 375 px up.
- **Breakpoints:** below 680 px the intro stacks and metric cards use two columns; below 1000 px the workspace is one
  column; the sub-grids follow the live-screen layout in `screens.md` §1.
- **Shapes:** card 14 px radius (scoreboard), panel 12 px, control 6 px, pill 999 px (`rounded-card`, `rounded-panel`,
  `rounded-control`, `rounded-pill`). Panels are `bg-surface` with a `border-line` border.
- **Text size:** body text is 14 px (a dense data screen). No running text below 12 px and no label below 11 px.
- **Landmarks:** `AppShell` is a plain `div`; the screen places its own `<main>` between `<header>` and `<footer>`, so
  those two count as the banner and contentinfo landmarks.

## 4. Motion

- Animation timings, and behaviour under reduced motion.

_Answer:_

- Every animation is gated by `prefers-reduced-motion` (Tailwind `motion-safe:`), so with reduced motion there is no
  pulse, spin, flash or movement; state is conveyed by text and icon.
- Animations in use: the live dot's ping, the skeleton pulse, the button spinner (loading), and, *planned*, the score flash on a goal
  (`primary`, 600 ms) and the pitch markers' movement (`transform` transition, 200 ms linear, so 1 message per second
  looks smooth).
- The page glow and all other effects are static.

## 5. Accessibility

- Keyboard navigation, screen-reader text and contrast targets.

_Answer:_

- **Keyboard:** every control is reachable by Tab in reading order and operable without a mouse. Radio-like groups
  (`SegmentedControl`, `role="radiogroup"`) are one Tab stop: arrows move and select (wrapping), Home and End jump,
  disabled options are skipped. Buttons toggle with Space and Enter. The timeline listbox (*planned*, `screens.md` §1) uses a
  roving tabindex with arrow keys and Enter or Space to select.
- **Focus:** one global rule gives every interactive element a 2 px `primary` outline with a 2 px offset (7 : 1 or more
  on page and panels). It has zero specificity, so a component can override it on purpose. Components add no ring
  classes of their own.
- **Touch targets:** about 44 px tall for buttons and segments at phone width.
- **Screen readers:** one `h1` per page and an `h2` per panel; `header`, `main`, `footer` landmarks; the connection
  badge is `role="status"`; decorative icons and the skeleton, live dot and pitch markings are `aria-hidden`; goals are
  announced (*planned*) through a visually hidden `aria-live="assertive"` region; clock ticks and counters are never announced.
- **Throttled announcements:** the notice line (`role="status"`, `aria-live="polite"`) announces at most once every 3 s,
  always the newest text, and not when only a number changed ("for 11 seconds" then "for 12 seconds" is one
  announcement). Implemented in `src/lib/announcer.ts`.
- **Never colour alone:** badges, cards and teams carry words and icons as well as colour.
- **Contrast targets:** 4.5 : 1 for text and 3 : 1 for UI parts and graphics (WCAG 2.x AA). The table below was computed
  from the token values in `globals.css`, with translucent tints composited over the surface they sit on. The check
  script was a throwaway and is **not in the repo**, so re-measure when tokens change (adding it as a committed check is
  an open question). The status-badge rows are approximate: tints are composited in sRGB while the browser mixes in oklab,
  and the margin is wide. Rows marked "known failure" are combinations that are **not allowed**.


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
| `ink` | page glow, orange peak (12 %) | 16.19 : 1 | 4.5 : 1 (text) | Pass | Main text at the brightest point of the orange glow |
| `ink-muted` | page glow, orange peak (12 %) | 6.70 : 1 | 4.5 : 1 (text) | Pass | Secondary text at the brightest point of the orange glow |
| `secondary-text` | page glow, orange peak (12 %) | 6.82 : 1 | 4.5 : 1 (text) | Pass | Blue text at the brightest point of the orange glow |
| `accent-text` | page glow, orange peak (12 %) | 8.42 : 1 | 4.5 : 1 (text) | Pass | Orange text at the brightest point of the orange glow |
| `ink-muted` | page glow, blue peak (12 %) | 6.93 : 1 | 4.5 : 1 (text) | Pass | Secondary text at the brightest point of the blue glow |
| `accent-text` | `primary` 15 % tint over page | 8.02 : 1 | 4.5 : 1 (text) | Pass | "Live" status badge (6.50 over the brightest glow) |
| `secondary-text` | `secondary-soft` over page | 6.53 : 1 | 4.5 : 1 (text) | Pass | "Connecting" / "Reconnecting" badge (5.53 over the brightest glow) |
| `card-yellow` | `card-yellow-soft` over page | 9.87 : 1 | 4.5 : 1 (text) | Pass | "No recent data" badge (7.92 over the brightest glow) |
| `ink` | `surface-raised` | 14.31 : 1 | 4.5 : 1 (text) | Pass | "Match finished" badge |
| `orange-500` | `pitch-surface` | 1.62 : 1 | known failure | Fail (as expected) | Orange kit fill alone on pitch: needs outline |
| `blue-500` | `pitch-surface` | 2.37 : 1 | known failure | Fail (as expected) | Blue kit fill alone on pitch: needs outline |

Rules that follow from this table:

- Text on the orange primary is `text-primary-ink` (near-black), never white.
- Red text uses `text-card-red-text`; plain `card-red` is for chip fills and swatches.
- `greys-500` is not for text. Controls use `border-line-strong` (`greys-500`).
- Kit colours are never used alone on the pitch: markers always get the dark outline.
