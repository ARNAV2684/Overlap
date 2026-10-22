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
`package-lock.json` is committed (`4cb52ee`), so `npm ci` installs the pinned versions.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` / `npm run test:watch` | Vitest unit and component tests (no server needed) |

Run `lint`, `typecheck`, `test` and `build` before asking for review (the CI web job runs lint, typecheck and build).

### With the mock stream

The app reads from the stream server at `NEXT_PUBLIC_STREAM_BASE_URL` (default `http://localhost:8787`). Start the
temporary mock first (details in [`../mock/single-match-demo/README.md`](../mock/single-match-demo/README.md)), keep its
terminal running, then open `http://localhost:3000`:

```bash
cd mock
uv sync
uv run python -m overlap_mock.cli play --match all --speed 20 --hubs off --web --linger-s 600
```

- `/` lists the matches in the match archive (`/api/matches`): live ones link to their live screen, finished ones to
  their replay; refreshed every 5 s. It needs the archive settings in `web/.env.local` (the same ones as replay, see
  `web/.env.example`) and the local stack's Cosmos emulator with the archiver running. The mock writes no archive, so
  with the mock alone `/` says the list isn't available; open `/match/SYN-9001` directly instead.
- `/match/SYN-9001` is the live screen: scoreboard, four counters, match stats, event timeline, live pitch and message
  inspector. After full time the server stays up for `--linger-s` seconds; reload the page to start a new run. The
  match stats need the stats engine's panels (`kind: stats`), so with the mock alone they wait for the first panel;
  run the local stack with the stats consumer (`infra/specs/local-development.md`) to see them.
- `/dev/ui` (development only) shows every token, primitive and timeline row variant, including the red and
  second-yellow cards `SYN-9001` never produces (`SYN-9002` has a red card).
- `infra/local/webpubsub_standin/` fed by the screen relay also serves port 8787 and works the same way.

The old viewer on `http://127.0.0.1:8788` (`mock/single-match-demo/`) is the reference the screen was rebuilt from.

### End-to-end check against the stream

`src/lib/__tests__/stream.qa.test.ts` runs the real socket and store against a running stream until full time and
checks that nothing is rejected, every message is applied once, the badge reaches "finished" and the final score
matches the server. It is skipped unless asked for:

```bash
QA_STREAM=1 QA_MATCHES=SYN-9001,SYN-9002,SYN-9003 npx vitest run src/lib/__tests__/stream.qa.test.ts
```

### Replay an archived match

`/replay/<id>` plays a finished match from the archive on the live screen's panels, at 20× by default (1× and 5× too),
with pause and resume. `/api/replay/<id>` reads Cosmos and Blob on the server and answers with a manifest, then one
minute of §7 envelopes per `?chunk=<n>`; the browser loads two minutes ahead
([`specs/realtime.md`](specs/realtime.md) §5, [`specs/screens.md`](specs/screens.md) §1).

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

## The live screen

| Part | Files | Reads from the store |
|---|---|---|
| Frame: header and badge, intro, notice, footer | `src/components/layout/*`, `src/components/live/LiveMatchView.tsx` | connection, notice |
| Scoreboard, goal flash and announcement | `src/components/Scoreboard.tsx`, `src/components/scoreboard/*` | scoreboard (live while paused) |
| Four counters | `src/components/metrics/*` | counters (frozen while paused) |
| Match stats: stat bars, momentum tide, pass network, pressing and touch zones | `src/components/live/MatchStatsSection.tsx`, `src/components/charts/{StatBars,MomentumTide,PassNetwork,PressingZones,HeatmapZones}.tsx`, `src/lib/stat-charts.ts` | stats (frozen while paused), players |
| Event timeline: one component per row type | `src/components/timeline/**` | timeline, controls, inspector |
| Live pitch | `src/components/charts/LivePitch.tsx`, `src/components/charts/pitch/*`, `src/components/live/LivePositionsPanel.tsx` | latest frame, players |
| Message inspector | `src/components/inspector/*` | inspector, connection (rejected count) |
| Match picker | `src/app/page.tsx`, `src/app/api/matches/route.ts`, `src/lib/match-list.ts` | none (`listMatches()`) |
| Data path | `src/lib/{env,contracts,api,socket,store,store-hooks,ring-buffer}.ts`, `src/components/live/MatchStreamProvider.tsx` | — |

Every panel has a store-free `…View` version, used by the route's loading fallback so the first paint does not jump.
Plan and progress: [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) and
[`../plans/active/PLAN_web_live-match-viewer.md`](../plans/active/PLAN_web_live-match-viewer.md).

## The replay screen

The same panels as the live screen, fed by a replay player instead of the socket.

| Part | Files |
|---|---|
| Page, header "/ Replay", intro with the final score, toolbar (Play/Pause, speeds, progress), failure cards | `src/app/replay/[id]/page.tsx`, `src/components/replay/*` |
| Player: playhead in match time, speeds, prefetch, retries | `src/lib/replay-player.ts`, `src/lib/replay-client.ts` |
| Route: stored match → manifest and one minute of envelopes | `src/app/api/replay/[id]/route.ts`, `src/lib/replay-envelopes.ts`, `src/lib/server/archive-{env,store}.ts` |
| Row source ("Replay · archive" on timeline rows) | `src/lib/stream-source.ts` |

Plan, checks and handover: [`../plans/active/PLAN_web_replay.md`](../plans/active/PLAN_web_replay.md).

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
| `src/app/replay/[id]/page.tsx` | Replay at 1×, 5×, 20× (built) |
| `src/app/how-it-works/page.tsx` | Architecture and agent trace for judges |
| `src/app/api/*` | Negotiate, snapshot, replay, match list, preferences, start-match |
| `src/components/charts/*` | Live pitch, momentum tide, shot map, pass network, pressing zones, heatmap zones, stat bars, key events |
| `src/components/*` | Moment card, agent trace, scoreboard, commentary feed, viewer controls |
| `src/lib/*` | Store, socket, overlay scheduler, preferences, visual lookup, coordinates, contract types |
