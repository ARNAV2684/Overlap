# Archiver and replay reader

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Persists events and tracking independently of the screen path and reconstructs archived matches.

## Ownership

Registry: Arnav (Pranav helping). See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Hubs → matches/events/stats in Cosmos and per-minute compressed tracking in Blob. Reader reconstructs §4.1 archive for replay; no dependence on Event Hubs retention. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`archiver/consumer.py`](../../archiver/consumer.py), [`archiver/event_store.py`](../../archiver/event_store.py), [`archiver/tracking_chunks.py`](../../archiver/tracking_chunks.py), [`archiver/reader.py`](../../archiver/reader.py), [`archiver/main.py`](../../archiver/main.py).

Specifications: [`archiver/specs/storage.md`](../../archiver/specs/storage.md).

## Status and evidence

Implemented consumer, stores, chunks, reader and runner. Repository handover records local round-trip/restart checks; Azure packaging/host work remains separately tracked.

Evidence / checks to inspect: [`archiver/tests/test_archiver.py`](../../archiver/tests/test_archiver.py), [`archiver/tests/check_archive.py`](../../archiver/tests/check_archive.py), [`plans/active/PLAN_archiver_archive-flow.md`](../../plans/active/PLAN_archiver_archive-flow.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [stats-engine](stats-engine.md), [environments](environments.md).

Downstream / consumers: [storage](storage.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Recorded evidence: SYN-0505 round trip, restart recovery and seven tests. These are historical results, not this run. Finish cloud checks and connect replay frontend.

[Project map](README.md) · [Rebuild and verification](setup.md)
