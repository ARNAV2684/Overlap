# Stats engine

Last verified: 2026-10-19 · branch `stats/specs` (from main `5ef36be`) · specifications written; runtime not started.

## Purpose

Calculates deterministic metrics and spots moments for explanation.

## Ownership

Registry: Unassigned (Arnav decides). See [registry](../../plans/REGISTRY.md). Azeem owns stats by his own report and in [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (D-07 asks Arnav to record it); the registry has not recorded it yet.

## Inputs and outputs

Specified in the stats spec PR (not yet built):

- **In:** both hubs as consumer group `stats`.
- **Out, stat panels:** once per match second as `kind=stats` on `match-events`; the relay forwards them and the archiver keeps them (CONTRACTS §7.4).
- **Out, match state:** the latest numbers in Cosmos `match_state` (§4.2).
- **Out, moments:** documents in Cosmos `moments` with evidence packs and frozen context (§5, §10.1–§10.2, used for every trigger).

See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`stats/consumer.py`](../../stats/consumer.py), [`stats/main.py`](../../stats/main.py), [`stats/publish.py`](../../stats/publish.py), [`stats/triggers.py`](../../stats/triggers.py), [`stats/evidence.py`](../../stats/evidence.py).

Specifications: [`stats/specs/metrics.md`](../../stats/specs/metrics.md), [`stats/specs/windows.md`](../../stats/specs/windows.md), [`stats/specs/triggers.md`](../../stats/specs/triggers.md), [`stats/specs/evidence-packs.md`](../../stats/specs/evidence-packs.md), [`stats/specs/publishing.md`](../../stats/specs/publishing.md); plan [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md).

## Status and evidence

Unavailable runtime: stats entrypoints and calculations remain placeholder headers. All five specifications are answered in the stats spec PR. The xG and pass-difficulty models were fitted and checked on generated league seasons; the trigger volumes were measured on 90 generated matches. Do not infer implementation from README file lists.

Evidence / checks to inspect: [`stats/tests`](../../stats/tests), [`CONTRACTS.md`](../../CONTRACTS.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [environments](environments.md).

Downstream / consumers: [screen-relay](screen-relay.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Once the spec PR merges:

- **S1:** numbers from a recorded match.
- **S2:** live panels through the relay and archiver.
- **S3:** moments, starting with `shot_cluster` exactly as Pranav's KES–ORR fixture (seed 1017) expects. That fixture still matches the current generator.

The MCP sample is not a working stats producer.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Azeem (team-reported; registry unassigned); see Ownership above | Runtime remains placeholders at the inspected main revision; producer implementation is required. | [Specification](../../stats/specs/evidence-packs.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### STATS-01

| Field | Value |
|---|---|
| Review/input needed from | Pranav |
| Request | Validate the first real moment against the MCP source validator, including immutable evidence, cursor and frozen context. |
| Connected component | [mcp](mcp.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | See canonical request MCP-01 below; a constructed sample alone does not close it. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Incoming handoff: [MCP-01](mcp.md#mcp-01) is the canonical consumer request. Update that record with evidence rather than maintaining a second acceptance status.

[Project map](README.md) · [Rebuild and verification](setup.md)
