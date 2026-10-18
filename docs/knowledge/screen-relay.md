# Screen relay

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

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

[Project map](README.md) · [Rebuild and verification](setup.md)
