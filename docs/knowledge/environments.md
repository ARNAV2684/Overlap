# Local development and Azure deployment

Last verified: 2026-10-24 · branch `infra/azure-foundation` · A0 provisioned and checked on Azure.

## Purpose

Provides reproducible local service substitutes and planned cloud deployment boundaries.

## Ownership

Registry: Arnav (Pranav helping) for local stack; other infrastructure unassigned. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Local processes use emulator endpoints; cloud deployment will require actual resources/identity/settings. Git transfers code and instructions, not databases or processes. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`infra/local/docker-compose.yml`](../../infra/local/docker-compose.yml), [`infra/local/check_cosmos.py`](../../infra/local/check_cosmos.py), [`infra/main.bicep`](../../infra/main.bicep), [`azure.yaml`](../../azure.yaml).

Specifications: [`infra/specs/local-development.md`](../../infra/specs/local-development.md), [`infra/specs/resources.md`](../../infra/specs/resources.md), [`infra/specs/costs.md`](../../infra/specs/costs.md).

## Status and evidence

Local Compose/stand-in/tooling exist. Azure: sprint A0 is deployed (resource group `rg-overlap`, Sweden Central: four managed identities, a storage account with shared keys off, Log Analytics with a 0.5 GB daily cap, Application Insights). Event Hubs, Cosmos DB, Web PubSub, Foundry, Translator, the Functions app and Container Apps follow in sprints A1–A10 ([`PLAN_infra_azure-pass`](../../plans/active/PLAN_infra_azure-pass.md)); their modules are still placeholders.

Evidence / checks to inspect: [`infra/local/webpubsub_standin/check_standin.py`](../../infra/local/webpubsub_standin/check_standin.py), [`infra/local/check_cosmos.py`](../../infra/local/check_cosmos.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: local tool installation and agreed settings; no upstream match-data producer.

Downstream / consumers: [generator](generator.md), [event-hubs](event-hubs.md), [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md), [storage](storage.md), [ai-insights](ai-insights.md), [mcp](mcp.md), [web-pubsub](web-pubsub.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Use approved local instructions. Do not start cloud resources or consume paid services for this knowledge-map milestone.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Arnav; Pranav helping for local stack; other infrastructure unassigned; see Ownership above | Local service substitutes exist; cloud deployment remains a separate unfinished milestone. | [Specification](../../infra/specs/local-development.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### ENV-01

| Field | Value |
|---|---|
| Review/input needed from | Arnav |
| Request | Confirm Pages availability and workflow permissions for documentation hosting; this is separate from Azure runtime deployment. |
| Connected component | [README](README.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | Repository settings confirmed by an authorised maintainer; no new paid service or account change. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |



[Project map](README.md) · [Rebuild and verification](setup.md)
