# Frontend

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

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

Partial implementation: redirect, live page, stream provider, socket/store/API client exist. The app-owned negotiate route is still a 501 stub on this main revision. README descriptions of an empty app are stale; inspect source.

Evidence / checks to inspect: [`web/src/lib`](../../web/src/lib), [`web/IMPLEMENTATION_PLAN.md`](../../web/IMPLEMENTATION_PLAN.md), [`plans/active/PLAN_web_live-match-viewer.md`](../../plans/active/PLAN_web_live-match-viewer.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [web-pubsub](web-pubsub.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md), [environments](environments.md).

Downstream / consumers: viewers using the screen; no further backend producer.

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Remote web/live-api at 015a194 is unmerged work, not main behaviour; no open PR was returned at scan. Validate real relay/browser and API integration before claiming completion.

[Project map](README.md) · [Rebuild and verification](setup.md)
