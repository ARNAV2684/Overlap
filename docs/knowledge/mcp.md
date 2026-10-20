# MCP context tools

Last verified: 2026-10-20 · main `a1cef33` plus open PRs #58–#62 (labelled) · source inspection; F2 live run recorded.

## Purpose

Provides bounded read-only access to one moment’s frozen context.

## Ownership

Registry: Arnav from 20 Oct (registry PR #60, open). See [registry](../../plans/REGISTRY.md). Pranav built the first tool and client (#45).

## Inputs and outputs

Exact match/moment/evidence-version request → Cosmos moments point read → validated frozen context. Separate development seed command; no runtime writes or fixture fallback. Contract §10.2. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`mcp_server/server.py`](../../mcp_server/server.py), [`mcp_server/data_access.py`](../../mcp_server/data_access.py), [`mcp_server/tools/match_state.py`](../../mcp_server/tools/match_state.py), [`mcp_server/client.py`](../../mcp_server/client.py), [`mcp_server/sample.py`](../../mcp_server/sample.py).

Specifications: [`mcp_server/specs/tools.md`](../../mcp_server/specs/tools.md).

## Status and evidence

Implemented local first tool and protocol client, merged in PR #45. PR #58 (open) makes the reader accept every moment the stats engine writes (stats D-02: eight triggers, `context.players`, 1–500 event ids), tested on the 21 moments of `SYN-1017`; see [tools spec §2a](../../mcp_server/specs/tools.md). M2 (branch `mcp_server/tools`) adds five read-only analyst tools over `match_state` and the archived panels (tools spec §2b); `season` stays unadvertised. No hosted agent integration.

Evidence / checks to inspect: [`mcp_server/tests`](../../mcp_server/tests), [`plans/active/PLAN_agents_ai-insights-mcp_S2.md`](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [storage](storage.md), [environments](environments.md).

Downstream / consumers: [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Recorded S2 evidence: 62 tests + two skipped without Cosmos; 64 with Cosmos. Not re-run here. Consume real stats moments when available; graph tooling is a separate system.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Pranav (team-reported; registry unassigned); see Ownership above | First read-only context tool/client merged in PR #45; no hosted workflow or real stats producer integration. | [Specification](../../mcp_server/specs/tools.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### MCP-01

| Field | Value |
|---|---|
| Review/input needed from | Azeem (team-reported stats owner) |
| Request | Provide a real producer-written moments document with evidence facts, source cursor, matching version and frozen context; compare it to CONTRACTS §10.2 and the MCP validator. |
| Connected component | [stats-engine](stats-engine.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | Validator and MCP readback succeed against the actual producer document; record producer/consumer commits. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

### MCP-02

Input from Arnav: confirm source-moment container/partition/read identity and immutability against [storage](storage.md). Local readback is already recorded in [S2](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md); hosted RBAC is not proven. Status: proposed follow-up review, no fresh response recorded. Close with an explicit storage decision and separately identified environment evidence.

### Connection to Vedant

Vedant is the downstream screen owner, not an input provider to the first MCP point-read tool. The frontend review belongs to [AI-01](ai-insights.md#ai-01): card shape, expiry and reconnect. MCP → insights → delivery → frontend is the dependency chain. MCP does not fetch UI state to replace frozen moment context.

Earlier user-reported agreements are recorded in [S2 preconditions](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md#2-preconditions); they do not establish a working real producer or hosted workflow.



[Project map](README.md) · [Rebuild and verification](setup.md)
