# Cosmos DB and blob storage

Last verified: 2026-10-20 · main `a1cef33` plus open PRs #58–#62 (labelled) · source inspection; F2 live run recorded.

## Purpose

Separates recoverable live-screen state, archived matches and immutable evidence.

## Ownership

Registry: Arnav (Pranav helping) for Cosmos; other infrastructure unassigned. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Relay writes screen; archiver writes matches/events/stats and Blob tracking; the stats engine writes moments (create-once) and match_state. Layer 5 will add job/outbox/budget documents in `moments` (filtered by `kind`) and overlays. MCP reads moments for its first tool. Contract §§4.1, 7.3, 10.2. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`functions/relay_store.py`](../../functions/relay_store.py), [`archiver/event_store.py`](../../archiver/event_store.py), [`archiver/tracking_chunks.py`](../../archiver/tracking_chunks.py), [`mcp_server/data_access.py`](../../mcp_server/data_access.py), [`infra/local/docker-compose.yml`](../../infra/local/docker-compose.yml), [`infra/modules/cosmos.bicep`](../../infra/modules/cosmos.bicep).

Specifications: [`archiver/specs/storage.md`](../../archiver/specs/storage.md), [`infra/specs/local-development.md`](../../infra/specs/local-development.md).

## Status and evidence

Local emulators and relay/archive stores exist. Stats moments land in Cosmos `moments` live exactly as in replay (F2, SYN-0507, 20 Oct). The storage spec is marked agreed in PR #59 (open). The local Cosmos emulator can corrupt its data if killed under memory pressure; recreate the container (`docker compose up -d --force-recreate cosmos` in `infra/local/`): it holds no persistent volume. Cloud composition is placeholder; `overlays`, `season` and `viewer_profiles` have no working producer yet.

Evidence / checks to inspect: [`archiver/tests/test_archiver.py`](../../archiver/tests/test_archiver.py), [`mcp_server/tests/test_cosmos.py`](../../mcp_server/tests/test_cosmos.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md), [environments](environments.md).

Downstream / consumers: [mcp](mcp.md), [ai-insights](ai-insights.md), [frontend](frontend.md), [web-pubsub](web-pubsub.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Keep source moments immutable and separate from delivery/job state. Do not equate emulator keys with production read-only RBAC.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav; Pranav helping for Cosmos; see Ownership above | Local stores/emulators exist; source moments and delivery state have different responsibilities. | [Specification](../../infra/specs/local-development.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### STORE-01

| Field | Value |
|---|---|
| Review/input needed from | Pranav |
| Request | Review the moment point-read and immutability boundary before hosted MCP integration; credentials/RBAC are separate from local emulator checks. |
| Connected component | [mcp](mcp.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | See canonical request MCP-02; record local and hosted checks separately. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Incoming handoff: [MCP-02](mcp.md#mcp-02) is the canonical moment-storage request.

[Project map](README.md) · [Rebuild and verification](setup.md)
