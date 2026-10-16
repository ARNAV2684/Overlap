# Charts spec

> **Status: draft for review.** Answers §1 for what the live pitch needs and §2 for **`LivePitch` only**. The other seven
> charts, the overlay-driven rules (`window`, `highlight`) and §3 are **not started**. `LivePitch` is *planned*
> (milestone M5 of [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md)); only the
> coordinate helper it relies on exists today, on `web/live-match-ui-setup` (not on `main` yet). Nothing here is agreed
> until this PR is approved.

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

### Live pitch (`src/components/charts/LivePitch.tsx`, *planned*)

- **Data source:** `latestFrame` from the match store (`realtime.md` §2) and the players from the setup. It reads no
  overlay and takes no `window` or `highlight`.
- **Props (summary):** the newest tracking frame or `null`, the players (name, shirt, side), the two clubs' names and
  primary colours, and an `aria-label` time such as "Positions at 62:14".
- **Drawing (all in metres):**
  - Surface `pitch-surface` with lighter stripes `pitch-stripe`; outline and markings in `pitch-line` (about 6.2 : 1 on the
    surface), stroke about 0.25 so lines stay visible at phone width.
  - Outline, halfway line, centre circle (radius 9.15), penalty areas (16.5 × 40.32), goal areas (5.5 × 18.32), penalty
    spots at 11 m and the goals.
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

### Momentum tide, shot map, pass network, pressing zones, heatmap zones, stat bars, key events

Not started.

## 3. Details on demand

- Docked detail panel or reader rather than floating tooltips?

_Answer:_

Not started.
