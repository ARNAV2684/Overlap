# Local development and Azure deployment

Last verified: 2026-10-24 · branch `infra/azure-wave2` · every module deployed, A8 run, then paused.

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

Local Compose/stand-in/tooling exist. Azure (Sweden Central, `rg-overlap`): every module is deployed and a full 20× match ran entirely on Azure on 24 Oct (SYN-3000 to SYN-3008: archives identical to the recordings, every reader 0–3 s behind, no failed runs). The relay and the archiver/agents run as two Functions apps on one B3 plan; web, stats and the generator job on Container Apps. Paused after A8: the hourly-billed parts are deleted and the public link (`ca-overlap-web…azurecontainerapps.io`) serves replays. Runbook: [`infra/README.md`](../../infra/README.md); results: [`PLAN_infra_azure-pass`](../../plans/active/PLAN_infra_azure-pass.md) handover.

Evidence / checks to inspect: [`infra/local/webpubsub_standin/check_standin.py`](../../infra/local/webpubsub_standin/check_standin.py), [`infra/local/check_cosmos.py`](../../infra/local/check_cosmos.py). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: local tool installation and agreed settings; no upstream match-data producer.

Downstream / consumers: [generator](generator.md), [event-hubs](event-hubs.md), [screen-relay](screen-relay.md), [archiver](archiver.md), [stats-engine](stats-engine.md), [storage](storage.md), [ai-insights](ai-insights.md), [mcp](mcp.md), [web-pubsub](web-pubsub.md), [frontend](frontend.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Resume for a demo or judging run with the five settings in `infra/README.md` (Pause and resume). Agents at 20× still publish checked templates only: see the plan's A8 notes.

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
