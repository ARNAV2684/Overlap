# Event Hubs

Last verified: 2026-10-19 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Distributes match streams independently to consumers.

## Ownership

Registry: Arnav, Pranav. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Generator sends using match_id partition key. Consumer groups read separate event/tracking streams; no cross-hub ordering guarantee. Contract §1.4. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`infra/local/eventhubs-config.json`](../../infra/local/eventhubs-config.json), [`generator/live.py`](../../generator/live.py), [`infra/modules/event-hubs.bicep`](../../infra/modules/event-hubs.bicep).

Specifications: [`infra/specs/local-development.md`](../../infra/specs/local-development.md).

## Status and evidence

Implemented local configuration. Cloud Bicep module remains a placeholder. Both local hubs currently have four partitions and relay/stats/archiver consumer groups; do not copy older diagrams that omit tracking stats.

Evidence / checks to inspect: [`plans/active/PLAN_functions_screen-relay.md`](../../plans/active/PLAN_functions_screen-relay.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [generator](generator.md), [environments](environments.md).

Downstream / consumers: [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Keep hub/group settings compatible with consumers; cloud deployment and Functions-host verification remain separate work.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav / Pranav; see Ownership above | Local hub configuration exists; cloud module remains unfinished. | [Specification](../../infra/specs/local-development.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### HUB-01

| Field | Value |
|---|---|
| Review/input needed from | Azeem |
| Request | Confirm the live producer uses the configured hub names, match_id partition key and compatible setup/events/tracking. |
| Connected component | [generator](generator.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | One producer run and independent consumer readback; no cross-hub ordering assumption. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Producer-side compatibility request: [GEN-01](generator.md#gen-01).

[Project map](README.md) · [Rebuild and verification](setup.md)
