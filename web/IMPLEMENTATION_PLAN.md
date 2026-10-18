# Live match viewer in Next.js: implementation plan

> **Status: proposed. Not started.** Owner: Vedant (web, per `plans/REGISTRY.md`).
> Goal: rebuild the single-match demo served on `http://127.0.0.1:8788` (`mock/single-match-demo/`, PR #6) as a
> Next.js App Router + TypeScript + Tailwind CSS app in `web/`, using Overlap's own palette, reusable components and
> the shared contracts. Same data, same behaviour, better UI.
> Reviewed against: `main` @ `71ad1ef`.

---

## 0. Read this first

### 0.1 Spec gate (AGENTS.md rule 4)

All four web specs are still `not started`. This plan does **not** replace them. Each phase lists the spec questions
it answers; fill those `_Answer:_` blanks **in the same PR** as the phase's code.

| Spec | Answered by phase |
|---|---|
| `web/specs/design-system.md` §1 identity, §3 layout, §4 motion, §5 accessibility | 2, 3, 10 |
| `web/specs/realtime.md` §1 connection, §2 store, §3 catch-up | 4, 5 |
| `web/specs/charts.md` (LivePitch only) | 9 |
| `web/specs/screens.md` (live match screen only) | 6, 10 |

Out of scope for this plan: overlays, agents, stats panels, replay, recap, `how-it-works`, the overlay scheduler,
audience groups. The mock does not send overlays or stats (its audience and player groups stay silent).

### 0.2 Suggested PR split

Keep PRs to one layer and small enough to review (CONTRIBUTING.md). Branch names follow `<area>/<short-description>`.

| PR | Phases | Branch |
|---|---|---|
| 1 | 1–2 (setup + tokens) + `design-system.md` §1/§3 | `web/setup-and-tokens` |
| 2 | 3–5 (primitives, contracts/API, realtime) + `realtime.md` §1–§3 | `web/realtime-store` |
| 3 | 6–8 (shell, scoreboard, metrics, timeline) | `web/live-screen` |
| 4 | 9–10 (pitch, inspector, polish) + `charts.md`/`screens.md` parts | `web/live-pitch-and-polish` |

### 0.3 Rules this plan must keep

- **Contracts:** `src/lib/contracts.ts` mirrors `CONTRACTS.md` §2–§4 and §7 exactly and **rejects unknown fields** (zod `strictObject` schemas, Phase 4).
- **Dedupe on `seq`:** `seq` is unique per match across every kind. The mock uses one counter in
  `EnvelopeBuilder._env`, so `seq` alone is the key. The demo's `seq:kind` key is unnecessary.
- **Time:** order and compute with `match_ms`. `clock` is display-only. Never infer the half from the minute.
- **Coordinates:** tracking is in the pitch frame and maps straight onto SVG `0 0 105 68` with no flips. Any
  conversion goes through `src/lib/coordinates.ts` only.
- **No secrets:** `.env.example` holds URLs only; `.env.local` is never committed.
- **File headers:** keep the `Purpose / Inputs / Outputs / Spec` header comment at the top of every placeholder you
  replace, and add it to new files.
- **Synthetic only:** invented clubs and players only, in UI, fixtures and screenshots.

---

## 1. What the `:8788` demo is (design read)

### 1.1 Screen map (desktop ≥ 1000 px)

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ◒ OVERLAP / Live stream                                 [● Live connection]  │  header (88 px, bottom border)
├──────────────────────────────────────────────────────────────────────────────┤
│ LOCAL MATCH OBSERVATORY                         SOURCE                       │  intro
│ Watch the data move.                            Mock WebSocket · :8787       │
│ Real incoming messages…                         Direct mock preview · …      │
│ (notice line, role=status)                                                   │
├──────────────────────────────────────────────────────────────────────────────┤
│ ▌ HOME Northbridge FC        LIVE   1 : 0   62:14   SYN-9001   Harbour Ath ▐ │  scoreboard (gradient card)
├───────────────┬───────────────┬───────────────┬──────────────────────────────┤
│ MESSAGES  123 │ EVENTS    456 │ FRAMES   2340 │ LAST MESSAGE  19:04:11       │  4 metric cards
├───────────────┴───────────────┴───────┬───────┴──────────────────────────────┤
│ Event timeline ●          [Pause feed]│ Live positions               62:14.2 │
│ [Match events][Tracking][All]  120 sh.│ ┌──────────── pitch ──────────────┐  │
│ MATCH ELAPSED │ EVENT/DETAILS │ RECV. │ │  ● ● ●     ○      ● ●           │  │
│ 62:14.000     │ Shot  NBR     │19:04… │ └─────────────────────────────────┘  │
│ P2 · env #812 │ Okafor · saved│Live WS│ ● Home  ● Away  ○ Ball               │
│ …(scrolls, 540 px)                    ├──────────────────────────────────────┤
│                                       │ Message inspector    [Follow latest] │
│ footer note                           │ { "seq": 812, … }  (pre, scrolls)    │
└───────────────────────────────────────┴──────────────────────────────────────┘
  SYNTHETIC DATA                       Live local delivery. No paid services…     footer
```

Breakpoints in `style.css`: **≤ 1000 px**: one column, and the aside becomes a 2-column grid.
**≤ 680 px**: metrics in 2 columns, compact scoreboard, timeline columns 80 / 1fr / 98 px.

### 1.2 Behaviour inventory (`app.js`): everything the rebuild must match

| # | Behaviour | Where it goes |
|---|---|---|
| B1 | Opens `ws://localhost:8787/client/hubs/live?groups=match-SYN-9001` (raw envelopes, no subprotocol) | Phase 5 `socket.ts` |
| B2 | On open: reset view, fetch `GET /api/match/{id}/snapshot` (7 s timeout) while **buffering** live messages, merge both, sort by `seq`, ingest | Phase 5 |
| B3 | Accepts only `kind ∈ {event, positions, status}` for this `match_id`, with an integer `seq`, and drops a `seq` it has already seen | Phase 4–5 |
| B4 | The clock only moves forward (`match_ms` ≥ last) and shows `clock` | Phase 5 store |
| B5 | `status` → setup (team names, player lookup), score, phase; also adds a "Match state" row | Phase 5, 7, 8 |
| B6 | `event` → a timeline row with a human description (`describe()`): pass → receiver, shot outcome, sub on/off, card, foul → fouled player, pressure → target, period start/end | Phase 4 `describe-event.ts`, Phase 8 |
| B7 | `positions` → one "Position frame" row per frame in `data.frames`; the newest frame drives the pitch | Phase 5, 8, 9 |
| B8 | Ring buffers: 600 event/status rows + 600 tracking rows; shows the newest 120 for the active filter, newest first | Phase 5 |
| B9 | Snapshot rows are "History" (dimmed, `received = null`) and **excluded from counters** | Phase 5, 8 |
| B10 | Counters: messages, live events, frames, last receipt time, and messages in the last 10 s | Phase 7 |
| B11 | Render tick every 250 ms, only when something changed; the pitch skips intermediate frames at 20× | Phase 5 |
| B12 | Stale: connected but nothing for 10 s → badge "Connected · no recent data" plus a notice | Phase 5, 6 |
| B13 | Pause freezes the timeline, counters and pitch; reception and scoreboard continue; resume catches up | Phase 5, 8 |
| B14 | Selecting a row freezes it in the inspector; "Follow latest" goes back to the newest event | Phase 8, 9 |
| B15 | On close: reconnect after 3 s unless the phase is `full_time` ("Match finished") | Phase 5 |
| B16 | Filter tabs: Match events (events + status), Tracking, All data | Phase 8 |
| B17 | Unmount (`beforeunload`): bump the generation, clear the retry timer, close the socket | Phase 5 |

### 1.3 What to improve in the rebuild

| Demo | Rebuild |
|---|---|
| Labels at 8–10 px (table heads, tags, eyebrow) | **Minimum 11 px** for uppercase labels, 12 px for running text |
| `<canvas>` 840×560 (3:2, slightly distorted, not accessible) | SVG `viewBox="0 0 105 68"` per CONTRACTS §1.1, with real pitch markings in metres |
| Fixed teal/amber home and away colours | Team colours from the setup (`teams.*.colours`), always paired with a text label |
| Unicode glyph `◒` as the logo | SVG logo component |
| Rows are plain buttons with no list keyboard model | `listbox` with arrow-key navigation, `aria-selected` and a visible focus ring |
| Match id hard-coded `SYN-9001` | Route param `/match/[id]`, default from env |
| Dedupe key `seq:kind` | `seq` (contract rule) |
| Raw socket, no subprotocol | Negotiate + `json.webpubsub.azure.v1`, the same code path as real Azure Web PubSub |
| No reduced-motion handling | All motion gated by `prefers-reduced-motion` |

---

## Phase 1: Set up Next.js, Tailwind CSS (PostCSS) and axios

**Goal:** `web/` is a running Next.js app that passes the existing CI job (`.github/workflows/web.yml` runs
`npm run lint`, `tsc --noEmit` and `npm run build` once `web/package.json` exists).

**Progress:** steps 1 to 8 **done** (see "What actually happened"). Phase 1 is complete.

### Steps

1. **Scaffold in a scratch folder, then move the files in. (Done.)** `web/` already holds placeholder files, so
   `create-next-app` would refuse to run there.
   ```bash
   npx create-next-app@latest web-scaffold --ts --eslint --tailwind --app --src-dir --import-alias "@/*" --use-npm
   ```
   Copy into `web/`: `package.json`, `package-lock.json`, `tsconfig.json`, `next.config.ts`, `next-env.d.ts`,
   `eslint.config.mjs`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `.gitignore`
   (merge it with the root one). Do **not** overwrite the placeholder files. Delete `web-scaffold/`.
2. **Tailwind with PostCSS. (Done.)** Current Tailwind (v4) runs through the `@tailwindcss/postcss` plugin. Check the
   versions at install time; the scaffold may already include them.
   ```bash
   npm i -D tailwindcss @tailwindcss/postcss postcss
   ```
   ```js
   // postcss.config.mjs
   export default { plugins: { "@tailwindcss/postcss": {} } };
   ```
   ```css
   /* src/app/globals.css */
   @import "tailwindcss";
   ```
   v4 has no `tailwind.config.js`. Tokens live in CSS (`@theme`, Phase 2).
3. **Install runtime dependencies. (Done.)**
   ```bash
   npm i axios zod clsx tailwind-merge
   ```
   - `axios`: HTTP calls (negotiate, snapshot, match list).
   - `zod`: strict runtime validation of every message from the stream (Phase 4). Decided: use zod.
   - `clsx` + `tailwind-merge`: the `cn()` helper for component variants (Phase 3).
4. **Fonts with `next/font/google`. (Done.)** (self-hosted, no layout shift): `Inter` (UI) and `JetBrains Mono` (times,
   ids, JSON). Expose them as CSS variables `--font-inter` and `--font-jetbrains-mono` on `<html>`.
5. **Environment. (Done.)** Add `web/.env.example` (committed) and `web/.env.local` (ignored):
   ```bash
   NEXT_PUBLIC_STREAM_BASE_URL=http://localhost:8787
   NEXT_PUBLIC_DEFAULT_MATCH_ID=SYN-9001
   ```
   Read them once in `src/lib/env.ts` and fail loudly if they are missing.
6. **Make the placeholders build-safe. (Done.)** Comment-only files will likely break the build:
   - comment-only `.ts`/`.tsx` under `isolatedModules` → TS1208. Add `"moduleDetection": "force"` to `tsconfig.json`.
   - comment-only `page.tsx` has no default export → Next build error. Give each placeholder page a minimal
     `export default function Page() { return null; }` under its existing header.
   - comment-only `route.ts` → export `GET` returning `501 Not Implemented`.

   Verify each with `npm run build`; keep the header comments.
7. **Scripts (Done.)** in `package.json`: `dev`, `build`, `start`, `lint`, `typecheck` (`tsc --noEmit`).
8. **`web/README.md` (Done.):** add a "Run locally" section (start the mock, then `npm run dev`).

### What actually happened (steps 1 and 2)

- The scaffold installed **Next 16.4.1, React 19.3, Tailwind 4.3** and wired Tailwind through a Turbopack loader
  (`@tailwindcss/turbopack` plus a `turbopack.rules` block in `next.config.ts`), not PostCSS. I removed that
  package and rule, installed `tailwindcss @tailwindcss/postcss postcss`, and added `postcss.config.mjs`, as the
  Next docs bundled in `node_modules/next/dist/docs` describe.
- `next.config.ts` keeps the scaffold defaults `cacheComponents: true` and `partialPrefetching: true`. Review these
  before Phase 5/6; they change how dynamic and client data is handled.
- Copied into `web/`: `package.json` (renamed `overlap-web`), `package-lock.json`, `tsconfig.json`, `next.config.ts`,
  `next-env.d.ts`, `eslint.config.mjs`, `postcss.config.mjs`, `src/app/{layout.tsx,globals.css,favicon.ico}` and
  `AGENTS.md` (the scaffold's note telling agents to read the docs in `node_modules/next/dist/docs` first; `next dev`
  re-creates it anyway). **Not** copied: the scaffold's `page.tsx` and `public/`, so the placeholder pages are untouched.
- **`web/.gitignore`:** the scaffold's rules, plus `!.env.example` (so the example env file stays committable) and
  **`package-lock.json`** (decided: the lockfile is not committed). Trade-off: installs are not pinned, so
  teammates and CI may resolve slightly different versions. CI already falls back to `npm install` when there is no
  lockfile (`.github/workflows/web.yml`).
- Verified in the scratch copy with a temporary `bg-orange-500 p-4` page: `next build` passed and the generated CSS
  contained `.bg-orange-500`, so the PostCSS pipeline works. Lint and `tsc` passed there too.
- In `web/` itself, `npm ci` and `npm run lint` pass, but **`tsc` and `next build` fail until step 6** (the
  placeholder `page.tsx`/`route.ts` files are comment-only, so "is not a module"). That is expected and is exactly what
  step 6 fixes. `LayoutProps` errors appear only before Next has generated its route types.

### What actually happened (steps 3 to 5)

- **Step 3:** installed `axios` 1.20, `zod` 4.6 (so `z.strictObject` and `z.url` exist), `clsx` 2.1 and `tailwind-merge` 3.7.
- **Step 4:** `src/app/layout.tsx` now loads `Inter` and `JetBrains_Mono` (latin subset, `display: "swap"`) with the
  variables `--font-inter` and `--font-jetbrains-mono` on `<html>`. `src/app/globals.css` maps `--font-sans` and
  `--font-mono` to them (with system fallbacks) and the body uses `var(--font-sans)`. The build compiles both fonts and the
  CSS contains them. Page metadata is still the scaffold default; Phase 6 changes it.
- **Step 5:** `web/.env.example` (committed) and `web/.env.local` (ignored, same values). `src/lib/env.ts` validates
  them with zod and throws one readable error listing every problem: the stream URL must be a full URL and the match
  id must match `SYN-NNNN`. Tested by running it with valid, missing and malformed values. Reads each variable as
  `process.env.NEXT_PUBLIC_NAME`, because Next only inlines variables written out in full.
- `env.ts` throws on a missing or malformed value. **CI is now covered (decided):** `.github/workflows/web.yml` sets
  `NEXT_PUBLIC_STREAM_BASE_URL` and `NEXT_PUBLIC_DEFAULT_MATCH_ID` at job level (same values as `.env.example`; URLs and
  ids only, no secrets), so lint, typecheck, build and tests all see them once code imports `env.ts` (Phase 5). The file
  is a hot file owned by Arnav; tell him and Pranav about the change in the PR. Simulated locally with `.env.local`
  hidden and the variables supplied only through the environment: lint, `tsc`, build and all 183 tests passed.

### Files

`package.json`, `package-lock.json` (local only, gitignored), `tsconfig.json`, `next.config.ts`, `next-env.d.ts`, `eslint.config.mjs`,
`postcss.config.mjs`, `.env.example`, `src/app/layout.tsx`, `src/app/globals.css`, `src/lib/env.ts`, the placeholder
`page.tsx`/`route.ts` stubs, `web/README.md`.

### Done when

- [x] `npm run dev` serves the app (tested on port 3100: `/` returns 200, API stubs return 501). Browser console not checked.
- [x] `npm run lint`, `npm run typecheck` and `npm run build` all pass locally, including `typecheck` from a clean
      checkout with no `.next` folder.
- [x] PostCSS pipeline proven with a temporary `bg-orange-500 p-4` page in the scratch scaffold (the test page was
      not copied into `web/`).
- [x] No `.env.local` in git (`web/.gitignore`).

---

## Phase 2: Design tokens: colours and text classes

**Goal:** every colour and text style the UI uses comes from tokens. Components never contain raw hex values.
**Dark theme only** (decided): no light theme, no theme toggle and no `data-theme` switching in this plan. If a
light theme is wanted later, it is a new block of semantic-token values in `globals.css` and nothing else changes,
because components only use semantic tokens.
Answers `design-system.md` §1 (palette, type) and §3 (minimum text size).

### 2.1 Palette (done; in `src/app/globals.css`, Tailwind v4 `@theme`)

**Progress (2.1 done):** the three scales and the card colours are in `src/app/globals.css` in an `@theme` block.
Verified with a temporary page using all 42 classes (`bg-greys-50`…`bg-blue-950`, plus the card classes): the build
emitted every value exactly as listed and every utility; the page was then deleted. Tailwind v4 only emits a
variable once a class uses it, so the colours show up in the CSS as components start using them. Not started: 2.2
semantic tokens, 2.3 text classes, 2.4 contrast check, 2.5 other tokens.

Defining `--color-orange-*` and `--color-blue-*` **replaces** Tailwind's default orange and blue scales, so the
standard class names (`bg-orange-500`, `text-blue-400`) use our values. `greys` is a new scale (`bg-greys-900`).

```css
@import "tailwindcss";

@theme {
  /* Greys: neutrals */
  --color-greys-50: #fafafa;
  --color-greys-100: #f5f5f5;
  --color-greys-200: #e6e6e6;
  --color-greys-300: #d3d3d3;
  --color-greys-400: #a3a3a3;
  --color-greys-500: #727272;
  --color-greys-600: #535353;
  --color-greys-700: #474747;
  --color-greys-800: #272727;
  --color-greys-900: #1a1a1a;
  --color-greys-950: #0b0b0b;

  /* Orange: primary (500 is the brand primary) */
  --color-orange-50: #fff8ec;
  --color-orange-100: #fff0d3;
  --color-orange-200: #ffdea7;
  --color-orange-300: #ffc56e;
  --color-orange-400: #ffa234;
  --color-orange-500: #ff860d;
  --color-orange-600: #fc6f03;
  --color-orange-700: #c95005;
  --color-orange-800: #a03f0c;
  --color-orange-900: #80350e;
  --color-orange-950: #451905;

  /* Blue: secondary */
  --color-blue-50: #eff6ff;
  --color-blue-100: #dbebfe;
  --color-blue-200: #c0dcfd;
  --color-blue-300: #94c7fc;
  --color-blue-400: #62a8f8;
  --color-blue-500: #3d86f4;
  --color-blue-600: #2768e9;
  --color-blue-700: #1f53d6;
  --color-blue-800: #2044ad;
  --color-blue-900: #1f3d89;
  --color-blue-950: #1b2c5f;

  /* Card colours: fixed by meaning (decided), the same everywhere. Always shown with the words
     "Yellow card" / "Red card". Each name below becomes bg-/text-/border- utilities. */
  --color-card-yellow: #facc15;
  --color-card-yellow-ink: var(--color-greys-950);   /* text ON a yellow chip */
  --color-card-yellow-soft: color-mix(in oklab, #facc15 14%, transparent);   /* row tint */
  --color-card-red: #dc2626;
  --color-card-red-ink: #ffffff;                      /* text ON a red chip */
  --color-card-red-text: #f87171;                     /* red as TEXT on dark; #dc2626 alone is only 3.6:1 */
  --color-card-red-soft: color-mix(in oklab, #dc2626 18%, transparent);      /* row tint */
}
```

### 2.2 Semantic colour tokens (done; what components actually use)

**Progress (2.2 done):** the `:root` block and the `@theme inline` block below are in `src/app/globals.css`. They
replace the scaffold's `--background`/`--foreground` variables and its `prefers-color-scheme` rule (dark only, so
there is no media query). The `body` now uses `var(--bg)`, `var(--ink)` and `var(--font-sans)`. Verified with a
temporary page using every semantic class, including `hover:bg-primary-hover` and the pitch and team classes: all
utilities were generated, and the palette values they point to were emitted exactly (the build emits a scale step
once a semantic token references it). The page was then deleted. Lint and typecheck pass. Not started: 2.3 text
classes, 2.4 contrast check, 2.5 other tokens.

Raw scales are for the token file. Components use **semantic** names (`bg-surface`, `text-ink-muted`), never a raw
scale step such as `bg-greys-900`, so a later theme change only touches this block.

```css
:root {
  color-scheme: dark;
  --bg: var(--color-greys-950);
  --surface: var(--color-greys-900);          /* panels, cards */
  --surface-raised: var(--color-greys-800);   /* hover, selected row base */
  --line: var(--color-greys-800);             /* borders, dividers */
  --line-strong: var(--color-greys-500);      /* control borders: 3.6:1 on panels (was greys-700, 1.9:1, failed 3:1) */
  --ink: var(--color-greys-50);               /* main text */
  --ink-muted: var(--color-greys-400);        /* secondary text */
  --primary: var(--color-orange-500);         /* brand, live, focus ring */
  --primary-hover: var(--color-orange-400);
  --primary-ink: var(--color-greys-950);      /* text ON primary: NOT white (see 2.4) */
  --accent-text: var(--color-orange-400);     /* orange text on dark */
  --secondary: var(--color-blue-500);         /* selection, info, links */
  --secondary-text: var(--color-blue-400);
  --secondary-soft: color-mix(in oklab, var(--color-blue-500) 18%, transparent);

  /* Pitch (LivePitch, Phase 9): light grey surface, dark grey boundaries */
  --pitch-surface: var(--color-greys-300);
  --pitch-stripe: var(--color-greys-200);
  --pitch-line: var(--color-greys-700);
  --pitch-marker-edge: var(--color-greys-950);
}

@theme inline {
  --color-bg: var(--bg);
  --color-surface: var(--surface);
  --color-surface-raised: var(--surface-raised);
  --color-line: var(--line);
  --color-line-strong: var(--line-strong);
  --color-ink: var(--ink);
  --color-ink-muted: var(--ink-muted);
  --color-primary: var(--primary);
  --color-primary-hover: var(--primary-hover);
  --color-primary-ink: var(--primary-ink);
  --color-accent-text: var(--accent-text);
  --color-secondary: var(--secondary);
  --color-secondary-text: var(--secondary-text);
  --color-secondary-soft: var(--secondary-soft);
  --color-pitch-surface: var(--pitch-surface);
  --color-pitch-stripe: var(--pitch-stripe);
  --color-pitch-line: var(--pitch-line);
  --color-pitch-marker-edge: var(--pitch-marker-edge);
  /* Team colours are set at runtime from the match setup (Phase 7) */
  --color-team-home: var(--team-home, var(--color-orange-500));
  --color-team-away: var(--team-away, var(--color-blue-400));
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-mono: var(--font-jetbrains-mono), ui-monospace, monospace;
}
```

Usage: `bg-surface`, `border-line`, `text-ink-muted`, `bg-primary text-primary-ink`, `text-secondary-text`.

**Card colours (decided: add yellow and red as Tailwind classes).** You didn't give hex codes, so these are my picks
(Tailwind's standard yellow-400 / red-600 values). Say so if you want different ones; only the two hex values change.

| Hex | Tailwind classes | Used for |
|---|---|---|
| `#facc15` | `bg-card-yellow` + `text-card-yellow-ink` (chip), `border-card-yellow`, `bg-card-yellow-soft` (row tint) | Yellow-card chip and row |
| `#dc2626` | `bg-card-red` + `text-card-red-ink` (chip), `border-card-red`, `bg-card-red-soft` (row tint), `text-card-red-text` (red text on dark) | Red-card chip and row |

- A `second_yellow` card (CONTRACTS §3) renders **both** chips: a yellow chip and a red chip, labelled "Second yellow".
- Colour is never the only signal: every chip carries the words "Yellow card" / "Red card".
- Red `#dc2626` alone on dark is only 3.6:1, so red **text** uses `text-card-red-text` (`#f87171`, 6.3:1).
  The same two classes are reusable for any future yellow/red meaning (warnings, offsides, errors).

### 2.3 Text classes (done; Tailwind v4 `--text-*` tokens)

**Progress (2.3 done):** all 12 `--text-*` groups and the `numeric` utility are in `src/app/globals.css`, and
`src/lib/cn.ts` exists with the text names registered. Verified: a temporary page using all 12 classes built, and
each emitted rule set the size and line height, plus letter spacing and weight exactly where the tokens define them
(for example `text-body` has no spacing or weight, `text-eyebrow` has both). `cn()` was run on 10 cases (for example
`cn("text-score","text-ink")` keeps both, `cn("text-body","text-score")` keeps only `text-score`, and a later colour
replaces an earlier one): all as expected. There is no test file yet; vitest arrives in Phase 4. The test page was
deleted.

Each `--text-<name>` creates a `text-<name>` utility that sets size, line height, letter spacing and weight in one
class. Sizes come from the demo, raised to the 11 px minimum.

```css
@theme {
  --text-display: 2rem;          --text-display--line-height: 1.15;  --text-display--letter-spacing: -0.02em; --text-display--font-weight: 700;
  --text-score: 2.75rem;         --text-score--line-height: 1;       --text-score--letter-spacing: 0.08em;   --text-score--font-weight: 700;
  --text-metric: 1.75rem;        --text-metric--line-height: 1.1;    --text-metric--letter-spacing: -0.01em; --text-metric--font-weight: 600;
  --text-title: 1.375rem;        --text-title--line-height: 1.25;    --text-title--font-weight: 600;
  --text-heading: 0.9375rem;     --text-heading--line-height: 1.4;   --text-heading--font-weight: 600;
  --text-body: 0.875rem;         --text-body--line-height: 1.5;
  --text-body-sm: 0.8125rem;     --text-body-sm--line-height: 1.5;
  --text-caption: 0.75rem;       --text-caption--line-height: 1.5;
  --text-eyebrow: 0.6875rem;     --text-eyebrow--line-height: 1.4;   --text-eyebrow--letter-spacing: 0.14em;  --text-eyebrow--font-weight: 700;
  --text-label: 0.6875rem;       --text-label--line-height: 1.3;     --text-label--letter-spacing: 0.04em;    --text-label--font-weight: 500;
  --text-clock: 1.375rem;        --text-clock--line-height: 1.2;     --text-clock--font-weight: 500;
  --text-code: 0.75rem;          --text-code--line-height: 1.7;
}

@utility numeric { font-variant-numeric: tabular-nums; }
```

| Class | Size | Used for (demo element) | Pair with |
|---|---|---|---|
| `text-display` | 32 px | Intro `h1` "Watch the data move." | `text-ink` |
| `text-score` | 44 px | `#score` "1 : 0" | `numeric` |
| `text-metric` | 28 px | Metric card values | `numeric` |
| `text-title` | 22 px | Team names on the scoreboard | |
| `text-heading` | 15 px | Panel titles (`h2`) | |
| `text-body` | 14 px | Default body | |
| `text-body-sm` | 13 px | Event title in a timeline row | |
| `text-caption` | 12 px | Row description, panel subtitles, notes | `text-ink-muted` |
| `text-eyebrow` | 11 px | "LOCAL MATCH OBSERVATORY", HOME/AWAY, metric labels, table heads | `uppercase` |
| `text-label` | 11 px | Team tag chips, small badges | |
| `text-clock` | 22 px | Match clock | `font-mono numeric` |
| `text-code` | 12 px | JSON inspector, match/arrival times | `font-mono` |

Base body is 14 px rather than 16 px because this is a dense data screen. No running text goes below 12 px, and no
label below 11 px.

**`tailwind-merge` gotcha:** by default it treats an unknown `text-score` as a **colour** and would drop it when
merged with `text-ink`. Register the size names once in `src/lib/cn.ts`:

```ts
import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["display", "score", "metric", "title", "heading", "body", "body-sm",
                            "caption", "eyebrow", "label", "clock", "code"] } },
});
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
```

### 2.4 Contrast check (done)

**Progress (2.4 done):** I measured every pair below from the **real tokens in `globals.css`** with a throwaway
script (translucent tints composited over the surface they sit on), and pasted the full table into
`web/specs/design-system.md` §5. Results: 36 pairs, **35 as intended, 1 real failure found and fixed**.

- **Found and fixed:** control borders (`--line-strong`, `greys-700`) were only 1.87 : 1 on panels, below the 3 : 1
  needed for UI parts. Changed to `greys-500`: 3.6 : 1 on panels, 3.1 : 1 on raised rows. Decorative dividers
  (`--line`, `greys-800`) stay faint on purpose.
- **Confirmed passes (4.5 : 1 for text):** main text 14 to 19, secondary text 5.9 to 7.8, orange text 8.1 to 8.7,
  blue text 5.6 to 7.9 (including on a selected row), near-black on the primary button 8.1, card chip labels 12.9
  (yellow) and 4.8 (red), red text 5.5 to 6.3, main text on yellow-card and red-card rows 12.1 and 14.6.
- **Confirmed as not allowed:** white on orange (2.4), plain `#dc2626` as text (3.6), `greys-500` as body text (4.1),
  orange or blue kit fills alone on the light pitch (1.6 and 2.4, so markers need the dark outline).
- **Graphics (3 : 1):** focus ring 7.2 to 8.1, pitch lines 6.2 and 7.4, marker outline 13.2, default team colours 7.0
  and 7.2, card swatches 11.4 and 3.6.
- The script lives in the scratch folder and is not in the repo. It is worth keeping as a check that re-runs when
  tokens change; say if you want it added (for example `web/scripts/check-contrast.py`).

### 2.5 Other tokens (done)

**Progress (2.5 done):** all in `src/app/globals.css`. Verified with a temporary page and the generated CSS:
`rounded-card` (14 px), `rounded-panel` (12), `rounded-control` (6) and `rounded-pill` (999) exist; the body background is
`bg` plus the two glows; and the focus rule is emitted. Not checked in a browser. Notes:

- **Radii are theme classes**, so use `rounded-panel`, not the `rounded-[--radius-panel]` form that Phase 3 first showed.
- **Glow:** orange (top-right) and blue (top-left) radial gradients at 12 % alpha, `background-attachment: fixed` so
  the glow stays in the viewport on long pages (iOS Safari ignores `fixed` and scrolls it, which is harmless). At the
  brightest point muted text is 6.7 : 1, main text 16.2 : 1, blue text 6.8 : 1 and orange text 8.4 : 1, all above 4.5.
- **Focus ring:** one global rule `:where(a, button, input, select, textarea, summary, [tabindex]):focus-visible`
  gives a 2 px primary outline with a 2 px offset. It sits in `@layer base` with zero specificity, so components get it
  for free and can override it on purpose. Phase 3 components need no ring classes of their own.
- **Also done (missed in 2.3):** the `body` now has `font-size: var(--text-body)` and its line height, so base text
  is 14 px as the plan says (it was inheriting the browser's 16 px).

- Radii: `--radius-card: 14px` (scoreboard), `--radius-panel: 12px`, `--radius-control: 6px`, `--radius-pill: 999px`.
- Background glow: a radial gradient of `orange-500` and `blue-500` at low alpha over `bg`, replacing the demo's teal glow.
- Focus ring: `outline-2 outline-offset-2 outline-primary` on every interactive element.

### Files

`src/app/globals.css` (or `src/styles/tokens.css` imported from it), `src/lib/cn.ts`, `src/app/layout.tsx` (fonts;
dark only, no theme attribute), `web/specs/design-system.md` §1 and §3.

### Done when

- [ ] Every class in 2.1–2.5 generates CSS. Verified so far with temporary pages (palette, semantic colours, text
      classes, radii); the permanent swatch page (Phase 3 `/dev/ui`) is still to do.
- [x] The contrast table is verified with a checker and pasted into `design-system.md` (§5).
- [x] `cn("text-score", "text-ink")` keeps both classes (checked with a throwaway script, 10 cases).

---

## Phase 3: UI primitives (the reusable base)

**Goal:** small, typed, accessible building blocks. Every later component is built from these. Answers part of
`design-system.md` §5 (focus, keyboard).

**Delivery in two steps (decided).**

- **Step 1: static building blocks, done.** `Eyebrow`, `VisuallyHidden`, `Panel`, `PanelHeader`, `Card`,
  `EmptyState`, `Skeleton`, `LiveDot`, `Tag`, `Logo`, plus the dev page `/dev/ui` with every colour token, text class,
  radius and these primitives. One file per primitive in `src/components/ui/`, import by path (no barrel file, so a
  server component never pulls in client code by accident). Checked: lint and typecheck pass; no raw hex in
  `src/components`; the page renders in headless Edge on desktop (1280 px) and in a true 390 px frame with no sideways
  overflow (screenshots read by eye, not automated). Details: `Panel` uses `rounded-panel`; `PanelHeader` renders an
  `h2` by default and takes an `id` for `aria-labelledby`; `EmptyState` is `role="status"`; `Skeleton` and `LiveDot` are
  `aria-hidden` and animate only under `motion-safe`; `Tag` `home`/`away` read `--team-home`/`--team-away` (orange and
  blue until Phase 7 sets the kit colours); `Logo` is two overlapping circles (orange and blue) with the lens in `ink`.
- **Step 2: interactive and status primitives, done.** `Button`, `SegmentedControl`, `StatusBadge`, `CardChip`, `Kbd`,
  all on `/dev/ui` (interactive demos live in `src/app/dev/ui/SegmentedDemo.tsx`, a client component). Checked with a
  throwaway script that drives headless Edge over its debugging protocol (real key presses, mouse hover, reduced-motion
  and phone-width emulation): **19 of 19 checks pass**.
  - Tab order is exactly: each button, then one stop per radio group (the selected option only), then the toggle.
    Disabled and loading buttons are skipped.
  - `SegmentedControl`: Right/Down and Left/Up move and select and wrap; Home and End jump; a disabled option is
    skipped; Tab leaves the group.
  - Focus ring: 2 px solid orange, 2 px offset, on every stop. Hover changes the primary button from `#ff860d` to
    `#ffa234`. A loading button is `aria-busy`, disabled and spinning. Space and Enter toggle `aria-pressed`.
  - Reduced motion: the spinner, the live ping and the skeleton pulse all stop, and come back when motion is allowed.
  - Sizes: buttons and segments are 44 px tall at 390 px wide (37.5, 32 and 32 px on desktop); no sideways overflow.
  - Contrast of the badge text on its tints is in `design-system.md` §5 (all above 5.5 : 1).
  - **Caveat:** my first run showed 18 of 19 because my check used a class name that Tailwind does not emit
    (`motion-safe:animate-ping`); I fixed the check, not a component. The script is in the scratch folder, not the repo.
  - `StatusBadge` is `role="status"` (announced politely). Labels: Connecting, Live, No recent data, Reconnecting,
    Match finished (`label` overrides). `CardChip` second yellow shows a yellow "Second yellow" chip and a red "Red"
    chip. `Button` has no `aria-busy` unless loading; `type` defaults to `button`.

| Component | Props (summary) | Notes |
|---|---|---|
| `Button` | `variant: primary \| secondary \| ghost`, `size: sm \| md`, plus native button props | Primary = `bg-primary text-primary-ink`. Touch target ≥ 44 px on mobile. Visible focus ring |
| `SegmentedControl` | `options[{value,label}]`, `value`, `onChange`, `label` | The demo's tabs. A `role="radiogroup"` with arrow keys, active option `bg-secondary-soft text-secondary-text` |
| `StatusBadge` | `status: connecting \| live \| stale \| reconnecting \| finished` | Icon + text + colour, never colour alone. "Live" uses `LiveDot` |
| `LiveDot` | `pulsing?: boolean` | Pulse animation off under `prefers-reduced-motion` |
| `Tag` | `children`, `tone?: neutral \| home \| away` | Team id chip (`NBR`). `text-label` |
| `Eyebrow` | `children`, `as?` | `text-eyebrow uppercase text-ink-muted` |
| `Panel` | `children`, `className` | `bg-surface border border-line rounded-panel` |
| `PanelHeader` | `title`, `subtitle?`, `action?`, `titleAdornment?` | The demo's `.panel-heading`, used by all 3 panels |
| `Card` | `children` | Metric cards, source card |
| `EmptyState` | `title`, `hint?` | "Waiting for your first message…" |
| `Skeleton` | `className` | Loading placeholders that reserve space (no layout shift) |
| `VisuallyHidden` | `children` | Screen-reader-only text |
| `Logo` | `size?` | SVG mark replacing `◒`, with the "OVERLAP" wordmark |
| `CardChip` | `card: yellow \| second_yellow \| red` | Yellow/red card chip using the `card-yellow` / `card-red` classes (Phase 2). Always shows the words, never colour alone |
| `Kbd` | `children` | Optional keyboard hints in the timeline |

Also add a **dev-only kitchen-sink page** at `src/app/dev/ui/page.tsx`. It shows every primitive in every state and
every token swatch, for review and screenshots. It returns `notFound()` when `NODE_ENV === "production"`.

### Files

`src/components/ui/*.tsx` (one file per primitive), `src/app/dev/ui/page.tsx`.

### Done when

- [x] Every primitive renders on `/dev/ui` in every state (default, hover, focus, disabled, loading where relevant).
      Hover and focus are live on the page rather than frozen swatches.
- [x] Tab reaches every interactive primitive. Focus is always visible. `SegmentedControl` works with arrow keys.
- [x] No raw hex values in `src/components/**` (`grep -rE "#[0-9a-fA-F]{3,6}" src/components` is empty).

---

## Phase 4: Contracts, formatting and the API client (axios)

**Goal:** typed, validated data in; human-readable strings out. No UI yet. Answers `realtime.md` §1 (in part).

### 4.1 `src/lib/contracts.ts` (done; hot shared file: tell the owner of any contract you mirror)

**Progress (4.1 done):** `src/lib/contracts.ts` is written, with the schemas, the derived types and `parseEnvelope()`.
Lint and typecheck pass. Checked with a throwaway Node script (no test file yet; vitest and the committed tests are
4.4):

- **Real data:** I recorded all three mock matches (`mock record`: SYN-9001, 9002 and 9003) to the scratch folder and
  ran them through the schemas: **23,812 envelopes, 0 rejected**, plus every raw event, every 25th tracking frame and
  all three setups. SYN-9002 has a red card and 4 yellows, so the card rules ran on real data. Envelope `seq` is
  unique and strictly +1 in all three.
- **Deliberate breakage:** 37 broken messages, each rejected with a readable reason (unknown field on the envelope,
  inside an event, inside a frame and inside the setup; missing fields; bad ids and clocks; out-of-range
  coordinates, ratings and styles; each contract rule in §3; wrong match id; lineup not 11 or not starting with the
  goalkeeper). The 4 unrendered kinds and period markers without a team pass. `parseEnvelope` returned `ok: false`
  for `null`, `undefined`, a string, a number, an array and junk, and never threw.
- **Speed (Node, not a browser):** about 265 to 390 µs per envelope. At the 20x rate (about 48 messages a second)
  that is roughly 15 to 19 ms of work per second. Phase 10 re-checks in the browser.
- **Decisions worth knowing:** a `Foul` **requires** `fouled_player_id`, because CONTRACTS §3 says a foul is "one
  event, by the offender, with `fouled_player_id`" (this plan's earlier wording, "when a player was fouled", was looser).
  `Pressure.target_player_id` stays optional (the contract lists it only under "other fields"; the mock always sends it).
  `data` must be an object for every kind. Beyond the contract text, the schemas also check what the mock's own
  validator checks: id formats, 0 to 100 coordinates, ratings 1 to 99, style 0 to 1, formation like `4-3-3`, the
  goalkeeper first, the player id matching team and shirt, and no duplicate players. If any of these is stricter than
  the producers intend, loosen it in `CONTRACTS.md` terms, not silently here.
- **Not mirrored yet:** `stats`, `overlay`, `player_tag` and `recap` payloads (the screen ignores those kinds).
  `Snapshot` and the match list shapes arrive with the API client in 4.2.
- **To tell people:** this file mirrors `CONTRACTS.md` §1 to §4 and §7 without changing it. The `status` and
  `positions` payloads are provisional (from the mock), so Arnav and Pranav, who own the mock, and Azeem, who owns the
  generator, should know the web app now validates them strictly.

**Decided: zod.** Each message shape is a zod schema, and the TypeScript type is derived from it
(`type MatchEvent = z.infer<typeof matchEventSchema>`), so the types and the runtime checks can never disagree.

- Objects use `z.strictObject({...})` (zod 4; `.strict()` in zod 3, so check the installed version) so **unknown
  fields are rejected**, as CONTRACTS §1.3 requires ("a typo fails loudly").
- Schemas to write:
  - `envelopeSchema`: `{ seq, kind, match_id, match_ms, clock, data }`, with `kind ∈ event | positions | stats |
    overlay | player_tag | recap | status` (§7). `seq` is a non-negative integer, `match_ms` a number.
  - `matchSetupSchema` (§2), `matchEventSchema` (§3, with every optional field under "Other fields"),
    `trackingFrameSchema` (§4).
  - `statusDataSchema = { phase: "pre_match" | "live" | "half_time" | "full_time", period, score: {home, away},
    setup? }` and `positionsDataSchema = { frames: trackingFrameSchema[] }`. **Mark both PROVISIONAL**: they come
    from the mock (`mock/README.md` "Provisional choices"), not from CONTRACTS.md.
- **Contract rules as refinements** on `matchEventSchema` (`.superRefine`), taken from CONTRACTS §3: every event
  except `PeriodStart`/`PeriodEnd` has `team_id` and `player_id`; a successful `Pass` has `receiver_id`; a `Shot`
  has `shot_outcome` and `situation`; `shot_outcome` appears only on `Shot`; a `Card` has `card`; a `Substitution`
  has `player_on_id`; a `Foul` is one event with `fouled_player_id` when a player was fouled.
- **Two-step parse:** `parseEnvelope(raw)` validates the outer envelope, then validates `data` with the schema for
  its `kind` (a `z.discriminatedUnion` on `kind`). Kinds this screen doesn't render (`stats`, `overlay`,
  `player_tag`, `recap`) pass the outer check and are ignored, not rejected.
- **No throwing:** always `safeParse`. `parseEnvelope` returns `{ ok: true, envelope } | { ok: false, issues }`. A
  rejected message is **counted and logged** (kind, `seq`, first issue), never thrown. The inspector footer shows
  "N messages rejected by contract validation", so contract drift is loud without breaking the screen.
- If the running mock produces a field the schema rejects, that is **contract drift to report**, not a reason to
  loosen the schema: fix `CONTRACTS.md` (or the mock) in the same PR, with the producer and consumer owners agreeing.
- **Cost:** a full 20× match is roughly 14k messages, and each `positions` message holds 5 frames × 22 players.
  Strict parsing at this size is cheap; confirm in Phase 10 (no long tasks while ingesting).

### 4.2 `src/lib/api.ts`: axios client (done)

**Progress (4.2 done):** `src/lib/api.ts` is written. Lint and typecheck pass. The code block below is the plan's
original sketch; what was built differs as described here.

- **What it exports:** `createApiClient(baseUrl, timeoutMs = 7000)`, the ready-made `api` for the configured server, and
  `negotiate`, `getSnapshot`, `listMatches` taken from it. The factory exists so tests (4.4) and the dead-server and
  timeout cases can point at other addresses.
- **Validated responses:** `negotiate` returns `{ baseUrl, url, token }`; `listMatches` returns
  `{ match_id, group, phase, score, clock }[]` (the last three are `null` before the first message); `getSnapshot`
  returns `{ matchId, setup, status, envelopes, rejected: { count, samples } }`. Every response is checked with zod
  (strict). The snapshot's envelopes are each run through `parseEnvelope`, so **one bad envelope is counted and
  skipped instead of discarding the whole catch-up**. These three response shapes are PROVISIONAL (the mock's), and
  they live in `api.ts`, not in `contracts.ts`.
- **Errors:** everything thrown is an `ApiError` with a `kind`: `network`, `timeout`, `aborted`, `http` (with the
  status) or `invalid-response`. `aborted` is not a failure worth showing. `negotiate`'s token is never logged.
- **Deliberately no custom headers.** The plan's sketch sent `Cache-Control: no-store`. A custom header makes a
  cross-origin browser call send a CORS preflight, and the mock answers no preflight, so the call would be blocked. The
  snapshot response has no cache validators, so the browser does not reuse it anyway. If the real server needs
  `no-store`, set it on the response in our own `/api` route, not on the request.
- **Verified in a real browser** (headless Edge, a temporary page on the Next.js origin `localhost:3001` calling the
  live mock on `:8787`, all three matches running at 40x): **10 of 10 checks pass**: negotiate returns a socket URL for
  the group; `listMatches` returns the 3 matches with phase and clock; a mid-match snapshot of SYN-9001 returned 635
  envelopes (632 events, 2 status, 1 positions), 0 rejected, in seq order, fetched and validated in 71 ms; an unknown
  match gives `http 404`; aborting gives `aborted`; a dead address gives `network`; a 1 ms timeout gives `timeout`; a
  second match works. This proves CORS works without a preflight. The temporary page was deleted.
- **Not exercised:** the `invalid-response` path end to end (the 200-with-wrong-body case); only the schemas behind it
  were tested, in 4.1. 4.4 should add a unit test with a fake server.
- **Finding for Phase 5:** a snapshot's `seq` is **not contiguous**. The server leaves out old `positions` envelopes, so
  the 635 envelopes above span seq 1 to 2212. The store must dedupe by `seq` and sort, never assume +1.
- **CI:** `api.ts` imports `env.ts`, which throws if the two env vars are missing. `web.yml` now provides them (see Phase 1,
  steps 3 to 5), so the build will not fail on that once Phase 5 imports it.

```ts
export const api = axios.create({ baseURL: env.streamBaseUrl, timeout: 7000 });

export const negotiate = (groups: string[]) =>
  api.get<{ baseUrl: string; url: string; token: string }>("/negotiate", { params: { groups: groups.join(",") } });
export const getSnapshot = (matchId: string, signal?: AbortSignal) =>
  api.get<Snapshot>(`/api/match/${matchId}/snapshot`, { signal, headers: { "Cache-Control": "no-store" } });
export const listMatches = () => api.get<MatchSummary[]>("/mock/matches");
```

The mock sends `Access-Control-Allow-Origin: *` on HTTP routes (`mock/overlap_mock/sinks/webpubsub.py`), so calls from
`localhost:3000` work. Later, real Azure negotiate must go through the app's own `src/app/api/negotiate/route.ts`
(managed identity, server side). Keep `negotiate()` as the single place to switch.

### 4.3 Formatting helpers (done)

**Progress (4.3 done):** four files, all pure functions. Lint and typecheck pass and they are covered by the tests in 4.4.

- `format.ts`: `formatElapsed(ms)` ("62:14.000"; minutes keep counting past 59; negative or non-numeric shows
  "00:00.000"), `formatWallTime(epochMs, withMs, timeZone?)` (24-hour, shows midnight as 00 not 24; the optional time zone
  exists so tests do not depend on the machine), `formatPhase` ("Pre-match", "Live", "Half time", "Full time") and
  `formatCount` (fixed "en" locale so server and browser print the same text and hydration cannot mismatch).
- `describe-event.ts`: `describeEvent(event, nameOf)` returns `{ title, detail, emphasis? }`, plus `playerNamer(setup)`,
  which gives names from the setup and falls back to the id (and to "" for no player). Differences from the demo, on
  purpose: titles are readable ("Take-on", "Ball recovery", "Aerial duel", "Period start"); a card says "yellow card" /
  "second yellow" / "red card"; a missing outcome no longer leaves a dangling " · ". Emphasis: `goal` (a Shot whose
  `shot_outcome` is `goal`), `yellow`, `second_yellow`, `red`, `sub`.
- `coordinates.ts`: `pitchToSvg` (x × 1.05, y × 0.68, no flip), `teamToPitch(point, attacksEast)`, `attacksEast(side,
  period)` and `PITCH_VIEW_BOX`. **`attacksEast` returns `null` for a shootout (period 5)** because CONTRACTS §1.1 gives
  no direction for it, and callers must handle that rather than guess. This is the only place that flips coordinates.
- `team-colours.ts`: `readableInk(hex)` returns `"dark"` or `"light"`, whichever has the higher contrast, plus
  `inkTextClass` / `inkFillClass` (the class names are written out in full so Tailwind sees them) and `contrastRatio`.
  It **throws a `TypeError` on a colour that is not `#RRGGBB`**, so bad data fails loudly; the setup schema already
  guarantees the format.

- `src/lib/format.ts`: `formatElapsed(ms)` → `62:14.000`, `formatWallTime(epochMs, withMs)`, `formatPhase("full_time")`
  → `Full time`, `formatCount(n)` (locale grouping).
- `src/lib/describe-event.ts`: a port of the demo's `describe()` (B6), taking a `playerName(id)` lookup. Returns
  `{ title, detail, emphasis?: "goal" | "yellow" | "second_yellow" | "red" | "sub" }` so rows can highlight goals
  and cards (the card values match the `card` field in CONTRACTS §3).
- `src/lib/coordinates.ts` (existing placeholder, the **only** flip helper):
  `pitchToSvg({x,y}) → {x: x*1.05, y: y*0.68}`; `teamToPitch({x,y}, attacksEast)` for later event plotting.
- `src/lib/team-colours.ts`: `readableInk(hex)` returns black or white text for a kit colour (by relative luminance).

### 4.4 Tests (done)

**Progress (4.4 done):** `npm test` runs **183 tests in 8 files, all passing** (about 1.5 s). `npm run test:watch` is
there too. Lint and typecheck cover the test files as well.

- **Setup:** `vitest` 5.0 with `vitest.config.mts` (the `.mts` extension avoids a Vite warning about ESM in a CommonJS
  package). It gives tests the `@/` alias and reads the two env vars **from `.env.local`** (decided: the same file `npm run
  dev` uses), through Vite's `loadEnv`, because Next's own loader skips `.env.local` when `NODE_ENV` is `test`. Values
  already set in the shell win over the file. **Without `.env.local` the tests stop at start-up** with "Copy
  web/.env.example to web/.env.local", so a fresh checkout or CI must have the file (or the two variables in the
  environment) before `npm test`. Verified: with the file all 183 pass, with it renamed away the run stops with that
  message, and a temporary test confirmed the values the tests see equal the file's. **I raised `@types/node` from ^20 to ^22:** vitest 5 would not install against 20, and CI runs Node 22
  (this machine has Node 24).
- **What is covered** (`src/lib/__tests__/`): `format.test.ts`; `describe-event.test.ts` (every one of the 18 event types, the
  three card kinds, goal and substitution emphasis, name fallbacks); `coordinates.test.ts` (corners, the attack
  directions, and CONTRACTS §4's worked example: home in period 2, team-frame (76, 10) becomes pitch-frame (24, 90));
  `team-colours.test.ts`; `cn.test.ts` (includes a test that **reads `globals.css` and checks every `--text-*` class is
  known to `cn()`**, so a new text class cannot be forgotten); `contracts.test.ts` (unknown and missing fields, each §3
  rule, setup rules, `parseEnvelope` for every kind, never throws); `env.test.ts`; `api.test.ts`.
- **`api.test.ts` uses a real fake server** (Node `http`) and closes the gap noted in 4.2: it now tests
  `invalid-response` (extra field, missing field, not a list, not JSON, wrong match id, broken setup), a bad snapshot
  envelope being counted and skipped, `http` 404 and 500, `network`, `timeout` and `aborted`, and a regression test
  that **the client sends no custom headers** (the CORS decision from 4.2).
- **Do the tests actually test?** I broke the code on purpose 8 times and ran the suite after each: the y-flip in
  `teamToPitch`, millisecond padding, the Foul rule, strict objects in the event schema, a `Cache-Control` header in the
  client, a saved shot called a goal, a text class missing from `cn()`, and the trailing-slash strip in `env.ts`. **All 8
  were caught** (1 to 6 failing tests each), and every file was restored afterwards.
- **Not in the suite:** the real mock data check from 4.1 and 4.2 (23,812 envelopes) is not a unit test, since it needs
  the mock's recorded files and the repo does not keep them. Adding a small recorded sample to `fixtures/` would change a
  hot shared folder, so it needs the owners' agreement first.
- **CI does not run the tests yet.** `.github/workflows/web.yml` runs lint, typecheck and build only. The env vars the
  tests need are already set at job level, so adding an `npm test` step is one line; that is Arnav's call (he owns
  `.github/`). Until then, run `npm test` locally (last run: 183 of 183 pass).

Add `vitest` (dev dependency, plus an `npm test` script). Unit-test `formatElapsed`, `describeEvent` (one case per
event type), the zod schemas (unknown field rejected, missing field rejected, each §3 refinement fails when broken,
unrendered kinds ignored rather than rejected) and `pitchToSvg`. The CI job doesn't run tests yet; say so in the PR
and run them locally.

### Files

`src/lib/contracts.ts`, `src/lib/api.ts`, `src/lib/format.ts`, `src/lib/describe-event.ts`, `src/lib/coordinates.ts`,
`src/lib/team-colours.ts`, `src/lib/__tests__/*.test.ts` (and `fixtures.ts`), `vitest.config.mts`.

### Done when

- [x] `npm test` passes (183 tests). Every envelope from the mock validates with zero rejections: checked on 23,812
      recorded envelopes in 4.1 and on a live snapshot in 4.2 (any rejection is reported as contract drift, not hidden by
      loosening the schema).
- [x] `getSnapshot("SYN-9001")` returns setup + envelopes from the running mock (checked in a real browser in 4.2, from the
      Next.js origin, 10 of 10 checks).

---

## Phase 5: Realtime: socket and store

**Goal:** one ingest path that behaves exactly like the demo (B1–B5, B7–B9, B11–B13, B15, B17), exposed to React
through small selector hooks. Answers `realtime.md` §1–§3.

### 5.1 `src/lib/store.ts`: external store (no extra dependency)

A plain TypeScript store outside React, read with `useSyncExternalStore`. Ingesting is cheap and constant;
**React is notified at most every 250 ms** (B11), so a 20× feed doesn't re-render per message.

```ts
type MatchState = {
  connection: { status: "connecting" | "live" | "stale" | "reconnecting" | "finished"; lastAt: number | null;
                arrivals: number[] /* timestamps, last 10 s */; rejected: number };
  match: { id: string; setup: MatchSetup | null; players: Map<string, PlayerInfo>; phase: Phase; period: number;
           score: { home: number; away: number } | null; clock: string; matchMs: number };
  counters: { messages: number; events: number; frames: number };   // live only, history excluded (B9)
  rows: { events: RingBuffer<TimelineRow>; tracking: RingBuffer<TimelineRow> };  // 600 each (B8)
  latestFrame: TrackingFrame | null;
  ui: { filter: "events" | "tracking" | "all"; paused: boolean; selectedKey: string | null };
  appliedSeq: Set<number>;                                            // dedupe (B3)
};
```

- `ingest(envelope, receivedAt | null)`: validate → drop a seen `seq` → apply by `kind` → mark dirty.
- **Pause (B13):** ingest keeps running. The store publishes two views: `live` (scoreboard, connection) always
  updates; `display` (timeline, counters, pitch) is frozen while paused and catches up on resume.
- Selector hooks: `useConnection()`, `useScoreboard()`, `useCounters()`, `useTimelineRows()` (filtered, newest 120,
  newest first), `useLatestFrame()`, `useSelectedRow()`, `useNotice()`. Each returns a stable reference when its
  slice hasn't changed, so components re-render only when their data changes.

### 5.2 `src/lib/socket.ts`: connection lifecycle

1. `negotiate([`match-${id}`])` (axios) → `url`.
2. `new WebSocket(url, "json.webpubsub.azure.v1")`. Handle `{type:"system", event:"connected"}`. Unwrap
   `{type:"message", from:"group", data}` → envelope. This is the real Web PubSub protocol, which the mock already
   speaks, so production only changes the URL.
3. **Catch-up (B2):** on open, reset, buffer live envelopes, `getSnapshot` with a 7 s abort, merge snapshot (received
   = `null`) and buffered (received = timestamp) **by `seq`**, sort ascending, ingest. If the snapshot fails, show a
   notice ("Earlier history is unavailable…") and continue live.
4. **Reconnect (B15):** on close, unless the phase is `full_time`, retry with backoff of 3 s, then 6 s, capped at 15 s,
   plus jitter. On each reconnect, the snapshot is merged again; the `seq` dedupe makes this safe.
5. **Stale (B12):** a 1 s interval marks `stale` after 10 s without data.
6. **Generation guard (B17):** each `connect()` bumps a counter, and handlers from an older generation return early.
   This also makes React StrictMode's double mount in dev harmless.

### 5.3 `src/components/live/MatchStreamProvider.tsx`

A client component. It creates the store for a `matchId`, calls `connect()` in `useEffect`, and cleans up on unmount
(close the socket, clear timers). It passes the store down through context.

### Files

`src/lib/store.ts`, `src/lib/socket.ts`, `src/lib/ring-buffer.ts`, `src/components/live/MatchStreamProvider.tsx`,
`src/lib/__tests__/store.test.ts`.

### Done when

- [ ] Store tests: duplicate `seq` ignored; history rows excluded from counters; ring buffer caps at 600 per
      category; pause freezes `display` but not `live`; resume catches up.
- [ ] With the mock running at 20×: a temporary debug page shows counters rising, and counts at full time match the
      demo's for the same run (≈ 2,171 events for `SYN-9001`).
- [ ] Kill the mock mid-match → status `reconnecting`; restart it → reconnects and history merges with no duplicate rows.

---

## Phase 6: App shell: layout, header, intro, notice, footer

**Goal:** the page frame from §1.1, responsive, with the connection badge wired to the store.
Answers part of `screens.md` (live match screen layout).

| Component | Content | Data |
|---|---|---|
| `AppShell` | `max-w-[1510px] mx-auto px-4 sm:px-5 lg:px-10`, background glow | none |
| `AppHeader` | `Logo` + "OVERLAP / Live stream" + `StatusBadge` | `useConnection()` |
| `IntroHero` | `Eyebrow` "Local match observatory", `text-display` title, caption | static |
| `SourceCard` | "Source · Mock WebSocket · localhost:8787" + explanation | `env.streamBaseUrl` |
| `NoticeBar` | `role="status" aria-live="polite"`, text throttled so screen readers are not flooded | `useNotice()` |
| `AppFooter` | "Synthetic data" + local delivery note | static |

Routing:

- `src/app/match/[id]/page.tsx` (existing placeholder): a server component that reads `params.id` and renders
  `<MatchStreamProvider matchId={id}><LiveMatchView /></MatchStreamProvider>`.
- `src/app/page.tsx` (match picker placeholder): for now, redirect to `/match/${NEXT_PUBLIC_DEFAULT_MATCH_ID}`. A real
  picker using `listMatches()` is Phase 10, optional.
- `layout.tsx`: metadata title "Overlap · Live stream", fonts. Dark only: no theme attribute or toggle.

### Files

`src/components/layout/{AppShell,AppHeader,IntroHero,SourceCard,NoticeBar,AppFooter}.tsx`,
`src/components/live/LiveMatchView.tsx`, `src/app/match/[id]/page.tsx`, `src/app/page.tsx`, `src/app/layout.tsx`.

### Done when

- [ ] `/` → `/match/SYN-9001`. The header badge goes Connecting → Live → Match finished across a full run.
- [ ] At 375 px, 768 px and 1440 px there is no horizontal scroll; the intro stacks below 680 px.

---

## Phase 7: Scoreboard and metric cards

**Goal:** the scoreboard and the four counters (B5, B10), with team colours from the setup.

**Progress (built, 18 Oct; not yet checked against the running mock):** `Scoreboard.tsx`, `scoreboard/{TeamBlock,
TeamColourBar,ScoreCenter,ScoreDisplay,MatchClock,goal}`, and `metrics/{MetricsGrid,MetricCard}` are written and
composed into `LiveMatchView` (and its loading fallback, which shows a skeleton for the match id it does not know yet).
`PhaseLabel` and `MatchIdLabel` live inside `ScoreCenter.tsx`. A goal is a rise from the score already shown
(`scoreboard/goal.ts`); `reset()` publishes an empty score before the snapshot is read, so history never flashes.
`store.ts` now exports `emptyScoreboard` and `emptyCounters` for the fallback. `scoreboard.test.ts` covers goal
detection over a real store (live goals once each, none from snapshot history or after a reconnect) and both views.
Lint, typecheck, `npm test` (17 files, 342 tests) and `npm run build` pass. Both "Done when" checks below need a run
against the mock and are **not done**.

### Scoreboard (`src/components/Scoreboard.tsx`, existing placeholder) and its parts

```
Scoreboard
├── TeamBlock side="home"   → TeamColourBar + Eyebrow "Home" + team name (text-title)
├── ScoreCenter
│   ├── PhaseLabel          → "LIVE" / "HALF TIME" / "FULL TIME" (text-eyebrow, accent-text)
│   ├── ScoreDisplay        → "1 : 0" (text-score numeric)
│   ├── MatchClock          → "62:14" (text-clock font-mono numeric)
│   └── MatchIdLabel        → "SYN-9001"
└── TeamBlock side="away"   (mirrored, right-aligned)
```

- **Team colours:** when the setup arrives, set `--team-home` / `--team-away` on the scoreboard root from
  `teams.home.colours.primary` / `teams.away.colours.primary`. The card gradient goes from home colour (≈ 15 %
  alpha) through `surface` to away colour (≈ 15 % alpha).
- **Goal moment:** when the score changes, `ScoreDisplay` flashes `primary` for 600 ms (no animation under reduced
  motion), and a visually hidden `aria-live="assertive"` region announces "Goal, Northbridge FC. 1–0." Clock ticks
  are **not** announced.
- Before setup: show "Home team" / "Away team" and "– : –" (matches the demo), with `Skeleton` bars.

### Metrics (`src/components/metrics/`)

`MetricsGrid` (4 columns, 2 below 680 px) → `MetricCard({ label, value, hint })` × 4:

| Label | Value | Hint |
|---|---|---|
| Messages received | `counters.messages` | "Since this connection" |
| Live match events | `counters.events` | "Passes, shots, fouls and more" |
| Tracking frames | `counters.frames` | "All frames received live" |
| Last message | wall time of `lastAt` or "Waiting" | "N messages / last 10 seconds" |

Values use `text-metric numeric` so digits don't jitter. They are **not** `aria-live`; they update too often.

### Files

`src/components/Scoreboard.tsx`, `src/components/scoreboard/{TeamBlock,TeamColourBar,ScoreCenter,ScoreDisplay,MatchClock}.tsx`,
`src/components/metrics/{MetricsGrid,MetricCard}.tsx`.

### Done when

- [ ] Names, kit colours, score, phase and clock match the `:8788` page side by side during the same run.
- [ ] The goal flash and announcement fire once per goal and never for history replayed from the snapshot.

---

## Phase 8: Event timeline, one component per row type

**Goal:** the main panel (B6–B9, B13, B14, B16). **Every row is its own component**, built from shared cells.

**Progress (built, 18 Oct; not yet checked against the running mock):** every file in the tree below is written under
`src/components/timeline/` (cells in `timeline/cells/`), and `LiveMatchView` now has the workspace grid with the
timeline on the left (and the same panel, controls disabled, on the loading fallback). `EventTimelinePanelView` takes
props, `EventTimelinePanel` wires it to the store. `GoalBadge` lives in `OutcomeBadge.tsx`. When a badge or card chip
shows an outcome, the matching " · …" suffix is dropped from the visible description (the accessible name keeps it).
Team tags read `--team-home` / `--team-away`, now set by `teamColourStyle()` in `src/lib/team-colours.ts` (shared with
the scoreboard). `timeline.test.ts` covers the accessible names, every row variant (goal, yellow, red and
second-yellow chips, substitution, history, selection, status, tracking) and the panel. Lint, typecheck, `npm test`
(18 files, 356 tests) and `npm run build` pass. The four "Done when" checks need a run against the mock (and the
performance check, Chrome's Performance panel) and are **not done**.

### 8.1 Component tree

```
EventTimelinePanel
├── PanelHeader            title "Event timeline" + LiveDot, subtitle, action = PauseButton
├── TimelineToolbar
│   ├── FilterTabs         SegmentedControl: Match events | Tracking | All data
│   └── RowCount           "120 shown"
├── TimelineTableHead      MATCH ELAPSED | EVENT / DETAILS | RECEIVED LOCALLY
├── NewItemsPill           "12 new ↑". Shown when the user has scrolled down and new rows arrive
├── TimelineList           role="listbox", roving tabindex, ↑/↓ moves, Enter/Space selects
│   └── TimelineRow        picks the variant by row.kind
│       ├── EventRow       ┐
│       ├── StatusRow      ├─ each = TimelineRowShell + the three cells below
│       └── TrackingRow    ┘
│           ├── MatchTimeCell     "62:14.000" + "P2 · envelope #812"
│           ├── DetailCell        title + TeamTag + description (+ EventTypeIcon, OutcomeBadge, CardChip)
│           └── ArrivalCell       "19:04:11.532" + "Live WebSocket" | "History" + "Startup snapshot"
├── TimelineEmptyState     "Waiting for messages in this category…"
└── TimelineFooter         explanation of Elapsed / Received / History / limits
```

### 8.2 Row variants

| Component | Shows | Visual emphasis |
|---|---|---|
| `TimelineRowShell` | Shared grid `112px 1fr 119px` (`80px 1fr 98px` below 680 px), hover `bg-surface-raised`, selected = `bg-secondary-soft` + 3 px left bar in `secondary`, history = 65 % opacity + "History" label | none |
| `EventRow` | `describeEvent()` title/detail, team tag, type icon | Goal: `primary` left bar + "Goal" badge. Card: a `CardChip` plus a row tint (`bg-card-yellow-soft` / `bg-card-red-soft`). Sub: on/off arrows |
| `CardChip` (a Phase 3 primitive) | `card: "yellow" \| "second_yellow" \| "red"` | Yellow = `bg-card-yellow text-card-yellow-ink` "Yellow card". Red = `bg-card-red text-card-red-ink` "Red card". Second yellow = both chips, labelled "Second yellow" |
| `StatusRow` | "Match state" + phase (+ score) | Neutral, `secondary-text` title |
| `TrackingRow` | "Position frame" + "22 players · ball (x, y)" | Muted, mono numbers |
| `EventTypeIcon` | Small SVG per event type (pass, shot, foul, card, sub, period…) | `aria-hidden`. The title text carries the meaning |
| `OutcomeBadge` | `success` / `fail` / shot outcome | Text always present, colour is secondary |

### 8.3 Behaviour details

- **Selection (B14):** clicking or pressing Enter sets `ui.selectedKey`, and the inspector freezes on that row.
  Without a selection, the inspector follows the newest event.
- **Pause (B13):** `PauseButton` toggles `ui.paused` (label "Pause feed" / "Resume feed", `aria-pressed`). While
  paused, the notice turns `accent-text`.
- **Scroll:** keep the scroll position when rows are prepended (as the demo does). If the user isn't at the top,
  show `NewItemsPill` instead of jumping.
- **Performance:** at most 120 rows, each wrapped in `React.memo` and keyed by `row.key`, so only new rows mount. No
  virtualisation needed at this size. Re-check at 20× in Phase 10.
- Height: `h-[540px]` (`610px` ≥ 1600 px, `450px` ≤ 1000 px), as in the demo.

### Files

`src/components/timeline/{EventTimelinePanel,TimelineToolbar,FilterTabs,RowCount,TimelineTableHead,NewItemsPill,
TimelineList,TimelineRow,TimelineRowShell,EventRow,StatusRow,TrackingRow,EventTypeIcon,OutcomeBadge,
TimelineEmptyState,TimelineFooter,PauseButton}.tsx` and `src/components/timeline/cells/{MatchTimeCell,DetailCell,
ArrivalCell}.tsx`. `CommentaryFeed.tsx` (existing placeholder) is the future agent-overlay feed: leave it alone.

### Done when

- [ ] All three filters show the right rows; the count updates; history rows are dimmed and labelled.
- [ ] A goal, a yellow card and a substitution each render their emphasis during a run of `SYN-9001` (the match has
      a goal, 2 yellow cards and 8 substitutions, and **no red card**). The red and second-yellow chips are checked
      on `/dev/ui` and in a unit test with a hand-written event, not in the live run.
- [ ] The timeline is fully usable by keyboard alone; a screen reader reads "Shot, Northbridge FC, … saved, at 62:14".
- [ ] No dropped frames you can see while scrolling at 20× (Chrome Performance panel: no long tasks > 50 ms during ingest).

---

## Phase 9: Live pitch and message inspector

**Goal:** the right-hand column (B7, B14). Answers `charts.md` for `LivePitch`.

### 9.1 `src/components/charts/LivePitch.tsx` (existing placeholder): SVG, not canvas

```
LivePositionsPanel
├── PanelHeader     "Live positions", "Latest received tracking frame", action = PitchTimestamp (mono)
├── LivePitch       <svg viewBox="0 0 105 68" role="img" aria-label="Positions at 62:14">
│   ├── PitchMarkings   light grey surface with lighter stripes, DARK grey boundary and line markings: outline,
│   │                   halfway line, centre circle r 9.15, penalty areas 16.5 × 40.32, goal areas 5.5 × 18.32,
│   │                   penalty spots at 11 m, goals. All in metres
│   ├── PlayerMarker ×22  circle r≈1.5 filled with the kit primary, with a dark `pitch-marker-edge` outline,
│   │                   shirt number in readableInk(), <title> = name
│   └── BallMarker        r≈0.8, near-black fill with a white ring (white alone vanishes on a light pitch), drawn last
├── PitchLegend     ● Northbridge FC  ● Harbour Athletic  ● Ball (real names, not just "Home/Away")
└── PitchNote       bundling explanation (from the demo)
```

- Positions go through `pitchToSvg()` from `src/lib/coordinates.ts`. Tracking is already in the pitch frame:
  **no flips**.
- **Pitch colours (decided: lighter grey pitch, dark grey boundaries):** surface `bg-pitch-surface` (`greys-300`),
  alternate stripes `bg-pitch-stripe` (`greys-200`), and the outline and all markings in `stroke-pitch-line`
  (`greys-700`, about 6.2:1 on the surface), instead of the demo's teal-green. Markers get a dark
  `pitch-marker-edge` outline because orange and blue kit fills are only 1.6:1 and 2.4:1 against this grey.
  Stroke width ≈ 0.25 units (about 26 cm at pitch scale), so lines stay visible at phone width.
  *Interpretation:* I read your note as "lighter grey for the pitch itself, dark grey for the boundaries". If you
  meant the panel borders around the pitch instead, say so; it is a token swap (`--line`).
- **Motion:** each `PlayerMarker` is a `<g>` moved with `transform` and a CSS `transition: transform 200ms linear`,
  so the 1 msg/s bundles look smooth. The transition is off under `prefers-reduced-motion`. Optional stretch goal:
  play the 5 frames in each bundle out over 1 s / speed, instead of jumping to the newest (CONTRACTS §4: "the browser
  tweens").
- `PlayerMarker` and `PitchMarkings` are memoised; markings never re-render.

### 9.2 Message inspector

```
MessageInspectorPanel
├── PanelHeader   "Message inspector", label "Shot · elapsed 62:14.000 · 19:04:11.532", action = "Follow latest"
├── JsonViewer    <pre> with syntax colours (keys blue-300, strings orange-200, numbers greys-100) via a
│                 ~40-line tokenizer, no dependency; max-height + scroll
├── CopyButton    copies the JSON; "Copied" toast with role="status"
└── InspectorFooter "N messages rejected by contract validation" (Phase 4), hidden when 0
```

### Files

`src/components/charts/LivePitch.tsx`, `src/components/charts/pitch/{PitchMarkings,PlayerMarker,BallMarker,PitchLegend}.tsx`,
`src/components/live/LivePositionsPanel.tsx`, `src/components/inspector/{MessageInspectorPanel,JsonViewer,CopyButton}.tsx`.

### Done when

- [ ] Sanity check from CONTRACTS §1.1: in period 1 the home left winger (shirt 11) appears near the **top**
      of the pitch while home attacks east (right).
- [ ] The pitch updates during the match and freezes when paused; the timestamp matches the newest tracking row.
- [ ] Selecting a row shows its exact payload; "Follow latest" resumes following.

---

## Phase 10: Composition, responsive layout, accessibility and QA

**Goal:** match the `:8788` result, then finish the polish. Close the spec gaps.

1. **`LiveMatchView`:** compose shell → scoreboard → metrics → `grid-cols-[minmax(0,1.65fr)_minmax(340px,1fr)]`
   workspace (timeline | pitch + inspector), with the demo's breakpoints (§1.1).
2. **States:** loading (skeletons before the first message), mock not running ("Cannot reach the mock. Keep its
   terminal running with --web on port 8787."), snapshot failed, stale, reconnecting, full time. The demo's notice
   text is reused where it fits.
3. **Accessibility pass** (`design-system.md` §5):
   - keyboard: header → filters → timeline listbox → pause → inspector buttons, all reachable, with visible focus;
   - one `h1`, panel `h2`s, landmarks (`header`, `main`, `aside`, `footer`);
   - screen-reader text for the badge, goal announcements and row labels;
   - contrast checked against §2.4; reduced motion honoured everywhere.
4. **Theme:** dark only (decided). Record "dark theme only; light theme out of scope" in `design-system.md` §1, so
   nobody adds a toggle by accident. No `ThemeToggle`, no `localStorage` theme, no `data-theme` attribute.
5. **Optional match picker** (`src/app/page.tsx`): list `listMatches()` from the mock (phase, score, clock), each
   linking to `/match/[id]`. Replaces the redirect.
6. **Performance at 20×:** React Profiler: the timeline commit is ≤ 1 per 250 ms tick, and there are no long tasks
   > 50 ms. Memory is stable over a full match (the ring buffers hold).
7. **Side-by-side QA:** run the mock with both viewers open (`:8788` and `:3000`) and tick every row of the behaviour
   inventory (§1.2 B1–B17).
8. **Docs:** update `web/README.md` (run steps, the component map) and fill the remaining spec answers; set each spec's
   `Status` honestly.

### Done when

- [ ] B1–B17 all observed on `/match/SYN-9001` during one full run at 20×.
- [ ] Lint, typecheck, build and `npm test` pass. A Lighthouse accessibility audit has no contrast or label failures.
- [ ] Screenshots for the PR (invented clubs only) at 375 px and 1440 px.

---

## Appendix A: Final file map

```
web/
├── package.json · tsconfig.json · next.config.ts · postcss.config.mjs · eslint.config.mjs · vitest.config.ts
├── .env.example
└── src/
    ├── app/
    │   ├── layout.tsx · globals.css · page.tsx (redirect / picker)
    │   ├── match/[id]/page.tsx
    │   └── dev/ui/page.tsx                      (dev only)
    ├── components/
    │   ├── ui/          Button SegmentedControl StatusBadge LiveDot Tag CardChip Eyebrow Panel PanelHeader Card
    │   │                EmptyState Skeleton VisuallyHidden Logo
    │   ├── layout/      AppShell AppHeader IntroHero SourceCard NoticeBar AppFooter
    │   ├── live/        MatchStreamProvider LiveMatchView LivePositionsPanel
    │   ├── Scoreboard.tsx + scoreboard/  TeamBlock TeamColourBar ScoreCenter ScoreDisplay MatchClock
    │   ├── metrics/     MetricsGrid MetricCard
    │   ├── timeline/    EventTimelinePanel TimelineToolbar FilterTabs RowCount TimelineTableHead NewItemsPill
    │   │                TimelineList TimelineRow TimelineRowShell EventRow StatusRow TrackingRow EventTypeIcon
    │   │                OutcomeBadge TimelineEmptyState TimelineFooter PauseButton
    │   │                cells/ MatchTimeCell DetailCell ArrivalCell
    │   ├── charts/      LivePitch.tsx + pitch/ PitchMarkings PlayerMarker BallMarker PitchLegend
    │   └── inspector/   MessageInspectorPanel JsonViewer CopyButton
    └── lib/
        env.ts cn.ts api.ts contracts.ts coordinates.ts format.ts describe-event.ts team-colours.ts
        ring-buffer.ts store.ts socket.ts  __tests__/
```

Existing placeholders **not** touched by this plan: `CommentaryFeed`, `MomentCard`, `AgentTrace`, `ViewerControls`,
the other charts, `overlay-scheduler.ts`, `preferences.ts`, `visuals.ts`, the recap, replay and how-it-works pages,
and the API routes beyond build-safe stubs.

## Appendix B: Decisions

### Decided (your answers)

| # | Decision | Outcome |
|---|---|---|
| 1 | Yellow and red for card chips | Added as Tailwind classes: `card-yellow` `#facc15`, `card-red` `#dc2626`, plus ink, soft-tint and red-text variants (Phase 2.2). Hex values are my picks, since none were given |
| 2 | Pitch colours | Lighter grey pitch (`greys-300`, stripes `greys-200`) with dark grey boundaries (`greys-700`) and dark marker outlines (Phase 2.2, Phase 9) |
| 3 | `zod` for strict validation | Yes: schemas in Phase 4, derived types, `strictObject`, contract rules as refinements |
| 4 | Light theme | Out of scope. Dark only; no toggle |

### Still open

| # | Decision | Default in this plan |
|---|---|---|
| 5 | Tween the 5 buffered frames or show the newest | Newest + CSS transition; tweening is a stretch goal |
| 6 | `status` / `positions` shapes are mock-provisional | Typed as PROVISIONAL; promote when CONTRACTS.md defines them |
| 7 | Browser negotiates with the mock directly vs through `/api/negotiate` | Direct for the mock; route handler when Azure lands |
| 8 | Pitch colour reading in decision 2 (see Phase 9) | Pitch surface light grey, boundaries dark grey; panel borders stay `--line` |
