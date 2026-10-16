# PLAN_generator_live-mode — G5 live mode, and the live-and-batch spec

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Generator · live mode streams real generator matches into Event Hubs, replacing `mock/` |
| Author / primary owner | Azeem |
| Collaborators and responsibilities | None |
| Review coordinator | Arnav |
| Affected component owners | Arnav and Pranav (Event Hubs, infra); consumers of the hubs: stats engine, screen relay, archiver (unassigned, Arnav decides); Vedant (web, via the relay) |
| Proposal version and date | v0.1 · 2026-10-16 |
| Status | In progress (M1: go from Azeem, 16 Oct) |
| Plan tier and file | Full · `plans/active/PLAN_generator_live-mode.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 75b7cba |
| Architecture box / work area | Layer 1 · G5 live mode (`live.py`, `cli.py`); the spec also covers G6 (batch), planned separately |
| Relevant issue, spec PR, or discussion | Engine specs: PR #15; registry deliverable G5 |

## 1. Purpose and intended outcome

- **Problem or need:** the 20 Oct target is one full match end to end. Today `mock/` feeds Event Hubs; the registry's
  done-when for the generator is that `live.py` replaces it.
- **Proposed outcome:** `cli.py live --home SKH --away AMH --speed 5 --hubs emulator` plays a real generator match and
  streams its setup, events and tracking into `match-events` and `match-tracking` exactly as consumers expect.
- **Benefit to viewers or teammates:** the stats engine, screen relay, archiver and web app get real, sensible data
  with no change on their side.
- **Success statement:** a consumer built against the mock reads a live generator match from the emulator with no
  code change, in order, with no gaps in `seq`.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code or placeholder files | main · 75b7cba · `generator/live.py`, `cli.py`, `batch.py`, `realism_report.py` | Placeholders |
| Governing component specifications | `generator/specs/live-and-batch.md` | Not started (this plan writes it) |
| Shared contracts | `CONTRACTS.md` §1–§4 | Message shapes and ordering |
| Mock | `mock/overlap_mock/sinks/eventhubs.py`, `sinks/files.py`, `mock/emulator/` | Hub names, partition key, `kind` and `match_id` properties, setup on `match-events`, recorded-file layout; emulator compose file |

**Differences between references:** `CONTRACTS.md` doesn't say where the setup travels; the mock sends it on
`match-events` with `kind=setup` (decision L1).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| `live-and-batch.md`, all five sections (M1) | Batch seasons and the realism report code (G6, own plan) |
| `live.py`: pacing, Event Hubs sending, retries, several matches at once | Packaging as a Container Apps job (Dockerfile, infra: decision L3) |
| `recording.py`: recorded-match files | Loading season history into Cosmos DB |
| `cli.py`: `world`, `play`, `live`, `validate` | `season`, `report` commands (G6) |
| Tests with a fake hub; a real run against the emulator | Deleting `mock/` (Arnav, once consumers have switched) |

- **Minimum complete result:** spec agreed; one generator match streamed to the emulator in order, readable by a
  mock-era consumer.
- **Optional extension:** streaming to Azure Event Hubs.
- **Boundary with neighbouring components:** ends at the hubs. Everything after the hubs is other layers'.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Engine output (`MatchResult`) | Azeem (G2 M2) | A full valid match | Pending · M2 | Tests use a small hand-built match |
| Event Hubs emulator | Arnav (`mock/emulator/`) | Use the compose file unchanged | Available · M3 | — |
| Azure Event Hubs namespace and data-sender role | Arnav, Pranav | Namespace name and access for the runner | Pending · optional | Emulator |
| Where the setup travels (L1) | Arnav; hub consumers | Written into `CONTRACTS.md` | Pending · M3 | Mock's choice kept |
| Container Apps job packaging (L3) | Arnav, Pranav (infra) | Who writes the Dockerfile and job | Unresolved · after 20 Oct | Run locally |

**My owned deliverables:** the spec, `live.py`, `recording.py`, `cli.py` (live parts), their tests.  
**Shared deliverables:** none.

## 5. Proposed flow

```text
cli.py live ──▶ world.build_setup ──▶ engine.play (whole match in memory)
                                            │
                                            ▼
                         live.py pacing: release at match_ms ÷ speed
                                            │
                     ┌──────────────────────┴───────────────────────┐
                     ▼                                              ▼
       match-events (setup, events)                  match-tracking (5 Hz frames)
                     │  (optional) recording.py → data/generated/matches/<id>/
```

- **Input arrives through:** the command line. **Processing here:** pacing and sending only; the match is already
  played. **Output goes to:** the two hubs, stdout or files. **Execution relationship:** one timer per match.
  **State retained:** the last `seq` sent per match, for retries.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| L1 · Setup transport | Setup first on `match-events`, `kind=setup` | Consumers already built on the mock expect it | A separate `match-setups` hub: cleaner, but a change for every consumer | Proposed · Arnav to add to `CONTRACTS.md` |
| L2 · Play then stream | Play the whole match in memory, then release messages on a timer | A send failure can never change the match; replays are exact | Simulate in real time: no benefit, harder to test | Proposed |
| L3 · Packaging | Out of scope until after 20 Oct | Not in the registry's G5 files; infra owners decide | Write a Dockerfile here: touches infra ownership | **Unresolved** · Arnav, Pranav |
| L4 · Async client | `azure-eventhub`'s async producer with one batch per hub per 200 ms | Matches the 5 Hz rhythm, few sends | One send per message: thousands of sends a minute | Proposed |
| L5 · Recorded format | The mock's layout minus the relay's envelopes, plus `summary.json` | Nothing changes for replay readers | New format: no gain | Proposed |

**Assumptions:** the emulator accepts the same messages as Azure (the mock's emulator setup shows it does).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Setup, events, tracking on the hubs | Generator → stats, relay, archiver | `CONTRACTS.md` §2–§4; `live-and-batch.md` §1 | Write L1 into `CONTRACTS.md` | Arnav · pending |
| Recorded match files | Generator → replay readers (web, scripts) | `live-and-batch.md` §2 | No (mock's layout kept) | — |

- Order: setup before any event of its match; events in `seq` order; tracking in time order.
- Duplicates after a retry are allowed; consumers drop repeated `seq`.

**Shared contract edits required:** L1, in a small contract PR or added to the conditions contract PR.  
**Source of truth:** `CONTRACTS.md`; `live-and-batch.md` for transport details.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `generator/specs/live-and-batch.md` | Modify (M1) | Live, recorded, batch, report, CLI | Itself | Azeem / Arnav |
| `generator/live.py` | Modify (M2) | Pacing, sending, retries | `live-and-batch.md` §1 | Azeem |
| `generator/recording.py` | Add (M2) | Recorded-match files | `live-and-batch.md` §2 | Azeem |
| `generator/cli.py` | Modify (M2) | `world`, `play`, `live`, `validate` | `live-and-batch.md` §5 | Azeem |
| `generator/pyproject.toml` | Modify (M2) | Add `azure-eventhub`, `azure-identity` | — | Azeem |
| `generator/tests/test_live.py` | Add (M2) | Pacing, ordering, retries with a fake hub; recorded files | `live-and-batch.md` | Azeem |
| `plans/active/PLAN_generator_live-mode.md` | Add | This plan | — | Azeem |
| `mock/emulator/docker-compose.yml`, `Config.json` | Use unchanged | Local Event Hubs | — | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| A batch fails to send | SDK retries; then live mode retries up to 60 s | Stops the match with the last `seq` sent | Consumers see the match stop; no wrong data | Fake hub that fails |
| Duplicate messages after a retry | Sent again | Consumers drop repeated `seq` | None | Test |
| Emulator not running | Fails at start with a clear message | Start the emulator | None | Manual |
| Missing namespace configuration | Fails at start, naming the variable | Set it | None | Test |
| Ctrl-C mid-match | Stops cleanly after the current batch | Re-run (same seed, same match) | Consumers see a partial match | Manual |

## 10. Requirements specific to this work

- **Performance and load:** about five sends a second per hub per match; 20× means about 100 a second. Unmeasured.
- **Observability:** one line per match: started, every 5 minutes of match time, finished or stopped, with the last
  `seq`.
- **Azure resources and access:** Event Hubs namespace; the runner's identity needs *Azure Event Hubs Data Sender*.
  Namespace by variable name only.
- **Cost:** emulator for development; Azure only for demos.
- **Security and data:** no keys in code; `DefaultAzureCredential`; the emulator's fixed local connection string only
  works on localhost.
- **AI behavior, Frontend experience:** not applicable.
- **Synthetic data or calculations:** streams exactly what the engine produced; no changes in transit.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | `live-and-batch.md` answers every question and merges as agreed | Review | — | PR link |
| AC-02 | With a fake hub at 20×, messages leave in `seq` order at `match_ms ÷ speed` (within 100 ms), setup first | `test_live.py` | Small hand-built match | Test output |
| AC-03 | A failing fake hub is retried, then the match stops with the last `seq` | `test_live.py` | — | Test output |
| AC-04 | A full Skyhaven vs Amberholt match streams to the emulator, and reading it back gives the same setup, events and frames, in order | Run plus readback | Engine M2; emulator | Command output |
| AC-05 | Recorded files match the mock's layout and load in the existing replay path | Test plus a manual load | — | Test output |

**Validation limits:** Azure Event Hubs itself is only checked if a namespace is available before 20 Oct.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Spec | `live-and-batch.md` agreed | Azeem | — | AC-01 | 16–17 Oct |
| M2 — Live mode code | Pacing, sending, recording, CLI, tests with a fake hub | Azeem | M1; engine `MatchResult` shape | AC-02, AC-03, AC-05 | 18–19 Oct |
| M3 — End to end | A real match into the emulator, read back | Azeem | Engine M2 merged | AC-04 | 19–20 Oct |

- **Project calendar check:** M3 is the 20 Oct "one full match end to end" for the generator's part. Every required
  feature by 24 Oct; freeze 25–26 Oct; submission 27 Oct.
- **First integration checkpoint:** M3, real hubs (emulator).
- **Parallel work:** M2 against a hand-built match while the engine is built.
- **Dependency-bound work:** M3 waits for engine M2.
- **Scope reduction if time runs short:** drop multi-match streaming and `--stdout`; keep one match to the emulator.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `generator/live-batch-spec` (M1); `generator/live-mode` (M2–M3).
- **Shared-file coordination:** none in this plan's files; L1 goes into `CONTRACTS.md` through its own PR.
- **Conflict scan result:** No overlaps found on 2026-10-16 at 75b7cba.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `generator/pyproject.toml` | Will also change in engine M2 if the engine needs packages | Azeem | Engine first; live mode merges `main` in after | Planned |

  Sources checked: plans ✓ · PRs ✓ (#14, #15 don't touch these files) · branches ✓ · hot files ✓ (none).
- **Integration procedure:** start the emulator (`mock/emulator`), run `cli.py live`, read back with the mock's
  `tail` command or a consumer.
- **Configuration or setup changes:** Event Hubs namespace variable for Azure runs only.
- **Deployment or data changes, if applicable:** not applicable until L3.
- **Documentation updates:** `live-and-batch.md`; `generator/README.md` usage section in M2.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Engine M2 late | No real match to stream on 20 Oct | Azeem | Stream a recorded test match; the mock remains the fallback | M3 |
| R-02 | L1 not agreed | Consumers change how they read setups | Arnav | Keep the mock's choice until agreed | M3 |
| R-03 | No Azure namespace before the demo | Demo runs on the emulator only | Arnav, Pranav | Emulator | Optional extension |

**Decisions requested from Arnav or affected owners:**

1. **L1:** write "the setup is sent first on `match-events` with `kind=setup`" into `CONTRACTS.md`. Recommendation:
   yes, it's what the mock does and consumers expect.
2. **L3:** who packages the generator as a Container Apps job, and when? Recommendation: after 20 Oct, by the infra
   owners, with the generator providing the run command.

## 15. Review, agreement, and handover

### Author's submission checklist

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

**Implementation readiness:** M1 written; M2 can start against a hand-built match once the spec merges.  
**Relevant specification agreement:** pending (`live-and-batch.md`).  
**Next action and owner:** Arnav reviews the spec PR and answers L1, L3 · Azeem.

### Handover after implementation

Pending implementation.
