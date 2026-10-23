# Frontend

Last verified: 2026-10-24 · branch `web/live-home` · local runtime check on the full local stack (live SYN-0901 at 20×,
replays, phone and desktop, both themes).

## Purpose

The viewer's screen: a live (or replayed) match on a 3D pitch that tells its story, the agents' checked moment cards
for the viewer's mode and language, and the match analytics.

## Ownership

Registry: Arnav, Azeem (from 24 Oct). See [registry](../../plans/REGISTRY.md). The earlier web app (Vedant, 15–22 Oct)
is kept for reference in [`vedant-frontend/`](../../vedant-frontend/README.md); its data layer is still live in `web/`.

## Inputs and outputs

In: §7 envelopes on `match-<id>` (negotiate + snapshot + socket, or the archive replay route), and §10.6 insight
envelopes (`overlay`, `player_tag`, `recap`) on one audience group per viewer (`match-<id>-casual|analyst-<lang>`,
`-club-<team>-<lang>`, `-player-<player>-<lang>`), caught up through `/api/match/<id>/insights/snapshot` (forwarded to the
stand-in locally) and, for replays, `/api/match/<id>/insights/history` (Cosmos `overlays`). Out: the screens. See
[shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`web/src/components/pitch3d`](../../web/src/components/pitch3d) (three.js stage, figures, overlays),
[`web/src/lib/live`](../../web/src/lib/live) (motion, match memory, story director, insights, chart data),
[`web/src/components/match`](../../web/src/components/match), [`web/src/components/charts`](../../web/src/components/charts),
[`web/src/providers`](../../web/src/providers), and the kept data layer in [`web/src/lib`](../../web/src/lib) and
[`web/src/app/api`](../../web/src/app/api).

Specifications: [`screens.md`](../../web/specs/screens.md), [`pitch.md`](../../web/specs/pitch.md),
[`charts.md`](../../web/specs/charts.md), [`design-system.md`](../../web/specs/design-system.md),
[`realtime.md`](../../web/specs/realtime.md) (§4 insights). Plan: [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md).

## Status and evidence

Built locally on branch `web/live-home` (not merged). Checks: lint, typecheck, build, 482 unit tests. Runtime: SYN-0901
streamed at 20× through generator → Event Hubs emulator → Functions host (relay, archiver, insights) and the stats
engine → stand-in → this app; the home page played it live with moment cards and story changes to full time, skipped a
stale "live" match, and replayed SYN-0901 with its 18 cards and recap from the insights history.

## Dependencies

Upstream / prerequisites: [web-pubsub](web-pubsub.md), [screen-relay](screen-relay.md), [archiver](archiver.md),
[storage](storage.md), [ai-insights](ai-insights.md), [environments](environments.md).

Downstream / consumers: viewers.

## Next work

Azure: the insights snapshot route reads `overlays` itself (it answers 501 off the stand-in); web app read roles on the
archive and `overlays` (archiver plan A3). Per-shot xG (`heavy.shots`) for shot sizes. Model-written cards need the
Azure model (templates locally).

## Work and coordination record

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav, Azeem; see Ownership above | 3D live screen and homepage on `web/live-home` (24 Oct) | [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md) | Local stack verified; Azure not started |
| Vedant (15–22 Oct) | Data layer (routes, socket, store, replay engine) still live; earlier UI in `vedant-frontend/` | [`vedant-frontend/README.md`](../../vedant-frontend/README.md) | Reference only |

[Project map](README.md) · [Rebuild and verification](setup.md)
