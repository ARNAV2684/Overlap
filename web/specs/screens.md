# Screens spec

> **Status: merged for review in #19 (16 Oct); not yet marked agreed.** Answers §1 for the **live match screen** and the
> **match picker**, and adds §5 (checks for the live screen). §1 for recap, replay and how-it-works, and §2 to §4, are
> **not started** and out of scope. Every part of the live screen and the picker is built on `web/live-api` and checked with unit tests and an end-to-end run against the mock; not on `main` yet (milestones M4 and
> M5 of [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md)).

Decides every page and what each viewer mode shows.

## 1. Pages

- What is on the match picker, live screen, recap, replay and how-it-works pages?

_Answer:_

- **Match picker (`/`):** the matches the stream server is playing (`GET /mock/matches`, a provisional mock endpoint),
  each as a card with its id, phase, score and clock linking to `/match/<id>`, refreshed every 5 s. The header badge says
  "Stream online" or "Stream offline". Skeleton cards while loading. If the server cannot be reached, or plays nothing,
  the page says so and still links to `/match/<NEXT_PUBLIC_DEFAULT_MATCH_ID>` (`SYN-9001` locally). It replaced the
  earlier redirect.
- **Live screen (`/match/[id]`):** the id must look like `SYN-NNNN`, otherwise the not-found page shows. Top to bottom:
  1. **Header** (`<header>`, banner landmark): the Overlap logo, "/ Live stream" (hidden below 640 px) and the
     connection badge: Connecting, Live, No recent data, Reconnecting or Match finished, always as words and an icon.
  2. **`<main>`**, holding:
     - the **intro**: eyebrow "Local match observatory", the page's only `h1` "Watch the data move.", one line of
       explanation, and the **source card** ("Mock WebSocket · host:port") so the local mock is never mistaken for the
       Azure pipeline. Side by side from 680 px, stacked below;
     - the **notice line**: what the stream is doing (connecting, history unavailable, connection lost, paused, stale,
       full time); warnings in accent text with an icon; announced to screen readers through a live region throttled
       to at most once every 3 s, and not when only a number changes (`design-system.md` §5);
     - **scoreboard**: home block, centre block, away block (below);
     - **four counters**;
     - **workspace**: the event timeline on the left; the live pitch and message inspector on the right, in an
       `aside` landmark named "Positions and message inspector".
  3. **Footer** (`<footer>`, contentinfo landmark): "Synthetic data · invented clubs and players" and a delivery note.
- The frame renders first in its starting state (badge Connecting, the connecting notice, not announced) as the
  prerendered static shell, so nothing jumps when the live screen takes over. `params` is read inside `Suspense`
  because of Next.js Cache Components.
- **Layout:** one column below 1000 px; from 1000 px the workspace is two columns (timeline about 1.65 fr, pitch and
  inspector at least 340 px). Metric cards use four columns, two below 680 px. Widths and padding are in
  `design-system.md` §3.

### Scoreboard

- Home block (colour bar from the setup, eyebrow "Home", club name), centre block (phase label "LIVE", "HALF TIME" or
  "FULL TIME"; score such as "1 : 0"; clock such as "62:14"; match id), away block (mirrored, right-aligned).
- Team colours: `--team-home` and `--team-away` are set from `teams.home.colours.primary` and
  `teams.away.colours.primary`; the card gradient runs from the home colour (about 15 %) through `surface` to the away
  colour. Before the setup arrives: "Home team", "Away team", "– : –" and skeleton bars.
- **Goal moment:** when the score changes, the score flashes `primary` for 600 ms (none under reduced motion) and a
  visually hidden assertive live region announces "Goal, <club>. 1–0." once per goal and never for history replayed
  from the snapshot. Clock ticks are not announced.

### Counters

Four cards, values with `text-metric numeric`, not live regions (they change too often):

| Label | Value | Hint |
|---|---|---|
| Messages received | live envelopes this connection | "Since this connection" |
| Live match events | live events | "Passes, shots, fouls and more" |
| Tracking frames | live frames | "All frames received live" |
| Last message | wall time of the latest message, or "Waiting" | "N messages / last 10 seconds" |

### Event timeline

- **Parts:** header ("Event timeline", live dot, pause button), toolbar (filter tabs "Match events", "Tracking",
  "All data", and a row count), table head (MATCH ELAPSED, EVENT / DETAILS, RECEIVED LOCALLY), a "N new ↑" pill when the
  user has scrolled down and new rows arrive, the list, an empty state ("Waiting for messages in this category…") and a
  footer explaining Elapsed, Received, History and limits.
- **One component per row type**, built from shared cells: `EventRow`, `StatusRow`, `TrackingRow`; cells `MatchTimeCell`
  (elapsed time and period), `DetailCell` (title, team tag, description, icon, outcome badge, card chip) and
  `ArrivalCell` (local time and "Live WebSocket", or "History" and "Startup snapshot").
- **Emphasis:** a goal gets a `primary` left bar and a "Goal" badge; a card gets its chip and a row tint; a substitution
  shows on and off arrows. Selected rows use `secondary-soft` and a 3 px `secondary` left bar; history rows are dimmed
  to 65 % and labelled.
- **Behaviour:** newest first, at most 120 rows, each memoised and keyed by its row key; the scroll position is kept when
  rows are prepended; the list is a `role="listbox"` with a roving tabindex (arrows move, Enter or Space selects).
  Selecting a row freezes the inspector on it. The pause button sets `aria-pressed` and freezes the timeline, counters
  and pitch while reception and the scoreboard continue. The timeline panel is about 540 px tall (610 px from 1600 px,
  450 px at 1000 px and below).

### Live pitch and message inspector

- The pitch panel is specified in `charts.md`. The **message inspector** shows the selected (or newest) envelope as
  syntax-coloured JSON in a scrolling `<pre>`, a copy button ("Copied" announced politely), a "Follow latest" action, and a
  footer "N messages rejected by contract validation" shown only when N is above 0.
- **Recap, replay, how-it-works:** not decided yet.

## 2. Viewer modes

- Exactly which panels and charts appear in casual, analyst and player-focus modes?

_Answer:_

Not started. The live screen has no viewer modes yet.

## 3. Preferences

- How are mode, language, favourite club and followed player chosen and remembered?

_Answer:_

Not started.

## 4. Judges' path

- What does a judge see first, and how do they reach replay and the agent trace?

_Answer:_

Not started.

## 5. Checks for the live screen

- How is the live screen checked before review?

_Answer:_

- `npm run lint`, `npm run typecheck`, `npm run build` and `npm test` pass in `web/` (commands and setup in
  `realtime.md` §6).
- Component checks (Vitest): the frame renders the same text before and after the store exists; a goal flash and
  announcement fire once per goal and never for history; the notice announcer is throttled.
- A manual run of `SYN-9001` against the mock at 20×: names, kit colours, score, phase and clock match the temporary
  `mock/single-match-demo` page for the same run; the badge goes Connecting, Live, Match finished; stopping and
  restarting the mock shows Reconnecting and then Live with no duplicate rows.
- Keyboard-only pass over header, filters, timeline, pause and inspector, with visible focus; a screen-reader pass for the
  badge, goal announcement and row labels.
- No horizontal scroll at 375 px, 768 px and 1440 px; screenshots at 375 px and 1440 px use invented clubs only.
