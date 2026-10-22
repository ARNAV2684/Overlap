# Screens spec

> **Status: merged for review in #19 (16 Oct); not yet marked agreed.** Answers §1 for the **live match screen** and the
> **match picker**, and adds §5 (checks for the live screen). The **replay screen** in §1 is **written for review**
> (20 Oct) for [`PLAN_web_replay`](../../plans/active/PLAN_web_replay.md); no replay code exists yet. §1 for recap and
> how-it-works, and §2 to §4, are **not started**. The **match stats** section of the live and replay screens is
> **written for review** (22 Oct) for [`PLAN_web_stat-charts`](../../plans/active/PLAN_web_stat-charts.md). The picker's move from the mock's list to the match archive
> (`/api/matches`) is **written for review** (22 Oct) for
> [`PLAN_web_match-list`](../../plans/active/PLAN_web_match-list.md). The live screen and the picker are on `main` (#48), checked with unit
> tests and an end-to-end run against the mock (milestones M4 and M5 of
> [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md)).

Decides every page and what each viewer mode shows.

## 1. Pages

- What is on the match picker, live screen, recap, replay and how-it-works pages?

_Answer:_

- **Match picker (`/`):** the matches in the match archive, live and finished (`GET /api/matches`, `realtime.md` §5.3),
  refreshed every 5 s. Header section "Matches"; the badge says "Archive online" or "Archive offline". Each match is a
  card with both clubs' names, its id, its phase, score and clock:
  - a **live** match links to `/match/<id>` ("Watch live"); before the stats engine's first numbers it shows
    "Waiting", "– : –" and "–:–";
  - a **finished** match shows "Full time" and the archived score, no clock, and links to `/replay/<id>`
    ("Watch replay").

  The card's accessible name reads like "Northbridge FC 1, Harbour Athletic 0, SYN-0505, live, 62:14. Watch live".
  Skeleton cards while loading. The page says why when there is no list and still links to
  `/match/<NEXT_PUBLIC_DEFAULT_MATCH_ID>` (`SYN-9001` locally): `matches_unavailable` → "The match list isn't set up:
  add the archive settings to web/.env.local (see web/.env.example)."; any other failure → "Can't read the match
  archive. Is the local stack running?"; an empty archive → "No match in the archive yet. Start one with the
  generator." It replaced the earlier redirect.
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
     - **match stats** (below);
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

### Match stats

- **A section between the counters and the workspace**, fed by the stats engine's panels (`charts.md`, "Charts fed by
  stat panels"). Two panels side by side from 1000 px (stat bars about 1 fr, momentum tide about 1.2 fr), stacked
  below; then a full-width pitch panel.
- **Stat bars panel:** heading "Team stats", subtitle "Every match second" and the panel's clock in mono type.
- **Momentum panel:** heading "Momentum", subtitle "Weighted actions per 5-minute spell".
- **Pitch panel:** heading "Team shape", subtitle "Every match minute · starting XI for the pass network" and the
  heavy panel's clock; a toolbar with two segmented controls, the chart ("Pass network", "Pressing", "Touches") and
  the team (the two club names); the chart below, at most about 720 px wide, centred. Each control is a radio group
  with its own name ("Team shape chart", "Team").
- **States:** before any panel, every panel says "Waiting for the first stat panel."; before the first heavy panel,
  the tide and pitch panel say "First update at the end of the first minute". `null` values read "Not enough data".
  The section freezes with the rest of the display while the feed is paused.
- **Replay:** the same section, fed by the replay player's archived panels.

### Live pitch and message inspector

- The pitch panel is specified in `charts.md`. The **message inspector** shows the selected (or newest) envelope as
  syntax-coloured JSON in a scrolling `<pre>`, a copy button ("Copied" announced politely), a "Follow latest" action, and a
  footer "N messages rejected by contract validation" shown only when N is above 0.

### Replay screen (`/replay/[id]`)

Plan: [`PLAN_web_replay`](../../plans/active/PLAN_web_replay.md); data and playback in `realtime.md` §5.

- The id must look like `SYN-NNNN`, otherwise the not-found page shows.
- **The live screen's frame and panels**, top to bottom, with these differences:
  1. **Header:** "/ Replay" in place of "/ Live stream". The badge reads "Loading" while the manifest loads,
     "Replay · 20×" (the current speed) while playing, "Paused" when paused, and "Replay finished" at the end, always
     as words and an icon.
  2. **Intro:** eyebrow "Match archive", the page's only `h1` "Replay a finished match.", one line naming the two
     clubs and the final score once the manifest has loaded, and a **source card** "Match archive · stored by the
     archiver" so a replay is never mistaken for a live match.
  3. **Replay controls**, a toolbar (`role="toolbar"`, named "Replay controls") between the notice line and the
     scoreboard:
     - **Play / Pause:** one button whose accessible name says what it does ("Play" or "Pause"). After the end it
       reads "Replay again".
     - **Speed:** three buttons "1×", "5×" and "20×" with `aria-pressed`, accessible names "Speed 1×" and so on.
       Default 20×.
     - **Progress:** the playhead's clock and the full-time clock ("62:14 / 90+5:31") in `numeric` text, and a
       read-only progress bar (`role="progressbar"`, value in percent of `duration_ms`). It is not a seek control.
     - Touch targets about 44 px on phones; the toolbar wraps below 680 px.
  4. **Notice line** messages: "Loading the replay…", "Replaying from the match archive." (while playing),
     "Buffering…", "Replay data unavailable." (with a Retry button in the toolbar), "Replay finished.", "This replay
     can't be shown." (with the message card below), plus the live screen's paused and resumed messages for the
     timeline's "pause feed" button.
  5. **Scoreboard, counters, match stats, timeline, pitch and inspector** as on the live screen, fed by the replay player. Timeline
     rows read "Replay · archive" (or "Replay · bundled frame") in the arrival column. The goal flash and announcement
     fire when the playhead reaches a goal.
- **States:** before the manifest arrives, the live screen's loading fallback with the replay header and the notice
  "Loading the replay…". If the manifest fails, the scoreboard and workspace are replaced by one message card:
  - `not_found`: "No archived match SYN-NNNN." with a link to `/`;
  - `not_finished`: "SYN-NNNN is still being played." with a link to `/match/<id>`;
  - `not_ready`: "SYN-NNNN has no setup in the archive yet.";
  - `replay_unavailable`, `storage_error` or a network error: "The match archive can't be reached." with a Retry
    button.
- **Layout and accessibility:** the live screen's breakpoints and landmarks. The toolbar is reachable by keyboard
  between the notice line and the scoreboard; focus stays on Play / Pause when its name changes. Under reduced motion
  the progress bar doesn't animate.
- **Jump to a minute and the list of archived matches** are optional (plan M4) and will be specified here if built.
- **Recap, how-it-works:** not decided yet.

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
