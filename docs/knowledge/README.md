# Overlap project map

Verified against main `a61166b` on 19 October 2026. PR #46 and #45 are merged. PR [#47](https://github.com/ARNAV2684/Overlap/pull/47) (these notes) is an open draft; PR [#48](https://github.com/ARNAV2684/Overlap/pull/48) (`web/live-api`, `0ef55ee`) is open and unmerged. Branch work is not current main.

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

## Who to coordinate with

| Person | Recorded responsibility | Notes and handoffs |
|---|---|---|
| Azeem | Generator (registry); stats (team-reported, registry unresolved) | [Generator](generator.md), [stats](stats-engine.md), [MCP-01 producer input](mcp.md#mcp-01) |
| Arnav | Relay, archiver, Cosmos, PubSub and local stack; Event Hubs with Pranav (registry) | [Relay](screen-relay.md), [archive](archiver.md), [storage](storage.md), [PubSub](web-pubsub.md), [environment](environments.md), [MCP-02](mcp.md#mcp-02) |
| Pranav | Event Hubs and helping shared infrastructure (registry); insights/MCP (team-reported) | [Hubs](event-hubs.md), [MCP](mcp.md), [insights](ai-insights.md) |
| Vedant | Frontend (registry) | [Frontend](frontend.md), [card review AI-01](ai-insights.md#ai-01), [relay review](screen-relay.md#relay-01) |

Each component's coordination section identifies the required input, reviewer, acceptance evidence and unresolved status. These are proposed review items, not sent messages or newly assigned tasks. Record agreements in the canonical request section with a PR/decision link; other notes link back instead of copying status. No deadline is invented.

GitHub stores the shared notes. Teammates receive merged updates by pulling; the current graph still requires manual regeneration. A future hosted graph can rebuild automatically after merges, but cannot infer private conversations or rewrite human ownership/approval decisions. Automatic laptop fetch, background hooks and private chat ingestion are not installed.
