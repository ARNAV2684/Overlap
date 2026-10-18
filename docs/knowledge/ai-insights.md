# AI insights workflow

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Turns a selected moment into a grounded explanation and eventually a verified card.

## Ownership

Registry: Unassigned (Arnav decides). See [registry](../../plans/REGISTRY.md). Team-reported: User reports Pranav owns insights; registry has not recorded it.

## Inputs and outputs

Planned: stats moment in Cosmos → trigger → workflow asks MCP for context → evidence-grounded explanation/claim checks → delivery. Only evidence facts supply narrated numbers. Contract §§5–6, 10. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`agents/workflow.py`](../../agents/workflow.py), [`agents/narrator.py`](../../agents/narrator.py), [`agents/fact_checker.py`](../../agents/fact_checker.py), [`agents/director.py`](../../agents/director.py), [`functions/moment_trigger.py`](../../functions/moment_trigger.py).

Specifications: [`agents/specs/workflow.md`](../../agents/specs/workflow.md), [`agents/specs/fact-checking.md`](../../agents/specs/fact-checking.md), [`functions/specs/moment-trigger.md`](../../functions/specs/moment-trigger.md).

## Status and evidence

Agreed design exists; workflow, moment trigger and agent runtime files remain placeholders. No hosted model integration, narration, fact-check execution or live card path is proven by local MCP.

Evidence / checks to inspect: [`plans/active/PLAN_agents_ai-insights-mcp.md`](../../plans/active/PLAN_agents_ai-insights-mcp.md), [`plans/active/PLAN_agents_ai-insights-mcp_S2.md`](../../plans/active/PLAN_agents_ai-insights-mcp_S2.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [stats-engine](stats-engine.md), [storage](storage.md), [mcp](mcp.md), [environments](environments.md).

Downstream / consumers: [web-pubsub](web-pubsub.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Model access, bounded budget and stats producer integration are later gates. Graphify work does not resume this paused feature.

[Project map](README.md) · [Rebuild and verification](setup.md)
