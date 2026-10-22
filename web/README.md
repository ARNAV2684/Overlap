# Web app

Next.js (App Router, TypeScript): the viewer's screen. One message format (the envelope in
[`CONTRACTS.md` §7](../CONTRACTS.md#7-envelope-everything-sent-to-browsers)) feeds it from snapshots, the live
socket and replay files alike.

## Run locally

Needs Node 22 or newer (CI uses 22).

```bash
cd web
cp .env.example .env.local   # URLs and ids only, never secrets
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` is required: `src/lib/env.ts` throws one message listing every missing or malformed value.
`package-lock.json` is gitignored, so installs are not pinned.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest unit and component tests (no server needed) |

Run `lint`, `typecheck`, `test` and `build` before asking for review (the CI web job runs lint, typecheck and build).

### With the local stack

The browser only talks to this app: it gets its WebSocket address from `/api/negotiate` and its catch-up history from
`/api/match/<id>/snapshot` (`specs/realtime.md` §1.1, §3.1). Those routes need the server settings in
`web/.env.local` (see `web/.env.example`): `OVERLAP_WEBPUBSUB_ENDPOINT` (the Web PubSub stand-in on
`http://localhost:8787`) and the Cosmos emulator settings with `OVERLAP_COSMOS_CONTAINER=screen`.

Start the local stack in the order of [`infra/specs/local-development.md`](../infra/specs/local-development.md) §5:
the Docker emulators, the Web PubSub stand-in, the relay (and archiver), the stats engine, then a generator match.
Then run `npm run dev` here and open `http://localhost:3000`:

- `/` lists the matches in the match archive (`/api/matches`): live ones link to their live screen, finished ones to
  their replay; refreshed every 5 s. It needs the archive settings (the same ones as replay) and the archiver running.
- `/match/<id>` is the live screen: scoreboard, four counters, event timeline, live pitch and message inspector. A
  reload mid-match catches up from the snapshot.
- `/dev/ui` (development only) shows every token, primitive and timeline row variant, including red and
  second-yellow cards.

### End-to-end check against the stream

`src/lib/__tests__/stream.qa.test.ts` runs the real socket and store against the running app (`QA_APP_URL`, default
`http://localhost:3000`) on the local stack until full time and checks that nothing is rejected, every message is
applied once, the badge reaches "finished" and the final score matches the server. It is skipped unless asked for
(use the generator match's id):

```bash
QA_STREAM=1 QA_MATCHES=SYN-0042 npx vitest run src/lib/__tests__/stream.qa.test.ts
```

## The live screen

| Part | Files | Reads from the store |
|---|---|---|
| Frame: header and badge, intro, notice, footer | `src/components/layout/*`, `src/components/live/LiveMatchView.tsx` | connection, notice |
| Scoreboard, goal flash and announcement | `src/components/Scoreboard.tsx`, `src/components/scoreboard/*` | scoreboard (live while paused) |
| Four counters | `src/components/metrics/*` | counters (frozen while paused) |
| Event timeline: one component per row type | `src/components/timeline/**` | timeline, controls, inspector |
| Live pitch | `src/components/charts/LivePitch.tsx`, `src/components/charts/pitch/*`, `src/components/live/LivePositionsPanel.tsx` | latest frame, players |
| Message inspector | `src/components/inspector/*` | inspector, connection (rejected count) |
| Match picker | `src/app/page.tsx`, `src/app/api/matches/route.ts`, `src/lib/match-list.ts` | none (`listMatches()`) |
| Data path | `src/lib/{env,contracts,api,socket,store,store-hooks,ring-buffer}.ts`, `src/components/live/MatchStreamProvider.tsx` | — |

Every panel has a store-free `…View` version, used by the route's loading fallback so the first paint does not jump.
Plan and progress: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and
[`../plans/active/PLAN_web_live-match-viewer.md`](../plans/active/PLAN_web_live-match-viewer.md).

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
| `src/app/page.tsx` | Match picker (built) |
| `src/app/match/[id]/page.tsx` | Live match screen (built) |
| `src/app/match/[id]/recap/page.tsx` | Full-time recap |
| `src/app/replay/[id]/page.tsx` | Replay at 1×, 5×, 20× |
| `src/app/how-it-works/page.tsx` | Architecture and agent trace for judges |
| `src/app/api/*` | Negotiate, snapshot, replay, match list, preferences, start-match |
| `src/components/charts/*` | Live pitch, momentum tide, shot map, pass network, pressing zones, heatmap zones, stat bars, key events |
| `src/components/*` | Moment card, agent trace, scoreboard, commentary feed, viewer controls |
| `src/lib/*` | Store, socket, overlay scheduler, preferences, visual lookup, coordinates, contract types |
