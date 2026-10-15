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

Copy `.env.local` before you start. `src/lib/env.ts` throws a clear message if a value is missing or malformed, but
nothing imports it yet, so today the app still runs without it; it will be required once the realtime code
(Phase 5) imports it. `package-lock.json` is gitignored, so installs are not pinned.

| Script | What it does |
|---|---|
| `npm run dev` | Dev server on port 3000 |
| `npm run build` / `npm start` | Production build, then serve it |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |

Run `lint`, `typecheck` and `build` before asking for review (the CI web job runs the same three).

### With the mock stream

The app reads from the stream server at `NEXT_PUBLIC_STREAM_BASE_URL` (default `http://localhost:8787`). To get live
data locally, start the temporary mock first (details in [`../mock/single-match-demo/README.md`](../mock/single-match-demo/README.md)):

```bash
cd mock
uv sync
uv run python -m overlap_mock.cli play --match SYN-9001 --speed 20 --hubs off --web --stdout events --linger-s 600
```

**Current state:** the pages and API routes are build-safe stubs, so `/` renders an empty page and `/api/*` answer
`501 not_implemented`. Nothing reads the stream yet. The old viewer on `http://127.0.0.1:8788` is the reference for
what the Next.js app will rebuild; see [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md).

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
