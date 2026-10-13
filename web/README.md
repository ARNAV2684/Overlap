# Web app

Next.js (App Router, TypeScript): the viewer's screen. One message format (the envelope in
[`CONTRACTS.md` §7](../CONTRACTS.md#7-envelope-everything-sent-to-browsers)) feeds it from snapshots, the live
socket and replay files alike.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/design-system.md`](specs/design-system.md) | Overlap's own palette, type and logo, club theming and contrast, layout, motion, accessibility | every component |
| 2 | [`specs/screens.md`](specs/screens.md) | Every page, exactly what each viewer mode shows, preferences, the judges' path | `src/app/**`, `src/components/*` |
| 3 | [`specs/charts.md`](specs/charts.md) | Shared chart rules (`window`, `highlight`, pitch mapping) and each chart's props, data, interactions and empty state | `src/components/charts/*` |
| 4 | [`specs/realtime.md`](specs/realtime.md) | Connection and groups, the store and seq dedupe, catch-up, the overlay scheduler, replay | `src/lib/*`, `src/app/api/*` |

## Files

| Path | Job |
|---|---|
| `src/app/page.tsx` | Match picker |
| `src/app/match/[id]/page.tsx` | Live match screen |
| `src/app/match/[id]/recap/page.tsx` | Full-time recap |
| `src/app/replay/[id]/page.tsx` | Replay at 1×, 5×, 20× |
| `src/app/how-it-works/page.tsx` | Architecture and agent trace for judges |
| `src/app/api/*` | Negotiate, snapshot, replay, preferences, start-match |
| `src/components/charts/*` | Live pitch, momentum tide, shot map, pass network, pressing zones, heatmap zones, stat bars, key events |
| `src/components/*` | Moment card, agent trace, scoreboard, commentary feed, viewer controls |
| `src/lib/*` | Store, socket, overlay scheduler, preferences, visual lookup, coordinates, contract types |
