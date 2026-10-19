# Screen relay

Last verified: 2026-10-19 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Validates, orders and numbers screen messages; saves recoverable state before delivery.

## Ownership

Registry: Arnav (Pranav helping). See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Hub messages → §7 envelopes; save state/envelopes in Cosmos screen, send through Web PubSub. One relay instance avoids competing numbering/sends. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`functions/screen_relay.py`](../../functions/screen_relay.py), [`functions/relay_store.py`](../../functions/relay_store.py), [`functions/relay_runner.py`](../../functions/relay_runner.py), [`functions/function_app.py`](../../functions/function_app.py).

Specifications: [`functions/specs/screen-relay.md`](../../functions/specs/screen-relay.md).

## Status and evidence

Implemented core, store, local runner and Functions entrypoints. Existing plan records a local full-match pass; it also records Azure-host/browser checks still pending at that evidence date.

Evidence / checks to inspect: [`functions/tests/test_screen_relay.py`](../../functions/tests/test_screen_relay.py), [`functions/tests/e2e_local.py`](../../functions/tests/e2e_local.py), [`plans/active/PLAN_functions_screen-relay.md`](../../plans/active/PLAN_functions_screen-relay.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [stats-engine](stats-engine.md), [environments](environments.md).

Downstream / consumers: [storage](storage.md), [web-pubsub](web-pubsub.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Recorded evidence: 17 unit tests and SYN-0504 local transport pass; not re-run here. Preserve single-instance boundary and verify production host separately.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav; Pranav helping; see Ownership above | Core, persistence and local runner exist; browser/cloud verification is separate. | [Specification](../../functions/specs/screen-relay.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### RELAY-01

| Field | Value |
|---|---|
| Review/input needed from | Vedant |
| Request | Exercise negotiate, group subscription, ordered envelopes and snapshot/reconnect using the real relay. |
| Connected component | [frontend](frontend.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | A browser integration result for the exact frontend and relay revisions, including reconnect. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Frontend-side handoff: [WEB-01](frontend.md#web-01).

[Project map](README.md) · [Rebuild and verification](setup.md)
