# Local development and Azure deployment

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

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

Local Compose/stand-in/tooling exist. Main Bicep and several cloud modules are placeholders. This note is not deployment evidence.

Evidence / checks to inspect: [`infra/local/webpubsub_standin/check_standin.py`](../../infra/local/webpubsub_standin/check_standin.py), [`infra/local/check_cosmos.py`](../../infra/local/check_cosmos.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: local tool installation and agreed settings; no upstream match-data producer.

Downstream / consumers: [generator](generator.md), [event-hubs](event-hubs.md), [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md), [storage](storage.md), [ai-insights](ai-insights.md), [mcp](mcp.md), [web-pubsub](web-pubsub.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Use approved local instructions. Do not start cloud resources or consume paid services for this knowledge-map milestone.

[Project map](README.md) · [Rebuild and verification](setup.md)
