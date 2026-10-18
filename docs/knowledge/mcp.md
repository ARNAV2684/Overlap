# MCP context tools

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Provides bounded read-only access to one moment’s frozen context.

## Ownership

Registry: Unassigned (Arnav decides). See [registry](../../plans/REGISTRY.md). Team-reported: User reports Pranav owns MCP; registry has not recorded it.

## Inputs and outputs

Exact match/moment/evidence-version request → Cosmos moments point read → validated frozen context. Separate development seed command; no runtime writes or fixture fallback. Contract §10.2. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`mcp_server/server.py`](../../mcp_server/server.py), [`mcp_server/data_access.py`](../../mcp_server/data_access.py), [`mcp_server/tools/match_state.py`](../../mcp_server/tools/match_state.py), [`mcp_server/client.py`](../../mcp_server/client.py), [`mcp_server/sample.py`](../../mcp_server/sample.py).

Specifications: [`mcp_server/specs/tools.md`](../../mcp_server/specs/tools.md).

## Status and evidence

Implemented local first tool and protocol client, merged in PR #45. Other tool modules remain placeholders and are not advertised. No hosted agent integration.

Evidence / checks to inspect: [`mcp_server/tests`](../../mcp_server/tests), [`plans/active/PLAN_agents_ai-insights-mcp_S2.md`](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [storage](storage.md), [environments](environments.md).

Downstream / consumers: [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Recorded S2 evidence: 62 tests + two skipped without Cosmos; 64 with Cosmos. Not re-run here. Consume real stats moments when available; graph tooling is a separate system.

[Project map](README.md) · [Rebuild and verification](setup.md)
