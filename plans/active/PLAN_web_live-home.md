# PLAN_web_live-home — The live 3D match screen and homepage

| Field | Value |
|---|---|
| Owners | Arnav, Azeem (web app, from 24 Oct; `plans/REGISTRY.md`) |
| Status | Built locally, 24 Oct, branch `web/live-home`. Not on Azure. |
| Replaces | Vedant's web plans, moved to [`vedant-frontend/plans/active/`](../../vedant-frontend/plans/active/) |
| Specs | [`web/specs/screens.md`](../../web/specs/screens.md), [`pitch.md`](../../web/specs/pitch.md), [`charts.md`](../../web/specs/charts.md), [`design-system.md`](../../web/specs/design-system.md), [`realtime.md`](../../web/specs/realtime.md) §4 |
| Contracts | No message shape changed. Reads `CONTRACTS.md` §2–§4, §6, §7, §10.4, §10.6 |

## 1. Goal

The first thing a viewer sees is a match being played on a 3D pitch, with the pitch telling the story (who owns the
territory, how a team reorganises after scoring, who passes to whom and down which lane), the agents' checked
moment cards at the moment they matter, in the viewer's mode and language, and the match analytics underneath.

## 2. Sprints

| Sprint | Work | Status |
|---|---|---|
| S1 | Move Vedant's look to `vedant-frontend/`; keep the data layer live | Done (`82193c7`) |
| S2 | New theme and shell; motion engine; match memory; insights client and routes (negotiate audience groups, insights snapshot, insights history) | Done |
| S3 | The 3D stage: grass, markings, stadium, lights, fitted cameras, 22 figures with run cycles, ball, labels | Done |
| S4 | The story director and its overlays: territory tide, team shape with line markers, live pass network, lane band | Done |
| S5 | Score header, viewer bar, AI feed, player focus, replay controls; charts: momentum, team stats, shot map, pass network, pressing, heatmap, pass map, key events; matches, recap and how-it-works pages | Done |
| S6 | Run the whole local flow (generator → Event Hubs → relay, archiver, stats, agents → this app) and check live, replay, desktop, phone, both themes | Done (§3) |
| S7 | Tests, specs, README, registry and knowledge notes | Done |

## 3. Checks (24 Oct, local stack)

- `npm run lint`, `npx tsc --noEmit`, `npm run build`, `npm test`: pass (482 tests, 2 opt-in skipped).
- Live: SYN-0901 streamed at 20× through the full local flow (`func start` host with relay, archiver and insights;
  stats engine; stand-in). The home page picked it, played it on the 3D pitch, received the moment cards on
  `match-SYN-0901-casual-en`, switched stories (attack, territory, the scoring team's shape after goals) and reached
  full time.
- A stale archived "live" match (SYN-0803, generator stopped) is skipped after 9 s with no frames; with nothing live,
  home replays the newest match at 5×.
- Replay: SYN-0901 replayed with its 18 moment cards and recap from the insights history; 1×/5×/20×, pause, restart.
- Phone (375 px) and desktop (1440 px), dark and light.

## 4. Not done / next

- Azure: the insights snapshot route forwards to the local stand-in only (501 on Azure); the web app needs read roles
  on `overlays` for the history route (with the archive read roles, archiver plan A3).
- Shot size by xG needs per-shot xG in the stat panel (`heavy.shots`).
- Live cards are templates locally (model provider off); model-written cards need the Azure model.
- `/api/preferences` and `/api/start-match` remain stubs (preferences live in the browser).
