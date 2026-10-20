# PLAN_agents_insights-build_S3 — shared job state, the seven-stage workflow and recovery (M3)

| Field | Complete this |
|---|---|
| Sprint | S3 — durable job per moment, budget and outbox in Cosmos, the Agent Framework workflow with seven stages, recovery, local poller and the Azure change-feed trigger |
| Parent plan | [`PLAN_agents_insights-build.md`](PLAN_agents_insights-build.md) · v0.1 |
| Milestone in parent plan | M3 · AC-03 |
| Author / owner | Arnav |
| Status | Built; PR open for review |
| Reviewed branch and commit | `agents/model-switch` (M1, PR #64) on main · 67bf962 |
| Planned branch | `agents/workflow` (stacked on `agents/model-switch` until #64 merges) |

## 1. Outcome

- **What will work at the end of this sprint:** a moment document reaches the agents through one entry point —
  locally a poller on Cosmos `moments`, on Azure a Cosmos change-feed Function — and runs as a job:
  - the job is claimed once (`job:<moment_id>`, conditional create), with a lease (ETag, generation, expiry) so a
    second worker can't run it at the same time and a crashed one is picked up after the lease expires;
  - a per-match budget document (`budget:<match_id>`) reserves model calls and tokens durably (the M1 gate uses it);
  - an Agent Framework workflow runs seven stages in order — spotter, analyst, narrator, fact-checker, translator,
    director, then the outbox — and saves each stage's output on the job, so a resumed job continues where it
    stopped;
  - the director's result is written to a durable outbox (`outbox:<moment_id>`) before anything is sent (sending is
    M5);
  - without a model (provider `off`), every stage falls back to labelled templates per trigger, so the whole chain
    already produces checked lines.
- **Not in this sprint:** the agents' model behaviour and prompts (M4), publishing to Web PubSub (M5).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Agreed workflow spec (job, lease, budget, outbox, failure table) | `agents/specs/workflow.md` (#61) | Yes |
| M1 settings, model gate | PR #64 | Built (not merged; this branch stacks on it) |
| Moment shape validator | `mcp_server/schema.py` (#58) | Yes |
| Arnav's approval to edit `functions/function_app.py` | Arnav, 20 Oct ("add it in M3") | Yes |
| Team xG may pass 1 in a valid moment | PR #66 (`mcp_server/team-xg-fix`), carried here as a cherry-pick | Built (not merged) |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `agents/state.py` | Modify | Job, budget and outbox documents; in-memory and Cosmos stores; claim, lease, resume | `workflow.md` §2 |
| `agents/pyproject.toml` | Modify | Add `azure-cosmos` 4.17.1 and `aiohttp` (same pins as the MCP server) for the Cosmos store | `workflow.md` §2 |
| `agents/validate.py` | Add | Validates a moment with the MCP reader's schema (one source of truth) | `tools.md` §2a |
| `agents/fallbacks.py` | Modify | Labelled template per trigger and mode, filled only from facts and names | `workflow.md` §4 |
| `agents/workflow.py` | Modify | Agent Framework workflow of seven stages, stage checkpoints on the job, deadline | `workflow.md` §1, §3 |
| `agents/models.py` | Modify | The gate also accepts an async (durable) budget | `workflow.md` §3 |
| `agents/tests/conftest.py`, `test_workflow.py`, `test_fallbacks.py`, `test_trigger.py` | Add | Claim, lease, resume and recovery cases; templates; the trigger's batches, polling and closing | `workflow.md` §4, `evaluation.md` |
| `mcp_server/schema.py`, its test and `tools.md` §2 | Modify (PR #66) | Only `shot_xg` is capped at 1; a team's match xG can pass it | `tools.md` §2a |
| `functions/moment_trigger.py` | Modify | Entry point for a batch of moment documents; local poller CLI | `moment-trigger.md` |
| `functions/function_app.py` (shared; own commit) | Modify | Register `moment_trigger` (Cosmos change feed on `live/moments`, lease container `leases`); agents imported lazily inside it so the relay and archiver can't be broken by it | `moment-trigger.md` |
| `agents/README.md`, `docs/knowledge/ai-insights.md` | Modify | How to run; status | — |
| This plan | Add | Status, handover | — |

## 4. Steps

1. Stores: documents, claim, lease, budget, outbox; in-memory first, then Cosmos with ETags.
2. Templates per trigger; moment validation.
3. Workflow: seven executors on Agent Framework `WorkflowBuilder`, each calling a pluggable stage (template stages
   for now), saving its output on the job; deadline and budget handling.
4. Entry point and local poller; `function_app.py` registration in its own commit; relay and archiver tests re-run.
5. Recovery tests; one live run against the local Cosmos with the moments of a played match.

## 5. Contracts and shared files

- **Contract changes:** none. Job, budget and outbox documents live in `moments` filtered by `kind`, as the stats
  agents guide allows.
- **Hot shared files touched:** `functions/function_app.py` (Arnav approved; own commit).

## 6. Conflict scan

Scanned at `67bf962` on 2026-10-20: open PRs #64 (this branch's base) and #65 (`mcp_server/`, not touched here).
No other branch touches these files. Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-03a | Duplicate notification, crash after claim (lease expiry → second worker resumes from the saved stage), crash after outbox (no stage reruns), conflicting source under the same id (terminal conflict), restart past the deadline (suppressed or template), budget exhausted (template, no model call) all behave as `workflow.md` §4 says | Recovery tests, models stubbed | Pass: `test_workflow.py` duplicate, crash-after-claim, crash-after-outbox, conflicting source, invalid moment, lease lost, past deadline, suppression, durable budget (concurrent writers) and gate-uses-budget cases |
| AC-03b | With provider `off`, a real moment runs through all seven stages and writes an outbox with labelled template lines for every mode | Unit test on `SYN-1017` moments | Pass: all 21 SYN-1017 moments run through; every template passes the numeric check in all four modes; outbox carries en/es/hi/fr for casual, analyst, club and player groups (`fallback` true, `verified` false) |
| AC-03c | Against the local Cosmos, the poller picks up a played match's moments, claims each once, and writes job and outbox documents; a second poller run does nothing new | Live run | Pass on SYN-0508 (27 moments): 27 jobs at `delivery_pending` with 27 outboxes; re-runs resume at delivery without re-running stages or writing new documents; a second worker inside the lease skips (also `test_trigger.py`). The first run rejected MO-0508-0007 (team xG 1.14), fixed by PR #66 |
| AC-03d | The Functions app still loads the relay and archiver functions, plus `moment_trigger`; relay and archiver tests pass | Import check + existing tests | Pass: 6 functions (`archive_events`, `archive_tracking`, `moment_trigger`, `relay_events`, `relay_tick`, `relay_tracking`); relay 17 passed; archiver 6 passed, 1 skipped |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Cosmos emulator change-feed support | The Azure trigger is unproven locally | — | None: the poller covers local runs; change feed is checked in M7 |
| Agents dependencies on the Functions app on Azure | `moment_trigger` fails to import | Arnav (M7 packaging) | M7; lazy import keeps the relay and archiver safe |

## 9. Handover

- **Built:** `state.py` (memory and Cosmos stores, claim with lease and generation, stage saves, outbox, durable
  budget), `validate.py`, `fallbacks.py` (templates per trigger and mode), `workflow.py` (seven Agent Framework
  executors with pluggable stages; template stages for now), `models.py` (gate accepts the durable budget),
  `functions/moment_trigger.py` (batch entry point and local poller; closes the Cosmos client it opens) and the
  `moment_trigger` registration in `function_app.py` (own commit).
- **Checks:** agents 61 passed, ruff clean; mcp_server 124 passed, 3 skipped; relay 17 passed; archiver 6 passed,
  1 skipped. Live run on SYN-0508 as in AC-03c.
- **Design notes:** Agent Framework deep-copies messages between executors, so the run's live state (store, job,
  clients) stays in a per-run registry and only a frozen key travels as the message. A job at `delivery_pending` is
  left for the publisher (M5); the same worker resuming it does not re-run any stage.
- **Local data note:** the stale `rejected` job for MO-0508-0007 (from before the xG fix) was removed from the local
  emulator so the moment could run again; nothing else was changed by hand.
- **Not done here:** model-backed stages and prompts (M4); sending the outbox to Web PubSub and the insights
  snapshot (M5); the Cosmos change feed is proven on Azure in M7.
- **Merge order:** #64 (M1), #66 (xG fix), then this PR.
