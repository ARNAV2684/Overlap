# Cosmos DB and blob storage

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Separates recoverable live-screen state, archived matches and immutable evidence.

## Ownership

Registry: Arnav (Pranav helping) for Cosmos; other infrastructure unassigned. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Relay writes screen; archiver writes matches/events/stats and Blob tracking; planned stats writes moments/match_state. MCP reads moments only for its first tool. Contract §§4.1, 7.3, 10.2. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`functions/relay_store.py`](../../functions/relay_store.py), [`archiver/event_store.py`](../../archiver/event_store.py), [`archiver/tracking_chunks.py`](../../archiver/tracking_chunks.py), [`mcp_server/data_access.py`](../../mcp_server/data_access.py), [`infra/local/docker-compose.yml`](../../infra/local/docker-compose.yml), [`infra/modules/cosmos.bicep`](../../infra/modules/cosmos.bicep).

Specifications: [`archiver/specs/storage.md`](../../archiver/specs/storage.md), [`infra/specs/local-development.md`](../../infra/specs/local-development.md).

## Status and evidence

Local emulators and relay/archive stores exist. MCP can read a seeded moment. Cloud composition is placeholder; not all planned containers have working producers.

Evidence / checks to inspect: [`archiver/tests/test_archiver.py`](../../archiver/tests/test_archiver.py), [`mcp_server/tests/test_cosmos.py`](../../mcp_server/tests/test_cosmos.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md), [environments](environments.md).

Downstream / consumers: [mcp](mcp.md), [ai-insights](ai-insights.md), [frontend](frontend.md), [web-pubsub](web-pubsub.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Keep source moments immutable and separate from delivery/job state. Do not equate emulator keys with production read-only RBAC.

[Project map](README.md) · [Rebuild and verification](setup.md)
