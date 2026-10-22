# Frontend

Last verified: 2026-10-20 · source main `36f5d00` · source inspection, not fresh runtime certification. Replay parts updated 2026-10-23 against main `3353483`, with a local runtime check.

## Purpose

Shows live match information, catch-up, replay of archived matches and eventually insight cards.

## Ownership

Registry: Vedant. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Negotiation and snapshot client + §7 envelopes → validated store and UI. Replay: the server route `/api/replay/<id>` reads the stored match (§4.1: Cosmos `matches`, `events`, `stats`; Blob `tracking`) with server-only settings and turns it into §7 envelopes, one minute per request; the browser plays them into the same store. It reads the archive directly, not through `archiver/reader.py`. Verified overlays are a future insight dependency. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`web/src/app/page.tsx`](../../web/src/app/page.tsx), [`web/src/app/match/[id]/page.tsx`](../../web/src/app/match/[id]/page.tsx), [`web/src/components/live/MatchStreamProvider.tsx`](../../web/src/components/live/MatchStreamProvider.tsx), [`web/src/lib/socket.ts`](../../web/src/lib/socket.ts), [`web/src/lib/store.ts`](../../web/src/lib/store.ts), [`web/src/lib/api.ts`](../../web/src/lib/api.ts), [`web/src/app/api/negotiate/route.ts`](../../web/src/app/api/negotiate/route.ts). Replay: [`web/src/app/replay/[id]/page.tsx`](../../web/src/app/replay/[id]/page.tsx), [`web/src/components/replay`](../../web/src/components/replay), [`web/src/lib/replay-player.ts`](../../web/src/lib/replay-player.ts), [`web/src/lib/replay-client.ts`](../../web/src/lib/replay-client.ts), [`web/src/app/api/replay/[id]/route.ts`](../../web/src/app/api/replay/[id]/route.ts), [`web/src/lib/replay-envelopes.ts`](../../web/src/lib/replay-envelopes.ts), [`web/src/lib/server`](../../web/src/lib/server).

Specifications: [`web/specs/realtime.md`](../../web/specs/realtime.md), [`web/specs/screens.md`](../../web/specs/screens.md).

## Status and evidence

Partial implementation: redirect, live page, stream provider, socket/store/API client exist. PR [#48](https://github.com/ARNAV2684/Overlap/pull/48) (merged 19 Oct) added the live pitch, scoreboard, event timeline, message inspector and metric cards. The app-owned negotiate route is still a 501 stub on this main revision, so the browser negotiates with the local stand-in. Insight cards and viewer modes are not built. README descriptions of an empty app are stale; inspect source.

Replay is built and merged (specs, route and page in [#72](https://github.com/ARNAV2684/Overlap/pull/72), the half-time and full-time panels fix in [#75](https://github.com/ARNAV2684/Overlap/pull/75)). Checked on the local stack on 23 Oct against archived `SYN-0501` (6–0): the opt-in route test replays every stored event, frame and panel with 0 rejected, and Chrome plays the match at 20× to full time with the archived score at 375 and 1440 px. Local emulators only; the Azure read path (identity and roles) is not built yet.

Evidence / checks to inspect: [`web/src/lib`](../../web/src/lib), [`web/IMPLEMENTATION_PLAN.md`](../../web/IMPLEMENTATION_PLAN.md), [`plans/active/PLAN_web_live-match-viewer.md`](../../plans/active/PLAN_web_live-match-viewer.md), [`plans/active/PLAN_web_replay.md`](../../plans/active/PLAN_web_replay.md) (replay validation and handover). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [web-pubsub](web-pubsub.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md), [environments](environments.md).

Downstream / consumers: viewers using the screen; no further backend producer.

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

PR #48 is merged. Next: the app's own negotiate route, stat panels from the stats engine (CONTRACTS §7.4, live since #53), insight cards (§10.3) and viewer modes. Validate real relay/browser and API integration before claiming completion. Replay next: read roles for the web app on Azure (archiver plan A3 / S4), then a run against Azure storage.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Vedant; see Ownership above | Live UI/client code is partial on main; PR #48 merged the live screen components. | [Specification](../../web/specs/realtime.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### WEB-01

| Field | Value |
|---|---|
| Review/input needed from | Arnav / Pranav |
| Request | Check the merged #48 screen against the real relay/PubSub snapshot and negotiation services. |
| Connected component | [screen-relay](screen-relay.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | A browser run through the relay on the local stack (screen task SC4) plus real integration evidence; merge alone is not a live test. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Incoming reviews: [RELAY-01](screen-relay.md#relay-01), [ARCH-01](archiver.md#arch-01), [AI-01](ai-insights.md#ai-01), [PUBSUB-01](web-pubsub.md#pubsub-01). Each canonical note holds its own decision/status.

[Project map](README.md) · [Rebuild and verification](setup.md)
