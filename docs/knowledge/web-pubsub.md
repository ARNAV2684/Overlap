# Web PubSub

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

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

[Project map](README.md) · [Rebuild and verification](setup.md)
