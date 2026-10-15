# Screens spec

> **Status: in progress.** §1 is answered for the match picker (redirect only) and the live screen's frame
> (`web/IMPLEMENTATION_PLAN.md` Phase 6). §1 for recap, replay and how-it-works, and §2 to §4, are not started.

Decides every page and what each viewer mode shows.

## 1. Pages

- What is on the match picker, live screen, recap, replay and how-it-works pages?

_Answer:_

- **Match picker (`/`):** for now a 307 redirect to `/match/<NEXT_PUBLIC_DEFAULT_MATCH_ID>` (`SYN-9001` locally). A real
  list of the stream's matches (phase, score, clock, each linking to its live screen) is optional, in Phase 10.
- **Live screen (`/match/[id]`):** the id must look like `SYN-NNNN`, otherwise the not-found page shows. Top to bottom:
  1. **Header** (`<header>`, banner landmark): the Overlap logo, "/ Live stream" (hidden below 640 px), and the connection
     badge: Connecting, Live, No recent data, Reconnecting or Match finished, always as words and an icon, never colour
     alone, announced politely.
  2. **`<main>`**, holding:
     - the **intro**: eyebrow "Local match observatory", the page's only `h1` "Watch the data move.", one line of
       explanation, and the **source card** ("Mock WebSocket · <host:port>") so the local mock is never mistaken for the
       Azure pipeline. Side by side from 680 px, stacked below;
     - the **notice line**: what the stream is doing (connecting, history unavailable, connection lost, paused, stale,
       full time); warnings in accent text with an icon. Screen readers hear it through a throttled live region: at most
       once every 3 s, and not when only a number changes;
     - then, in later phases: the scoreboard and metric cards (Phase 7), the event timeline (Phase 8), and the live pitch
       and message inspector (Phase 9).
  3. **Footer** (`<footer>`, contentinfo landmark): "Synthetic data · invented clubs and players" and the delivery note.

  The page is at most 1510 px wide, centred, with 16 / 20 / 40 px side padding (phone / from 640 px / from 1024 px),
  and has no horizontal scroll from 375 px up. Before the match id is read, the same frame renders in its starting state
  (badge Connecting, the connecting notice, not announced) as the prerendered static shell, so nothing jumps when the
  live screen takes over.
- **Recap, replay, how-it-works:** not decided yet.

## 2. Viewer modes

- Exactly which panels and charts appear in casual, analyst and player-focus modes?

_Answer:_

## 3. Preferences

- How are mode, language, favourite club and followed player chosen and remembered?

_Answer:_

## 4. Judges' path

- What does a judge see first, and how do they reach replay and the agent trace?

_Answer:_
