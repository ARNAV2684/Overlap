# Web app

Next.js (App Router, TypeScript): the viewer's screen. The home page opens on a match being played on a 3D pitch
(three.js) that tells the story of the match, with the agents' checked moment cards, the viewer's mode and language,
and the match analytics underneath. One message format (the envelope in
[`CONTRACTS.md` §7](../CONTRACTS.md#7-envelope-everything-sent-to-browsers)) feeds it from snapshots, the live
socket and the archive replay alike.

Owners: Arnav and Azeem ([registry](../plans/REGISTRY.md)). Plan: [`PLAN_web_live-home`](../plans/active/PLAN_web_live-home.md).
The earlier screens are kept in [`../vedant-frontend/`](../vedant-frontend/README.md).

## Run locally

Needs Node 22 or newer (CI uses 22).

```bash
cd web
cp .env.example .env.local   # URLs and ids only, never secrets
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` is required: `src/lib/env.ts` throws one message listing every missing or malformed value.
`package-lock.json` is committed (`4cb52ee`), so `npm ci` installs the pinned versions.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest unit tests (no server needed) |

Run `lint`, `typecheck`, `test` and `build` before asking for review (the CI web job runs lint, typecheck and build).

### With the local stack

The browser only talks to this app: `/api/negotiate` gives it receive-only WebSocket addresses (the match group and the
viewer's insight audience group), `/api/match/<id>/snapshot` the catch-up, `/api/match/<id>/insights/snapshot` and
`/insights/history` the moment cards, `/api/matches` the archive list and `/api/replay/<id>` the replay
([`specs/realtime.md`](specs/realtime.md)). The server settings go in `web/.env.local` (see `web/.env.example`): the Web
PubSub stand-in (`OVERLAP_WEBPUBSUB_ENDPOINT=http://localhost:8787`), the Cosmos emulator with
`OVERLAP_COSMOS_CONTAINER=screen`, and the archive settings.

Start the local stack in the order of [`infra/specs/local-development.md`](../infra/specs/local-development.md) §5:
the Docker emulators, the Web PubSub stand-in, the Functions host (`func start`: relay, archiver and the insights flow)
or the relay, archiver and insights poller separately, the stats engine, then a generator match
(`uv run python cli.py live --hubs emulator --speed 20 --first-match <n>` in `generator/`). Then `npm run dev` here:

- `/` plays the live match (or, with nothing live, replays the newest finished match at 5×) on the 3D pitch, with the
  story, the moment cards and the analytics.
- `/match/<id>` opens one match, live or replayed; `/replay/<id>` always replays (1×, 5×, 20×, pause, restart).
- `/matches` lists the archive; `/match/<id>/recap` shows the final score, the recap and every moment;
  `/how-it-works` explains the pipeline.

### Replay an archived match

`/replay/<id>` plays a finished match from the archive on the same screen as a live match, at 5× by default (1× and 20×
too), with pause, resume and restart; the moment cards come from the insights history. `/api/replay/<id>` reads Cosmos and Blob on the server and answers with a manifest, then one
minute of §7 envelopes per `?chunk=<n>`; the browser loads two minutes ahead
([`specs/realtime.md`](specs/realtime.md) §5, [`specs/screens.md`](specs/screens.md) §2.4).

1. Start the local stack with the archiver and the stats engine, then play a match and wait for full time
   ([`../infra/specs/local-development.md`](../infra/specs/local-development.md), steps 1–7). The mock writes no
   archive.
2. Add the archive settings from `web/.env.example` to `web/.env.local`, with the emulator values from
   `infra/local/env.example`. They are server only and never reach the browser.
3. `npm run dev`, then pick a finished match on `/`, or open `/replay/<id>` directly.

Without the settings the page says the archive can't be reached (the route answers `503 replay_unavailable`); the live
screen is unaffected. A match still being played links to its live screen. An opt-in test fetches a whole archived
match through the real route and checks it against the stored result:

```bash
QA_REPLAY=1 QA_REPLAY_MATCH=SYN-0501 npx vitest run src/lib/__tests__/replay.qa.test.ts
```

### End-to-end check against the stream

`src/lib/__tests__/stream.qa.test.ts` runs the real socket and store against the running app (`QA_APP_URL`, default
`http://localhost:3000`) on the local stack until full time and checks that nothing is rejected, every message is
applied once, the badge reaches "finished" and the final score matches the server. It is skipped unless asked for
(use the generator match's id):

```bash
QA_STREAM=1 QA_MATCHES=SYN-0042 npx vitest run src/lib/__tests__/stream.qa.test.ts
```

## Specs

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/design-system.md`](specs/design-system.md) | Palette, type, cards, motion, accessibility | every component |
| 2 | [`specs/screens.md`](specs/screens.md) | Every page, the match screen's parts, preferences, the feed | `src/app/**`, `src/components/{home,match,shell}/*` |
| 3 | [`specs/pitch.md`](specs/pitch.md) | The 3D stage, figures, cameras, smooth motion, match memory, the story director | `src/components/pitch3d/**`, `src/lib/live/{motion,match-memory,story}.ts` |
| 4 | [`specs/charts.md`](specs/charts.md) | Each analytics chart and its data | `src/components/charts/*`, `src/lib/live/charts.ts` |
| 5 | [`specs/realtime.md`](specs/realtime.md) | Connection, store, catch-up, insights (§4), replay, match list | `src/lib/*`, `src/app/api/*`, `src/providers/*` |

## Files

| Path | Job |
|---|---|
| `src/app/page.tsx`, `src/components/home/HomeLive.tsx` | Home: live match or replay of the newest |
| `src/app/match/[id]/page.tsx`, `src/app/replay/[id]/page.tsx`, `src/components/match/MatchById.tsx`, `MatchSession.tsx` | One match, live or replay |
| `src/components/match/*` | Match screen: score header, pitch overlay (story, chips, moment card), replay bar, viewer bar, feed, player focus, analytics, recap |
| `src/components/pitch3d/**` | The 3D pitch: `scene/stage.ts` (renderer, lights, cameras, story overlays), `scene/pitch.ts`, `scene/figure.ts`, `scene/overlays.ts`, `PitchStage.tsx` (loop and labels) |
| `src/components/charts/*` | Momentum, stat bars, shot map, pass network, pressing, heatmap, pass map, key events |
| `src/lib/live/*` | Motion, match memory, story director, insights client and feed, chart data |
| `src/providers/*` | Live stream, replay, match experience, preferences |
| `src/app/api/*` | Negotiate, snapshot, insights snapshot and history, replay, match list (preferences and start-match are stubs) |
| `src/lib/*` | Contracts, socket, store, replay engine, API client, preferences, coordinates, formatting |

## Broadcast viewer and tracking heatmap

The live screen and archive replay share the same viewer. No extra packages or assets are needed.

1. Check out the review branch `web/broadcast-local-preview` (or pull `main` after it merges).
2. In `web/`, run `npm ci`. Keep your existing `.env.local`; on a fresh laptop copy `.env.example` and configure your own local endpoints as described above.
3. Start the existing [local stack](../infra/specs/local-development.md) and generator, or use a match already archived on your machine. Run `npm run dev` and open `http://localhost:3000`.
4. Choose **Watch** for the uncluttered pitch or **Analyse** for tactical overlays. **Close** follows the action; **Wide** and **Top** remain available.
5. For a natural-speed motion review, open a finished match from `/matches`, then select **1×** and **Close**. At **20×**, both player and ball travel are deliberately accelerated.
6. Below the pitch, select a team, player and period in **Tracking heatmap**. Warmer cells indicate more observed position samples, scaled to that selection's peak. The heatmap is not a claim of complete coverage, especially after joining late.

The pitch adds procedural stadium seating, turf, nets, detailed kits and contact shadows. Running animation and ball rotation use rendered travel on the shared tracking clock. The camera follows with a consistent response across frame rates. Tracking coordinates, match events and backend contracts are unchanged; exact foot-to-ball contact remains limited by the source tracking and procedural models.

Git shares the viewer code, not another teammate's running services or recorded matches. Use your own local match ID; no developer-specific ports, recordings, database contents or secrets are needed from the author.
