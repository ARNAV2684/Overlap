# Synthetic generator

Last verified: 2026-10-18 · source main `a61166b` · source inspection, not fresh runtime certification.

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

[Project map](README.md) · [Rebuild and verification](setup.md)
