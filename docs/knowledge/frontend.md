# Frontend

Last verified: 2026-10-20 · source main `36f5d00` · source inspection, not fresh runtime certification.

## Purpose

Shows live match information, catch-up and eventually replay/insight cards.

## Ownership

Registry: Vedant. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Negotiation and snapshot client + §7 envelopes → validated store and UI. Archive reader is a planned replay dependency; verified overlays are a future insight dependency. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`web/src/app/page.tsx`](../../web/src/app/page.tsx), [`web/src/app/match/[id]/page.tsx`](../../web/src/app/match/[id]/page.tsx), [`web/src/components/live/MatchStreamProvider.tsx`](../../web/src/components/live/MatchStreamProvider.tsx), [`web/src/lib/socket.ts`](../../web/src/lib/socket.ts), [`web/src/lib/store.ts`](../../web/src/lib/store.ts), [`web/src/lib/api.ts`](../../web/src/lib/api.ts), [`web/src/app/api/negotiate/route.ts`](../../web/src/app/api/negotiate/route.ts).

Specifications: [`web/specs/realtime.md`](../../web/specs/realtime.md), [`web/specs/screens.md`](../../web/specs/screens.md).

## Status and evidence

Partial implementation: redirect, live page, stream provider, socket/store/API client exist. PR [#48](https://github.com/ARNAV2684/Overlap/pull/48) (merged 19 Oct) added the live pitch, scoreboard, event timeline, message inspector and metric cards. The app-owned negotiate route is still a 501 stub on this main revision, so the browser negotiates with the local stand-in. Insight cards and viewer modes are not built. README descriptions of an empty app are stale; inspect source.

Evidence / checks to inspect: [`web/src/lib`](../../web/src/lib), [`web/IMPLEMENTATION_PLAN.md`](../../web/IMPLEMENTATION_PLAN.md), [`plans/active/PLAN_web_live-match-viewer.md`](../../plans/active/PLAN_web_live-match-viewer.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [web-pubsub](web-pubsub.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md), [environments](environments.md).

Downstream / consumers: viewers using the screen; no further backend producer.

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

PR #48 is merged. Next: the app's own negotiate route, stat panels from the stats engine (CONTRACTS §7.4, live since #53), insight cards (§10.3) and viewer modes. Validate real relay/browser and API integration before claiming completion.

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
