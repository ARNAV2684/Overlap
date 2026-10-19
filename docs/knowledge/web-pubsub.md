# Web PubSub

Last verified: 2026-10-19 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Delivers envelopes to subscribed browser groups.

## Ownership

Registry: Arnav (Pranav helping). See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Relay → match-<id> group → viewer socket; stand-in snapshot reads stored screen state. Future insights use agreed audience delivery. Contract §§7, 10.4. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`infra/local/webpubsub_standin/standin/server.py`](../../infra/local/webpubsub_standin/standin/server.py), [`infra/local/webpubsub_standin/standin/snapshot.py`](../../infra/local/webpubsub_standin/standin/snapshot.py), [`functions/relay_store.py`](../../functions/relay_store.py), [`infra/modules/web-pubsub.bicep`](../../infra/modules/web-pubsub.bicep).

Specifications: [`infra/local/webpubsub_standin/README.md`](../../infra/local/webpubsub_standin/README.md), [`web/specs/realtime.md`](../../web/specs/realtime.md).

## Status and evidence

Local protocol stand-in implemented; cloud Bicep remains placeholder. Audience/player insight delivery is planned, not established by match-group delivery.

Evidence / checks to inspect: [`infra/local/webpubsub_standin/check_standin.py`](../../infra/local/webpubsub_standin/check_standin.py), [`functions/tests/e2e_local.py`](../../functions/tests/e2e_local.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [screen-relay](screen-relay.md), [storage](storage.md), [ai-insights](ai-insights.md), [environments](environments.md).

Downstream / consumers: [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Verify real Azure identity/negotiation and delivery separately. The local stand-in is not Azure-hosted PubSub.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav; Pranav helping; see Ownership above | Local stand-in exists; audience insight delivery and Azure hosting are separate work. | [Specification](../../web/specs/realtime.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### PUBSUB-01

| Field | Value |
|---|---|
| Review/input needed from | Vedant |
| Request | Confirm subscription/negotiation and snapshot expectations for the match path; audience-card delivery follows AI-01. |
| Connected component | [frontend](frontend.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | A browser/stand-in check with reconnect, plus a separate audience contract review. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |



[Project map](README.md) · [Rebuild and verification](setup.md)
