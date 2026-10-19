# Synthetic generator

Last verified: 2026-10-19 · source main `a61166b` · source inspection, not fresh runtime certification.

## Purpose

Builds invented squads and simulates seeded matches, events and tracking.

## Ownership

Registry: Azeem. See [registry](../../plans/REGISTRY.md). Team-reported: None beyond registry.

## Inputs and outputs

Seeded world/settings → setup/actions on match-events and tracking on match-tracking; recorded output is also available. Contract §§1.4, 2–4. See [shared contracts](../../CONTRACTS.md).

## Implementation and specifications

Source: [`generator/cli.py`](../../generator/cli.py), [`generator/world.py`](../../generator/world.py), [`generator/engine.py`](../../generator/engine.py), [`generator/movement.py`](../../generator/movement.py), [`generator/live.py`](../../generator/live.py), [`generator/batch.py`](../../generator/batch.py), [`generator/storylines.py`](../../generator/storylines.py).

Specifications: [`generator/specs/live-and-batch.md`](../../generator/specs/live-and-batch.md), [`generator/specs/world.md`](../../generator/specs/world.md).

## Status and evidence

Implemented: world, engine, movement, storylines, live and batch modules contain code. This documentation run does not re-test simulation realism.

Evidence / checks to inspect: [`generator/tests`](../../generator/tests), [`plans/active/PLAN_generator_match-engine.md`](../../plans/active/PLAN_generator_match-engine.md). Existing recorded tests are attributed to their handover; no runtime suite was re-run for these notes.

## Dependencies

Upstream / prerequisites: [environments](environments.md).

Downstream / consumers: [event-hubs](event-hubs.md).

Connections include planned dependencies; status above determines whether a connection exists at runtime.

## Next work

Use generated fictional demo clubs; review current calibration/storyline and season evidence rather than assuming all quality targets are met.

## Work and coordination record

Verified 19 October 2026 against main `a61166b`. This describes recorded responsibility and repository evidence, not a live report of someone's laptop activity.

| Responsible person / basis | Recorded work | Governing reference | Current integration boundary |
|---|---|---|---|
| Azeem; see Ownership above | World, engine, movement and live/batch production exist; current implementation is not a fresh realism test. | [Specification](../../generator/specs/live-and-batch.md) | See Inputs and outputs and Status above; implementation and review are distinct. |

### GEN-01

| Field | Value |
|---|---|
| Review/input needed from | Arnav / Pranav |
| Request | Confirm a generated setup, action and tracking recording reaches both hubs with the agreed IDs, ordering and timing. |
| Connected component | [event-hubs](event-hubs.md) |
| Why it matters | A mismatch here can block the connected component; do not create a private contract to work around it. |
| Done when | A recorded generator-to-hubs readback result linked to its revision. |
| Status | Proposed coordination item; no notification sent and no fresh reviewer acceptance recorded. |
| Decision evidence / due date | Not recorded / no deadline agreed. Record the review URL and affected revision here when available. |

Consumer-side compatibility request: [HUB-01](event-hubs.md#hub-01).

[Project map](README.md) · [Rebuild and verification](setup.md)
