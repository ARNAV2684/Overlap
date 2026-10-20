# PLAN_stats_engine — the stats engine: match events in, numbers, stat panels and evidence-backed moments out

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Stats engine (DFD layer 3): deterministic numbers for every screen, and the moments with evidence that the AI agents explain |
| Author / primary owner | Azeem (reported by Azeem as assigned to him; `plans/REGISTRY.md` still says "Unassigned (Arnav decides)", see D-07) |
| Collaborators and responsibilities | Arnav: review coordinator; relay, archiver and storage on the receiving side; Azure resources. Pranav: consumer of moments and evidence (insights, MCP). Vedant: consumer of stat panels (charts) |
| Review coordinator | Arnav |
| Affected component owners | Arnav (screen relay, archiver, Cosmos, `CONTRACTS.md`), Pranav (agents, MCP), Vedant (web charts) |
| Proposal version and date | v0.1 · 2026-10-19 |
| Status | In progress (M1 merged in PR #50; S1 in PR #51; S2 in PR #53; S3 in review, see [`PLAN_stats_engine_S3.md`](PLAN_stats_engine_S3.md); S4 waits on Azure) |
| Plan tier and file | Full · `plans/active/PLAN_stats_engine.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 5ef36be |
| Architecture box / work area | Layer 3 · stats engine (`stats/`); outputs to layers 2 (relay, archiver), 4 (Cosmos) and 5 (agents) |
| Relevant issue, spec PR, or discussion | Expanded DFD (layer 3: dedupe + order, match state, per-event stats, rolling windows, whole-match stats, publish step); Arnav's work map 17 Oct (ST1–ST5); `CONTRACTS.md` §5, §7.2, §8, §9, §10 (proposed by Pranav) |

## 1. Purpose and intended outcome

- **Problem or need:** every number the viewer sees or hears must come from code, not from a model. Today nothing
  computes them: `stats/` holds placeholder headers and five unanswered specs. The insights path (Pranav) is blocked
  on a producer of moments and evidence. The charts (Vedant) need a stat panel payload that nobody has defined
  (`CONTRACTS.md` §9).
- **Proposed outcome:** a Python service that reads a match's ordered events and tracking frames and works out the
  numbers: xG, pass difficulty, speeds, possession, PPDA, press height, momentum, totals. It produces three things:
  - **Stat panels:** sent once a second as `kind=stats` on `match-events`. The relay forwards them to browsers and the
    archiver saves them.
  - **Match-state snapshots** in Cosmos `match_state`.
  - **Moments:** written to Cosmos `moments`, each with an evidence pack whose facts are the only numbers an agent
    may cite.
- **Benefit to viewers or teammates:** live charts get real numbers, and the agents get grounded moments, so
  narrated numbers can be fact-checked. The generator's storyline answer keys become a recall test for the
  triggers.
- **Success statement:** for a full generated match streamed through the local stack, every stat panel reaches the
  browser socket and the archive in order. Every moment has a valid evidence pack that the MCP reader accepts. The
  engine's own numbers agree with the generator's answer key within stated tolerances.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code | main · 5ef36be · `stats/*.py`, `stats/tests/*.py` | Placeholder headers only; no package metadata, no runtime |
| Governing specs | `stats/specs/metrics.md`, `windows.md`, `triggers.md`, `evidence-packs.md`, `publishing.md` | All `Status: not started`. This plan's M1 writes them (spec gate) |
| Shared contracts | `CONTRACTS.md` at 5ef36be: §1.4 transport, §3 event, §4 frame, §5 evidence pack, §7.2 payloads, §8 metric definitions, §9 open questions, §10 proposed insight handoffs | §5 and §8 give starting definitions. §7.2 leaves the `stats` payload to the stats engine (§9). §10.1–§10.2 propose the shot-cluster rule and the immutable moment document, awaiting the stats owner's agreement |
| Neighbours already built | `functions/specs/screen-relay.md` (forwards `kind=stats` unchanged), `archiver/specs/storage.md` (saves panels to Cosmos `stats` as `stats-<match_ms>`), `mcp_server/` (reads a stored moment) | The receiving sides of panels and moments exist |
| Generator outputs | `generator/` on main (M5 merged in #40) | Events, frames, recordings, and per-match storyline answer keys (`summary.json`) for testing |
| Diagrams | Expanded DFD (layer 3 boxes, owners Azeem + Arnav); work map 17 Oct (ST1–ST5) | The six internal steps and the five tasks this plan follows |
| Knowledge notes | `docs/knowledge/stats-engine.md` (Pranav, 19 Oct) | Requests STATS-01: validate the first real moment against the MCP reader. Notes must be updated in the same PR as an interface change (`docs/specs/knowledge-sharing.md`) |

**Differences between references:**
1. **Owners.** The DFD names Azeem + Arnav and the registry says unassigned (D-07).
2. **Triggers.** §5 lists nine triggers. §10.1 proposes only `shot_cluster` for the first slice, with stricter
   rules (warm-up, cooldown, two facts). This plan keeps §10.1 for `shot_cluster` and adds the others (D-03).
3. **Snapshots.** The work map calls `match_state` "overlaps with screen, decide in stats plan" (D-02).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| The five stats specs and their `CONTRACTS.md` edits (§5, §7.2, §8, §9, §10 promotion) | Agent prompts, the fact-checker, overlays, translation (Pranav) |
| Consumer of both hubs (group `stats`), dedupe by `seq`, match state | Relay forwarding and the archiver's `stats` container (exist; Arnav) |
| Per-event metrics: xG, pass difficulty, ball and player speeds, distance, sprints | Chart components (Vedant) |
| Rolling windows (5 and 10 min) and whole-match stats (totals, pass network, pressing grid, zones) | Season aggregates and the Cosmos `season` loader (owner unassigned) |
| Stat panels once a second; `match_state` snapshots | `viewer_profiles` (no owner) |
| Triggers, evidence packs and immutable moment documents in Cosmos `moments` | The agent workflow's outbox and overlays (Pranav) |
| An offline runner that replays recorded matches (tests, calibration) | Azure resources and deployment (AZ1/AZ2; Arnav, Pranav). This plan supplies the container and settings |

- **Minimum complete result:**
  - Consumer, dedupe and state.
  - xG, possession, shots, passes, momentum and PPDA.
  - A stat panel once a second that reaches the browser socket and the archive locally.
  - The `goal`, `big_chance` and `shot_cluster` triggers, with §5 evidence and §10.2 moment documents the MCP
    reader accepts.
- **Optional extension:** the `momentum_swing`, `press_change`, `sprint` and `milestone` triggers; pass network;
  pressing grid; control ↔ chaos and rhythm.
- **Boundary with neighbouring components:**
  - The stats engine ends where a panel is sent to the hub and a moment document is written.
  - It never writes to Web PubSub (the relay is the sole sender to `match-<id>`) and never calls a model.
  - It reads only §3 events and §4 frames. It never reads generator storyline labels or answer keys at runtime:
    those are for tests only.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| `CONTRACTS.md` §7.2 / §9 stat panel payload | Arnav (contract), Vedant (charts), relay and archiver pass it through | Agreement on the panel shape and rate | Pending · M1 | Panels built to the proposed shape and tested against the relay locally |
| `CONTRACTS.md` §10.1–§10.2 (shot cluster, moment document) | Pranav (consumer), Arnav | Promotion from "proposed" to agreed, plus the other trigger types | Pending · M1 | Pranav's fixtures (KES–ORR, seed 1017) as the expected output |
| Cosmos `moments`, `match_state` containers and keys | Arnav (storage), Pranav (MCP reader) | Container, partition `/match_id`, document shapes (D-02) | Pending · M1 decision; working locally by S3 | Cosmos emulator, as the archiver uses |
| Event Hubs `stats` consumer group | Arnav | Exists locally on both hubs (`infra/local/eventhubs-config.json`) | Confirmed locally; Azure pending (AZ1) | Local emulator |
| Generator recordings and answer keys | Azeem | Recorded matches with storylines; `summary.json` answer keys | Available (main) | — |
| MCP reader validation (STATS-01) | Pranav | Validates the first real moment | Partly done in S3: shot clusters pass with `context.players` removed; the rest waits on his D-02 update | Pranav's source validator run locally |
| Registry ownership | Arnav | Record the stats owner (D-07) | Pending · M1 | — |

**My owned deliverables:** the specs, `stats/` code and tests, the stats sections of `CONTRACTS.md` (with agreement),
and `docs/knowledge/stats-engine.md`.
**Shared deliverables:**
- The panel shape, with Vedant and Arnav.
- The moment document and evidence facts, with Pranav.
- The `match_state` decision, with Arnav and Pranav.

## 5. Proposed flow

```text
generator --live -> match-events --(group stats)--> consumer -> dedupe/order -> match state -> per-event metrics
                 -> match-tracking --(group stats)--------------------------------^ (speeds, distance, sprints)
                                                                       |
                         rolling windows (5/10 min) + whole-match stats <-+
                                                                       |
                                                                 publish step
              +-- stat panel (1/s) -> match-events kind=stats -> relay -> browsers;  archiver -> Cosmos stats
              +-- match_state snapshot (every 5 s, latest only) -> Cosmos match_state
              +-- triggers -> evidence pack -> moment document -> Cosmos moments -> change feed -> agents
```

- **Input arrives through:** Event Hubs `match-events` (setup first, then events in `seq` order; partition key
  `match_id`) and `match-tracking`. Consumer group `stats`, with checkpoints in Blob Storage (Azurite locally), as
  in the archiver.
- **Processing performed here:**
  - Drop messages the engine wrote itself (`kind=stats`), and `seq` values already applied.
  - Hold back events that arrive after a gap until the gap is filled (§10.1: never bridge a gap).
  - Update state, compute per-event metrics, update windows, and evaluate triggers on each event.
  - Build the panel on a 1-second match-time tick.
- **Output goes to:** `match-events` (`kind=stats` panels), Cosmos `match_state` and `moments`.
- **Execution relationship:** one process, many matches. Each match is independent state keyed by `match_id`.
  Panels follow match time (`match_ms`), not wall time, so 20× playback and replays behave the same.
- **State retained:**
  - In memory: per-match state.
  - Saved: the hub reading position, plus the moment documents themselves.
  - **Restart rule (proposed):** the checkpoint for a match stays at its setup until full time. A restarted engine
    replays the match from its first event. Every number and moment ordinal comes out the same, so publishing is
    idempotent: a moment is created only if absent and a differing repeat is a conflict, and panels are keyed by
    `match_ms`.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Language and runtime | Python 3.12, `uv`, `azure-eventhub` with blob checkpoints, `azure-cosmos` | Same stack as the generator and archiver; one way to run locally | Azure Functions trigger: simpler scaling, but harder to hold per-match in-memory state | Proposed · Arnav |
| Restart and idempotency | Replay a match from its first event after a restart; deterministic ordinals | Satisfies §10.1's "never a fresh ID for a repeated event" without a separate state store | Persist state snapshots: faster recovery, more moving parts | Proposed · Arnav, Pranav |
| xG model | The engine's own logistic model of distance, angle, body part and situation (§8), coefficients in the spec | The engine must not grade the generator's homework with the generator's model. The check: goals ÷ xG within 0.9–1.1 on generated seasons, which use a richer model | Import the generator's model: perfect agreement, but not independent | Proposed (D-05) · Azeem |
| Panel rate and contents | Light panel every match second; heavy parts (pass network, pressing grid, zones) every 60 s and at half and full time | Keeps browser traffic small; heavy charts don't need 1 Hz | Everything at 1 Hz: simpler, but about 10× the bytes | Proposed (D-01) · Vedant, Arnav |
| Clock for windows | `match_ms`. Windows don't cross half-time (they restart at each period); comparisons use consecutive windows within a period | Matches §10.1's same-period rule; no artefacts at the break | Sliding across periods: smoother, but mixes halves | Proposed · Pranav |
| Offline runner | `stats/main.py replay <run folder>` feeds recorded matches through the same pipeline, with no hubs | Fast tests, calibration against generator answer keys, demo prep | Test only through the emulator: slow and flaky | Proposed · Azeem |

**Assumptions:**
1. The relay and archiver accept `kind=stats` panels unchanged, as their specs say. This is checked in S2 with the
   local stack.
2. The Cosmos emulator supports the transactional patterns §10.2 needs; otherwise create-if-absent per document is
   enough. This is checked in S3.
3. The generator's recordings carry every field §8 needs. They do: §3 includes `under_pressure`, `assisted_by`,
   `key_pass_event_id`, `body_part` and `situation`.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Events and frames in | Generator → stats | `CONTRACTS.md` §3, §4 | No | — |
| Stat panel (`kind=stats`) | Stats → relay → browsers; archiver | §7.2 (shape "defined by the stats engine", §9) | **Yes:** define the payload in §7.2 | Vedant, Arnav · pending |
| Evidence pack | Stats → agents | §5 | **Yes:** fact keys per trigger; promote §10.1 into §5 | Pranav, Arnav · pending |
| Moment document | Stats → Cosmos `moments` → change feed → agents, MCP | §10.2 (proposed) | **Yes:** promote §10.2; extend `trigger` beyond `shot_cluster` | Pranav, Arnav · pending |
| `match_state` document | Stats → MCP tools, web snapshot | Not defined | **Yes:** new short section (D-02) | Arnav, Pranav, Vedant · pending |
| Metric definitions | Stats → everyone | §8 | **Yes:** thresholds (§9 open questions) and any formula refinements | Arnav · pending |

- **Stat panel (proposed):** `{ match_id, match_ms, clock, period, score, teams: { home: {...}, away: {...} } }`. Each
  team has possession %, shots, shots on target, xG (2 dp), passes, completion %, PPDA for the last 10 min,
  momentum share for the last 10 min, and press height in metres. Each panel also carries the latest 5-min
  momentum bucket. Every 60 s and at half and full time it adds a `heavy` block: pass network (links with ≥ 3
  passes), pressing grid (9 × 6) and zone counts.
- **Time meaning:** everything is in `match_ms`. Panels are keyed by `match_ms` (relay and archiver already do this).
- **Duplicates:** input dedupe is by `seq`. Output panels are idempotent by `match_ms`; moments by
  `(match_id, trigger, period, team_id, triggering event_id)` → `moment_id` (§10.1).
- **Invalid or unknown input:** a malformed event is logged with its `seq` and the match is held at that point
  (no guessing). An unknown event type is ignored with a count.

**Shared contract edits required:** `CONTRACTS.md` §5, §7.2, §8, §9 and §10 (promoted into §5 and a new moment
section), plus a new `match_state` section. They go in a dedicated commit in the M1 spec PR, with the owners above
told beforehand.
**Source of truth:** `CONTRACTS.md` for shapes; `stats/specs/*.md` for formulas and rules.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `stats/specs/metrics.md`, `windows.md`, `triggers.md`, `evidence-packs.md`, `publishing.md` | Modify (M1) | Answer every question; mark agreed | Themselves | Azeem / Arnav, Pranav, Vedant |
| `CONTRACTS.md` §5, §7.2, §8, §9, §10, new `match_state` section | Modify (M1, dedicated commit) | Shapes and definitions above | Hot file | Arnav, Pranav, Vedant |
| `stats/README.md` | Modify | How to run (live and replay) | `publishing.md` | Azeem |
| `stats/pyproject.toml` | Add (S1) | Package and dependencies | — | Azeem |
| `stats/consumer.py`, `dedupe.py`, `state.py`, `main.py` | Modify (S1) | Hubs in, order, state, entry points (`live`, `replay`) | `publishing.md` | Azeem |
| `stats/xg.py`, `pass_difficulty.py`, `per_event.py` | Modify (S1) | Per-event metrics, speeds and distance from frames | `metrics.md` §1–§3 | Azeem |
| `stats/rolling.py`, `whole_match.py` | Modify (S2) | Windows, totals, pass network, pressing grid | `windows.md`, `metrics.md` §4–§7 | Azeem |
| `stats/publish.py` | Modify (S2, S3) | Panels to the hub; `match_state` and `moments` to Cosmos | `publishing.md` | Azeem |
| `stats/triggers.py`, `evidence.py` | Modify (S3) | Triggers, merging, priority; evidence packs | `triggers.md`, `evidence-packs.md` | Azeem |
| `stats/tests/` | Modify / add | Metrics, windows, triggers, dedupe, idempotency, replay against generator answer keys | All above | Azeem |
| `stats/tests/fixtures/SYN-1017/` | Add (S1) | One generated match (KES v ORR, seed 1017; events and setup, gzipped) for replay tests, the same match as Pranav's shot-cluster example | — | Azeem |
| `docs/knowledge/stats-engine.md` | Modify (each PR) | Status, interfaces, evidence (knowledge-sharing rule) | `docs/specs/knowledge-sharing.md` | Azeem / Pranav |
| `plans/active/PLAN_stats_engine.md` (+ sprint plans `_S1`…`_S3`) | Add | This plan | — | Azeem |

Not changed: `functions/`, `archiver/`, `mcp_server/`, `agents/`, `web/` and `infra/`. If S2 or S3 shows a
receiver needs a change, its owner makes it.

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Duplicate event (`seq` already applied) | Dropped silently, counted | — | None | Test |
| Gap in `seq` | Hold later events; process none past the gap | Wait for redelivery; after 30 s log an alert and keep holding (§10.1: never bridge) | Panels pause for that match; other matches continue | Test with a removed event |
| Same `seq`, different body | Error for that match; stop processing it | Operator action; logged with both bodies' hashes | Panels and moments stop for that match | Test |
| Engine restart mid-match | Replay from the match's first event; republish idempotently | Automatic | Panels resume, and duplicates are absorbed by `match_ms` keys downstream | Kill and restart during a 20× local match |
| Cosmos unavailable | Retry with backoff; panels still flow; don't advance the checkpoint | After a 2-minute outage, log and continue retrying | Moments are delayed, never lost while the hub retains data | Emulator stopped mid-match |
| Hub send fails | Retry the panel up to 3 times, then skip that second's panel | The next second's panel supersedes it | One missing panel | Test with a failing sender |
| `kind=stats` read back from the hub | Ignored by the stats consumer | — | None | Test |
| Late tracking frames | Speeds use the frames available; sprint triggers wait up to 1 s of match time | — | A sprint fact may be omitted (missing facts are invalid, never zero) | Test |

## 10. Requirements specific to this work

- **Performance and load:**
  - Target, unmeasured: one match at 20× (about 25 events per second and 100 frames per second) with panel latency
    under 1 s from the triggering event.
  - Measured from event enqueue time to panel send time, over a local 20× full match in S2.
  - Several matches in parallel.
- **Observability:** one log line per match start and end; counters for events, duplicates, gaps, panels and moments
  per match; every moment logged with its `moment_id` and triggering `seq`.
- **Azure resources and access:** Event Hubs consumer group `stats` on both hubs; Blob Storage for checkpoints; Cosmos
  `match_state` and `moments`; a Container Apps app with managed identity. The roles are Event Hubs Data Receiver
  and Sender, Storage Blob Data Contributor, and Cosmos data contributor. Created by AZ1 (Arnav, Pranav); settings
  by variable name only.
- **Cost:** one small container; the Cosmos free-tier shared throughput (about 1 panel write per 5 s per match for
  `match_state`, plus about 30–60 moments a match). No model calls.
- **Security and data:** synthetic data only; inputs validated against §3 and §4; no secrets in code (managed
  identity on Azure, emulator keys locally as the archiver does).
- **AI behavior:** not applicable. The engine calls no model. It is what makes model output checkable.
- **Frontend experience:** not applicable here; the panel shape is agreed with Vedant (D-01).
- **Synthetic data or calculations:**
  - Deterministic: the same events always give the same numbers and moments.
  - Formulas are published in `metrics.md` and calibrated only against the generator's public-source ranges
    (`CALIBRATION.md`).
  - Generator answer keys are used in tests, never at runtime.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | The five stats specs answer every question and merge as agreed, with the `CONTRACTS.md` edits agreed by their owners | Spec PR review | — | PR link |
| AC-02 | Replaying the same recorded match twice gives byte-identical panels and moments | Test | Generator recording | Test output |
| AC-03 | Over two generated league seasons (180 matches), the engine's goals ÷ xG is 0.9–1.1. Its possession and PPDA for Calverholme v Dunmarrow agree with the generator's answer key within ±0.03 possession and ±15 % PPDA | Replay runner | Generator seasons S1, S2 and the 100-match repeat | Table |
| AC-04 | Duplicates are dropped, a gap holds processing, and a conflicting body stops the match | Tests | Edited recordings | Test output |
| AC-05 | In a full 20× match through the local stack (emulator, relay, Web PubSub stand-in, archiver), every panel reaches a browser socket in `seq` order and every panel is saved in Cosmos `stats` | `functions/tests/e2e_local.py`-style run | Local stack | Run log |
| AC-06 | Restarting the engine mid-match produces no duplicate moments and no gap in panels after the restart | Kill-and-restart run | Local stack | Run log |
| AC-07 | `shot_cluster` reproduces Pranav's expected moments for KES–ORR, seed 1017, exactly (IDs, window, facts) | Test | Pranav's fixture (`agents/specs/examples/`) | Test output |
| AC-08 | Pranav's MCP reader accepts the engine's first real moment from the Cosmos emulator (STATS-01 / MCP-01) | Pranav's validator | MCP reader | Pranav's review link |
| AC-09 | Over 20 matches with `late_pressure_surge`, a `momentum_swing` or `press_change` moment for the surging side fires within 15 minutes of onset in at least 70 % of matches, and in clearly more matches than on the same seeds without the storyline. The prototype in M1 gave 15 of 20 against 9 of 20 (`triggers.md` §1) | Replay runner with storyline matches | Generator storylines | Table |
| AC-10 | A league season averages 15–35 moments a match (`triggers.md` §2). The M1 prototype gave 19.9 (10–34) on season S1 | Replay over a league season | Season S1 | Histogram |

**Validation limits:** Azure scale and identity aren't tested until AC-05 is repeated on Azure (AZ2). Chart rendering
of panels is Vedant's. Agent quality is Pranav's.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Specs agreed | Five specs answered; `CONTRACTS.md` §5, §7.2, §8, §9, §10 and `match_state` edits agreed | Azeem | Reviews by Arnav, Pranav, Vedant | AC-01 | 19–20 Oct |
| S1 — Numbers from a match (ST1 + ST2) | `stats` package: consumer, dedupe, state, xG, pass difficulty, speeds; replay runner prints a match's numbers | Azeem | M1 merged | AC-02, AC-03 (xG part), AC-04 | 20–21 Oct |
| S2 — Live numbers on screen (ST3 + ST4) | Windows, whole-match stats; panels once a second through the relay to a browser socket and the archive; `match_state` | Azeem | S1 | AC-03, AC-05, AC-06 | 21–22 Oct |
| S3 — Moments with evidence (ST5) | Triggers, evidence packs, moment documents in Cosmos; Pranav's reader accepts them | Azeem | S2; Pranav's validator | AC-07, AC-08, AC-09, AC-10 | 22–24 Oct |
| S4 — On Azure | The same as S2 and S3 against Azure resources | Azeem with Arnav, Pranav | AZ1 / AZ2 infrastructure | AC-05 repeated on Azure | When AZ1 is ready, by 24 Oct if possible |

Each sprint gets its own sprint plan (`PLAN_stats_engine_S<n>.md`) and branch (`stats/<short-description>`).

- **Project calendar check:**
  - **20 Oct (one match end to end in English):** M1 and S1 can land; the end-to-end match today runs without stats.
  - **24 Oct (every required feature):** S2 and S3 are tight but fit. Feature freeze is 25–26 Oct.
  - **Flag:** S4 depends on Azure infrastructure that is not built yet.
- **First integration checkpoint:** S2, panels through the real local relay and archiver (real, not mocked).
- **Parallel work:**
  - S1 needs only recordings.
  - Pranav can keep building on his fixtures.
  - Vedant can build charts from the agreed panel shape and recorded panels from the replay runner.
- **Dependency-bound work:** S3's AC-08 (Pranav's validator) and S4 (Azure).
- **Scope reduction if time runs short:**
  1. Drop control ↔ chaos and rhythm.
  2. Drop the pressing grid and pass network (heavy block).
  3. Drop the `sprint` and `milestone` triggers.
  4. Drop `press_change`.

  The minimum stays: panels with the core numbers plus the `goal`, `big_chance` and `shot_cluster` moments.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** M1 on `stats/specs` (specs, plan, `CONTRACTS.md` in its own commit,
  knowledge note). S1 `stats/numbers`, S2 `stats/live-panels`, S3 `stats/moments`, each from a fresh `main`.
- **Shared-file coordination:** `CONTRACTS.md` is a hot file. Tell Arnav, Pranav and Vedant before the M1 PR, and
  keep the change in one dedicated commit. No other open PR touches it today.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `CONTRACTS.md` §10 (shot cluster, moment document) | `PLAN_agents_ai-insights-mcp.md` and `_S1`, `_S2` | Pranav | Shared edit: M1 promotes §10.1–§10.2 into agreed sections with Pranav's review; his plan's D1/D3 resolve through this PR | Pending (needs Pranav) |
| `CONTRACTS.md` §7.2 `stats` payload | `PLAN_functions_screen-relay.md` (forwards panels unchanged), `PLAN_web_live-match-viewer.md` (charts) | Arnav, Vedant | Shared edit in M1; the relay needs no change if panels stay inside the envelope `data` | Pending (needs Vedant, Arnav) |
| `stats/specs/*.md` spec gate | `PLAN_ci_pr-checks.md` | Arnav | Specs marked agreed in M1 before any code PR | Agreed (the gate's normal use) |
| `docs/knowledge/stats-engine.md` | `PLAN_docs_graphify-knowledge-map.md`, `PLAN_docs_knowledge-sharing.md` | Pranav | Update the note in each stats PR, as the knowledge-sharing spec asks | Agreed (that spec's rule) |
| Cosmos `match_state` vs relay `screen` | Work map 17 Oct; `PLAN_functions_screen-relay.md` | Arnav | Decision D-02 in M1 | Pending |
| `CONTRACTS.md` §4.1 (archived match) | `PLAN_archiver_archive-flow.md` | Arnav | Not edited. The new §4.2 sits after it, and the archiver keeps panels as its spec already says | Agreed (no shared edit) |
| `CONTRACTS.md` §1.4 (transport) | `PLAN_contracts_setup-transport.md` | Arnav | Not edited. The stats engine follows §1.4 as merged | Agreed (no shared edit) |
| `plans/active/` | `PLAN_plans_housekeeping.md` | Arnav | Its edits merged in PR #26. This PR adds a new plan file only | Agreed (no shared edit) |

Scanned at `5ef36be` on 2026-10-19. Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ (none touch `stats/`
or `CONTRACTS.md`) · hot files ✓ (`CONTRACTS.md`: Arnav, Pranav, Vedant to be told).

- **Integration procedure:** `cd stats && uv run python main.py replay <run folder>` (offline); `uv run python main.py
  live` beside the local stack (emulator, Azurite, Cosmos emulator, relay, Web PubSub stand-in), then
  `generator/cli.py live`.
- **Configuration or setup changes:** the same variable names as the archiver (`OVERLAP_COSMOS_ENDPOINT`,
  `OVERLAP_COSMOS_KEY` for the local emulator only, `OVERLAP_COSMOS_DATABASE`), plus the Event Hubs namespace and
  blob checkpoint settings. Values are never written down.
- **Deployment or data changes, if applicable:** new Cosmos documents in `match_state` and `moments` (both
  containers are planned on the DFD). Reversed by deleting a match's documents (partition `/match_id`).
- **Documentation updates:** the five specs, `CONTRACTS.md`, `stats/README.md`, `docs/knowledge/stats-engine.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| D-01 | Stat panel shape and rate (light panel every second, heavy block every 60 s and at half and full time) | Charts built against the wrong shape | Vedant, Arnav | Agree in M1; recorded panels from the replay runner as fixtures | S2 |
| D-02 | `match_state` vs relay `screen`. Proposed: `match_state` = the engine's latest numbers (one document per match, overwritten every 5 s, for MCP tools and the web snapshot of stats); `screen` stays the relay's envelope log | Two snapshots that disagree, or MCP without current stats | Arnav, Pranav, Vedant | Agree in M1; else drop `match_state` and let MCP read the latest `stats` panel | S2 |
| D-03 | Trigger set and §10.1 rules. Proposed: keep §10.1 exactly for `shot_cluster`; add `goal`, `red_card`, `penalty`, `big_chance` (xG > 0.2), `momentum_swing`, `press_change`, `sprint`, `milestone` with thresholds in `triggers.md`; same moment document for all | Pranav's first slice changes underneath him | Pranav, Arnav | Agree in M1; other triggers can follow `shot_cluster` | S3 |
| D-04 | Momentum-swing and press-change thresholds (§9) | Too many or too few moments | Arnav (contract), Pranav (consumer) | Start values in `triggers.md`, tuned in S3 against storyline answer keys (AC-09) | S3 |
| D-05 | The engine's own xG model vs reusing the generator's | Self-confirming numbers if reused | Azeem | Own model; AC-03 checks agreement | S1 |
| D-06 | Restart by replay from the match start | Slow recovery late in a long match (about 1,400 events: under 1 s) | Arnav | Accept; revisit only if a match lasts hours | S2 |
| D-07 | Registry still says stats is unassigned | Reviews routed to the wrong person | Arnav | **Done:** Arnav recorded Azeem as owner in PR #52 | M1 |
| D-08 | The storyline answer key's `detect_within_min` for `late_pressure_surge` is 10. The stats engine catches the surge within 15 minutes in 15 of 20 matches, but within 10 in only 7. Proposed: the agents' recall evaluation uses 15 for this storyline (a generator file change by Azeem, agreed with Pranav, who owns the evaluation) | Recall scored against a window the numbers can't meet | Pranav, Azeem | Agree in M1 review; change `generator/storylines/late_pressure_surge.yaml` in its own PR | None |
| R-01 | Calendar: M1 to S3 in five days | S3 slips past 24 Oct | Azeem | Cut list in §12; the minimum stays | S3 |
| R-02 | Azure infrastructure (AZ1) not ready | Stats only runs locally for the demo | Arnav, Pranav | Local stack demo; S4 when ready | S4 |

**Decisions requested from Arnav or affected owners:**
1. **D-01 panel shape and rate** (Vedant, Arnav). Recommended: light panel every second, heavy block every 60 s.
2. **D-02 `match_state`** (Arnav, Pranav). Recommended: keep it as the engine's latest numbers, separate from
   `screen`.
3. **D-03 promote §10.1–§10.2 and add the other triggers** (Pranav). Recommended: `shot_cluster` as Pranav wrote it.
4. **D-07 registry** (Arnav).

## 15. Review, agreement, and handover

### Author’s submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked.
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Arnav | v0.1 | — | Pending | — |
| Pranav | v0.1 | — | Pending | — |
| Vedant | v0.1 (as merged in #50) | D-01 and D-02 approved, with two changes for S2. **1. Per-shot xG.** The shot map (one of the seven charts, and the hero moment's chart in §9) needs each shot's xG, but no panel carries it, and the web app never computes numbers. Proposed: `heavy.shots`, every shot so far as `{event_id, xg}` (about 25 a match); the browser joins position and outcome from the event by `event_id`. **2. `stats` in the snapshot.** §7.3 includes every `stats` envelope sent so far, about 5,700 a match (about 6 MB, plus a Cosmos write each in the relay's `screen` log). A late joiner needs only the latest panel and the latest one with `heavy`, because the heavy fields are cumulative. Proposed: the relay keeps those two, the way it keeps `positions-latest` (a §7.3 and `functions/relay_store.py` change, Arnav). The browser then gets its stats from the snapshot, so `match_state` (§4.2) serves MCP only and "a late-joining browser" comes out of its readers | Approved with changes | 20 Oct |

**Implementation readiness:** blocked by M1 (spec agreement) for all code.
**Relevant specification agreement:** pending (the M1 spec PR).
**Next action and owner:** Azeem writes the five specs and the `CONTRACTS.md` edits on `stats/specs`, after go.

### Handover after implementation

**M1 (spec PR, branch `stats/specs`):**
- **What's in it:** the five specs answered; `CONTRACTS.md` §4.2, §5, §7.2, §7.4, §8, §9 and §10 edited in one
  commit; the knowledge note updated.
- **Models and thresholds were checked on generated data before being written down,** with scratch prototypes
  outside the repository:
  - **xG:** 452 goals against 452.0 xG over 180 league matches, and every `CALIBRATION.md` anchor met.
  - **Pass difficulty:** calibrated by fifths on 55,503 passes.
  - **Triggers:** 19.9 moments a match on season S1.
  - **Storyline detection:** as in AC-09.
- **Differences from v0.1 of this plan:**
  - `press_change` compares pressures per opponent pass, not press height or PPDA (`triggers.md` §1 says why).
  - The moment target is 15–35, not 30–60.
  - Cards are credited to the side that drew the foul, and substitutions carry no momentum.
  - `context.players` is added to §10.2.

Later sprints: pending implementation.
