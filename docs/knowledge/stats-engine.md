# Stats engine

Last verified: 2026-10-20 · branch `stats/numbers` (from main `7bda05a`) · specs agreed (#50); stats S1 runtime: replay only.

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

Specifications agreed in #50.

**Built in stats S1:** ordering, match state, xG, pass difficulty, speeds, sprints and whole-match totals, the `main.py replay` runner, and the hub consumer (unit-tested with a fake client). 27 tests pass.

**Cross-checks on generated data:**
- **xG:** goals ÷ engine xG is 1.08 over 180 league matches.
- **PPDA:** equals the generator's answer key.
- **Possession:** 0.03 from the generator's internal ball-time, a definition difference.

**Not running yet:** no live service, panels, `match_state` or moments; `rolling.py`, `publish.py`, `triggers.py` and `evidence.py` are placeholders. Do not infer more from README file lists.

Evidence / checks to inspect: [`stats/tests`](../../stats/tests), [`CONTRACTS.md`](../../CONTRACTS.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [environments](environments.md).

Downstream / consumers: [screen-relay](screen-relay.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Next:

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
