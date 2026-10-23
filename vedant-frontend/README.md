# Vedant's frontend (kept for reference)

This folder keeps the look of the web app that Vedant built from 15 to 22 October (PRs #10, #19, #42, #43, #48, #57,
#72, #73, #77, #78, #80, #81), moved here on 24 October when the web app's owners became Arnav and Azeem and the screens
were rebuilt (`plans/active/PLAN_web_live-home.md`). Nothing was deleted; files keep their original paths under this
folder, so `vedant-frontend/web/src/components/…` was `web/src/components/…`.

**It is reference only and does not run:** its imports point at the old `web/` paths, and lint, TypeScript, the tests,
the build and CI never read this folder.

## What is here

| Path | What it was |
|---|---|
| `web/src/app/` | The theme (`globals.css`), fonts and layout, the page bodies of `/`, `/match/[id]`, `/replay/[id]`, `/match/[id]/recap`, `/how-it-works`, the `/dev/ui` showcase, the favicon |
| `web/src/components/` | The UI kit, layout, scoreboard, metric cards, event timeline, 2D live pitch, stat charts, message inspector, replay view and controls, and the placeholders for moment cards, commentary feed, viewer controls and agent trace |
| `web/src/lib/cn.ts`, `web/src/lib/visuals.ts` | The class-name helper tied to the old text sizes; the visuals placeholder |
| `web/src/lib/__tests__/` | The tests of those components (layout, live view, pitch, replay view, stat charts, timeline, inspector, scoreboard and metrics views, `cn`) |
| `web/IMPLEMENTATION_PLAN.md`, `web/specs/` | The implementation plan and the design-system, screens and charts specs |
| `plans/active/` | The web plans: live match viewer, replay, match list, realtime routes, stat charts, insight cards, end-to-end stats run |

## What of Vedant's work is still live in `web/`

The data layer, unchanged except where noted:

- Routes: `/api/negotiate` (now also accepts insight audience groups), `/api/match/[id]/snapshot`, `/api/matches`,
  `/api/replay/[id]`.
- Server code: `lib/server/` (archive and screen stores, the Web PubSub token signer, settings checks).
- `lib/contracts.ts` (strict schemas, stat panels included), `lib/socket.ts`, `lib/store.ts` (now also hands every
  envelope to listeners), `lib/store-hooks.ts`, `lib/ring-buffer.ts`, `lib/snapshot.ts`, `lib/api.ts`, the replay
  engine (`lib/replay-client.ts`, `lib/replay-player.ts`, `lib/replay-envelopes.ts`), `lib/match-list.ts` and the pure
  helpers (`coordinates`, `describe-event`, `format`, `stat-charts`, `announcer`, `team-colours`).
- The two providers, moved to `web/src/providers/` (`MatchStreamProvider`, `ReplayProvider`), goal detection moved to
  `web/src/lib/goal.ts`, and `web/specs/realtime.md`.
- Their tests.
