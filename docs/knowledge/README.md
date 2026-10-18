# Overlap project map

Verified against main `a61166b` on 18 October 2026. PR #46 (knowledge spec) and #45 (local MCP) are merged. No open PRs returned by the scan. `web/live-api` at `015a194` is an unmerged branch; do not treat it as current main.

Start with the notes below. Graphify helps navigate source; an arrow is not proof that a live integration passed. [Contracts](../../CONTRACTS.md), [registry](../../plans/REGISTRY.md) and component specs retain authority. Notes are source-inspected and await component-owner factual review.

## Live screen path

[Generator](generator.md) → [Event Hubs](event-hubs.md) → [Screen relay](screen-relay.md) → [Web PubSub](web-pubsub.md) → [Frontend](frontend.md).

Relay persists recoverable screen state in [storage](storage.md). Local relay handover records a full-match transport test; it does not certify the current frontend/cloud integration.

## Archive and replay path

[Event Hubs](event-hubs.md) → [Archiver](archiver.md) → [Cosmos + Blob](storage.md) → archive reader → [Frontend replay](frontend.md) (integration still to verify).

## Insight path

[Event Hubs](event-hubs.md) → [Stats engine](stats-engine.md) (placeholder) → moments in [storage](storage.md) → [AI workflow](ai-insights.md) (placeholder), using [MCP](mcp.md) (local first tool implemented) → [PubSub](web-pubsub.md) → [Frontend](frontend.md) (future verified cards).

Only evidence facts may supply narrated numbers. The seeded MCP example does not prove a working stats publisher, model or overlay.

## Environments and navigation

[Local/cloud environment](environments.md) connects the boxes. [Setup](setup.md) explains the isolated Graphify tool, source filters, manual rebuild and stale-output checks. [Validation](validation.md) records exactly what was exercised.

## Maintaining this map

Update the affected component note in the same PR as a dependency, interface, setup or readiness change. Keep incoming and outgoing links consistent. Record the evidence revision, distinguish existing checks from fresh tests, and label open-branch work separately. Do not overwrite registry ownership from a private discussion.

After pulling, rebuild manually; generated graphs are ignored. No new API key, Graphify Cloud account, Azure subscription or automatic CI run is needed. Existing assistant usage limits still apply. Source extraction is local; document analysis in your existing assistant follows that assistant's normal data processing.
