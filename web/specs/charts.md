# Charts spec

> **Status: merged for review in #19 (16 Oct); not yet marked agreed.** Answers §1 for what the live pitch needs and §2
> for **`LivePitch`** and, for review with
> [`PLAN_web_stat-charts`](../../plans/active/PLAN_web_stat-charts.md) (22 Oct), the five charts fed by stat panels
> and §3 for them. The shot map, key events and the overlay-driven rules (`window`, `highlight`) are **not started**. `LivePitch` is built on `web/live-api` and checked with unit tests and an end-to-end run against the mock; not on `main` yet (milestone M5 of
> [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md)).

Decides each chart component's inputs and behaviour.

## 1. Shared rules

- Every chart accepts `window` and `highlight` (CONTRACTS.md §6). What else is shared?
- Pitch frame to SVG mapping (CONTRACTS.md §1.1).

_Answer:_

- **Pitch frame to SVG:** tracking positions are already in the pitch frame (`x`: 0 west to 100 east; `y`: 0 north to 100
  south). The SVG uses `viewBox="0 0 105 68"` (metres), and `svg_x = x × 1.05`, `svg_y = y × 0.68`, with **no flips**.
  Every conversion goes through `src/lib/coordinates.ts` (`pitchToSvg`); nothing else may flip a coordinate.
- **Team frame to pitch frame** (events, for later charts): `teamToPitch(point, attacksEast)`, with `attacksEast(side,
  period)` true for home in periods 1 and 3 and false in 2 and 4 (away is the opposite). It returns `null` for period 5
  (shootout): `CONTRACTS.md` §1.1 gives no direction there, so callers must handle `null` and never guess.
- **Sanity check:** a left winger has a small team-frame `y`; attacking east, he renders near the top of the screen.
- **Colours:** chart graphics use semantic tokens (`design-system.md`); club colours come from the match setup and are
  always paired with the club name or id as text; kit fills on the light pitch always get the dark marker outline.
- **Accessibility:** each chart is an SVG with `role="img"` and an `aria-label` that says what it shows and when; decorative
  parts are `aria-hidden`; information carried by colour is also carried by text.
- **Not decided:** the exact `window` and `highlight` semantics for the overlay charts (they depend on overlays, which this
  change does not cover).

## 2. Per chart

- For each chart (live pitch, momentum tide, shot map, pass network, pressing zones, heatmap zones, stat bars, key events): props, data source, interactions and empty state.

_Answer:_

### Live pitch (`src/components/charts/LivePitch.tsx`, built)

- **Data source:** `latestFrame` from the match store (`realtime.md` §2) and the players from the setup. It reads no
  overlay and takes no `window` or `highlight`.
- **Props (summary):** the newest tracking frame or `null`, the players (name, shirt, side), the two clubs' names and
  primary colours, and an `aria-label` time such as "Positions at 62:14".
- **Drawing (all in metres):**
  - Surface `pitch-surface` with lighter stripes `pitch-stripe`; outline and markings in `pitch-line` (about 6.2 : 1 on the
    surface), stroke about 0.25 so lines stay visible at phone width.
  - Outline, halfway line, centre circle (radius 9.15) and spot, penalty areas (16.5 × 40.32) and arcs, goal areas
    (5.5 × 18.32), penalty spots at 11 m and the goals. The goals sit just outside the goal lines, so the SVG does not
    clip and sits in a padded `pitch-surface` box.
  - Before the setup arrives, markers are grey and named by player id, without numbers.
  - 22 player markers: a circle (radius about 1.5) filled with the club's primary colour, a dark `pitch-marker-edge`
    outline, the shirt number in `readableInk(colour)`, and the player's name as the `<title>`.
  - The ball: radius about 0.8, near-black with a white ring (white alone vanishes on the light pitch), drawn last.
- **Legend and note:** a legend with the real (invented) club names and "Ball", and a short note that positions arrive
  bundled about once a second.
- **Motion:** each marker is a `<g>` moved with `transform` and a 200 ms linear CSS transition, off under reduced motion.
  The newest frame is shown (not tweened through the bundle's five frames); tweening is an optional stretch goal
  (`CONTRACTS.md` §4 says the browser tweens). `PitchMarkings` and markers are memoised; the markings never re-render.
- **Interactions:** none beyond the accessible names. It freezes while the feed is paused.
- **Empty state:** before the first frame, the empty pitch with markings and a "Waiting for the first position frame"
  message, with no markers.
- **Panel header:** "Live positions", subtitle "Latest received tracking frame", and the frame's elapsed time in mono type.

### Charts fed by stat panels (stat bars, momentum tide, pass network, pressing zones, heatmap zones)

Plan: [`PLAN_web_stat-charts`](../../plans/active/PLAN_web_stat-charts.md). Shared rules for these five:

- **Data source:** the store's `stats` slice (`realtime.md` §2): `latest`, the panel with the greatest `match_ms`, and
  `heavy`, the greatest one that carries a `heavy` block (`CONTRACTS.md` §7.4; shapes in `stats/specs/publishing.md`
  §2). It is a display slice, so the charts freeze while the feed is paused. Live and replay feed it the same way.
- **No numbers are computed here.** The charts only choose the newest panel, scale values for drawing (bar shares,
  bar heights, cell shading, node sizes) and sum counts for the accessible summaries.
- **`null` means "not enough data"** (`low_sample`): the value is replaced by the words "Not enough data" and no bar
  is drawn for that row. It is never shown as zero.
- **Team-frame charts** (pass network, pressing zones, heatmap zones) hold whole-match data from both halves, so they
  are drawn in the team's own frame, attacking left to right, through `teamToPitch(point, true)` and `pitchToSvg`,
  with an "Attacking →" caption. Small team-frame `y` (the team's left) is at the top. One team at a time.
- **Colours:** team graphics use the setup's kit colours through `--team-home` / `--team-away`, always beside the club
  name; zone shading uses `primary` with an opacity scaled to the busiest cell; pitch surface and markings are
  `LivePitch`'s.
- **Accessibility:** stat bars are a table (the numbers are the content); the other four are SVGs with `role="img"`
  and an `aria-label` that summarises them (below). Every bar, cell and node also has a `<title>` with its numbers.
- **No `window` or `highlight` yet:** they come with overlays (card work); these charts always show the whole match.

### Stat bars (`src/components/charts/StatBars.tsx`)

- **Props:** `panel` (the latest panel or `null`), `home` / `away` club names.
- **Rows** (both teams, from `panel.teams`): possession (%), shots, shots on target, xG (2 decimals), passes, pass
  completion (%), momentum share in the last 10 minutes (%), PPDA in the last 10 minutes (1 decimal), pressures per
  opponent pass in the last 10 minutes (2 decimals), press height in the last 10 minutes (metres).
- **Bars:** the "more is more" rows (possession to momentum share) get one split bar: the home share of the two values
  from the left in the home colour, the rest in the away colour. PPDA, pressures per pass and press height are shown as
  numbers only, with the hint "lower PPDA = more pressing", because a split bar would read as "more is better". No bar
  when either side is `null` or both are 0.
- **Table:** caption "Team stats at <clock>", a column per team, row headers for the stats. Bars are `aria-hidden`.
- **Empty state:** "Waiting for the first stat panel."

### Momentum tide (`src/components/charts/MomentumTide.tsx`)

- **Props:** `buckets` (from `tideSeries(latest, heavy)`: the heavy panel's `momentum_buckets`, with the latest light
  panel's `momentum` replacing the bucket it names, so the current bucket moves every second), club names.
- **Drawing:** one column per 5-minute bucket, the halves side by side with a gap and a "1st half" / "2nd half" label;
  home weighted points as a bar up from the centre line, away down; heights scaled to the largest value so far.
  `<title>` per bucket: "1st half 10–15′: Northbridge 9.5, Harbour 3.0".
- **Label:** "Momentum by 5-minute spell. Latest spell: Northbridge 9.5, Harbour 3.0."
- **Empty state:** "Waiting for the first stat panel."

### Pass network (`src/components/charts/PassNetwork.tsx`)

- **Props:** `network` (`heavy.pass_network[side]` or `null`), `players` (names and shirts), the club's name and colour.
- **Drawing:** a link per `{from, to, count}` (count ≥ 3, as sent), stroke width and opacity scaled to the busiest
  link; a node per player at the mean pass-start position, radius scaled to the square root of `passes`, in the kit
  colour with the dark marker edge and the shirt number. Starting XI until the team's first substitution (the
  stats engine's rule), said in the caption.
- **Label:** "Pass network, Northbridge: 11 players, 14 links of 3 or more passes. Most passes: Nora 11 (42)."

### Pressing zones (`src/components/charts/PressingZones.tsx`)

- **Props:** `grid` (`heavy.pressing_grid[side]`, sent as `[col][row]`: 9 columns from the team's own goal, 6 rows
  from its left) or `null`, the club's name.
- **Drawing:** 54 cells over the pitch, shaded by count relative to the busiest cell; empty cells transparent.
- **Label:** "Pressing actions, Northbridge: 120 in total. 35 in the attacking third, 60 in the middle third, 25 in
  their own third."

### Heatmap zones (`src/components/charts/HeatmapZones.tsx`)

- **Props:** `zones` (`heavy.zones[side]`, sent as `[channel][col]`: 3 channels from the team's left, 6 columns from
  its own goal) or `null`, the club's name.
- **Drawing:** 18 cells, shaded as above. Shown under the tab name "Touches".
- **Label:** "Touches, Northbridge: 640 in total. 180 in the attacking third, … Busiest channel: left."

### Where they sit

The "Match stats" section (`screens.md`): stat bars beside the momentum tide, then one pitch panel with tabs "Pass
network", "Pressing" and "Touches" and a team switch (the two club names). Before the first heavy panel (the first
match minute) the pitch panel and the tide say "First update at the end of the first minute" over the empty pitch.

### Shot map, key events

Not started. The shot map needs each shot's xG, which no panel carries yet (`heavy.shots`, requested in
`PLAN_stats_engine`'s review); key events are drawn from events, not panels.

## 3. Details on demand

- Docked detail panel or reader rather than floating tooltips?

_Answer:_

- **For the stat-panel charts:** no floating tooltips. Every bar, cell and node has a `<title>` (hover on a mouse,
  read by screen readers), and every chart has a full accessible summary. A docked detail panel is not decided; it
  will be settled with the overlay cards, which are the main "details on demand" use.
