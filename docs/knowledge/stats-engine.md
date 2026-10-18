# Stats engine

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Calculates deterministic metrics and spots moments for explanation.

## Ownership

Registry: Unassigned (Arnav decides). See [registry](../../plans/REGISTRY.md). Team-reported: User reports Azeem has agreed to own stats; registry has not recorded it.

## Inputs and outputs

Planned: hubs → stats panels for relay/archive, moments with evidence and frozen context, match-state snapshots. Contract §§5, 8, 10; unresolved shapes remain in §9. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`stats/consumer.py`](../../stats/consumer.py), [`stats/main.py`](../../stats/main.py), [`stats/publish.py`](../../stats/publish.py), [`stats/triggers.py`](../../stats/triggers.py), [`stats/evidence.py`](../../stats/evidence.py).

Specifications: [`stats/specs/publishing.md`](../../stats/specs/publishing.md), [`stats/specs/triggers.md`](../../stats/specs/triggers.md), [`stats/specs/evidence-packs.md`](../../stats/specs/evidence-packs.md).

## Status and evidence

Unavailable runtime: stats entrypoints and calculations remain placeholder headers. Specifications contain unfinished work. Do not infer implementation from README file lists.

Evidence / checks to inspect: [`stats/tests`](../../stats/tests), [`CONTRACTS.md`](../../CONTRACTS.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [event-hubs](event-hubs.md), [environments](environments.md).

Downstream / consumers: [screen-relay](screen-relay.md), [archiver](archiver.md), [storage](storage.md), [ai-insights](ai-insights.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Agree remaining producer shapes and implement the first evidence-producing trigger. The MCP sample is not a working stats producer.

[Project map](README.md) · [Rebuild and verification](setup.md)
