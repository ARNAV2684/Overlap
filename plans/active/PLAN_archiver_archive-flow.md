# PLAN_archiver_archive-flow — archive flow: Event Hubs → archiver → Cosmos + Blob → read back

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Archive flow · keep every match permanently (setup, events, tracking, stat panels) so replays and the judges' link never depend on Event Hubs; local first, Azure by settings |
| Author / primary owner | Arnav (owns the archiver per `plans/REGISTRY.md`) |
| Collaborators and responsibilities | Pranav helps Arnav (registry: "Arnav (Pranav helping)") |
| Review coordinator | Arnav |
| Affected component owners | Azeem (producer: `generator/live.py`, recorded-match format); Vedant (consumer: replay page/route reads the stored match); stats engine (unassigned, Arnav decides): its panels are archived too |
| Proposal version and date | v1.2 · 17 Oct 2026 (A2 results recorded) |
| Status | A1 merged (#33); A2 done locally, in review; A3 next with the screen flow's Azure pass |
| Plan tier and file | Full · `plans/active/PLAN_archiver_archive-flow.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · d0cf75d (screen relay PR #32 open) |
| Architecture box / work area | Lucid page 2: box 2 (`match-events` → archiver) → box 4 (Cosmos `events`, `matches`); plus `match-tracking` → Blob (see §2) |
| Relevant issue, spec PR, or discussion | Arnav's decisions of 17 Oct (below); `CONTRACTS.md` §4 ("per-minute chunks in Blob") and §9 (chunk format open) |

**Decisions already made by Arnav (17 Oct):** store events **and** tracking; the setup and result go to Cosmos
`matches`; the archiver runs as an **Azure Function in the same app as the relay**; the flow ends when a full match is
**stored and read back exactly**; the replay page/route stays Vedant's, built on the agreed stored format; full scope,
local first.

## 1. Purpose and intended outcome

- **Problem or need:** Event Hubs forgets after its retention period. Replay mode, the full-time recap's data and the
  judges' link (live until 10 Nov) need every match kept permanently. Nothing stores anything yet.
- **Proposed outcome:** an archiver reads both hubs as consumer group `archiver`, independently of the relay, and
  writes the setup and result to Cosmos `matches`, every event to `events`, every stat panel to `stats`, and every tracking
  frame to compressed per-minute files in Blob. A reader rebuilds any stored match exactly.
- **Benefit:** replays work forever, independent of the live pipeline; the screen never waits for storage.
- **Success statement:** a full 20× generator match is archived locally and read back identical to the generator's
  recording (setup, every event, every frame, final score), and the same run passes on Azure by changing settings only.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Code | main · d0cf75d: `archiver/consumer.py`, `event_store.py`, `tracking_chunks.py`, `main.py` are comment-only placeholders | Nothing built |
| Governing spec | `archiver/specs/storage.md`: not started | Spec gate: A1 writes it |
| Producer | `generator/live.py` + `CONTRACTS.md` §1.4 | Input known and tested |
| Contract | §4: "the archiver stores tracking as compressed per-minute chunks in Blob Storage"; §9: chunk format open | A1 closes it |
| Diagram | Lucid page 2: `match-events` → archiver → `events`; boxes `matches`, Blob not connected | §2 differences below |
| Patterns to reuse | Screen relay (PR #32): checkpoint after save, duplicates dropped, same core locally and on Azure | Same approach |
| Local stack | `infra/local/`: consumer group `archiver` on both hubs; Cosmos emulator; Azurite (Blob) | Ready |

**Differences between references:**
- The diagram connects the archiver to `match-events` only. Tracking is added from `match-tracking` to Blob (Arnav,
  17 Oct), as `CONTRACTS.md` §4 already says.
- The diagram labels the archiver "Python worker · Container Apps"; it runs in the relay's Functions app instead
  (Arnav, 17 Oct).

## 3. Scope and boundaries

| In scope | Outside this plan |
|---|---|
| `archiver/specs/storage.md`: containers, keys, ids, chunk format, read order, retention | The replay page and route (Vedant, reading this format) |
| `CONTRACTS.md`: the stored-match format (new subsection) and closing the §9 chunk question | Stats engine and agents (their own flow) |
| Archiver core, Cosmos and Blob stores, local runner, Azure Function triggers | Moments/overlays storage (insight flow) |
| A reader that rebuilds a stored match (setup, events, frames, stat panels) in contract shapes | Season aggregates (`season` container) |
| Tests: unit, full-match round trip, redelivery and restart | |
| Azure: Cosmos `matches`/`events` containers, Blob container `tracking`, roles; done in the same Azure pass as the screen flow's S4 | |

- **Boundary:** the archiver starts at a message on either hub and ends when it is durably stored; the reader ends at
  contract-shaped objects. Live delivery never waits for the archiver.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Stored-match format in `CONTRACTS.md` (hot) | Vedant (replay reads it), Azeem (format close to his recordings) | Agreement | Pending · A1 | — |
| `functions/function_app.py` (relay app) | Arnav (same owner) | Two more triggers | After #32 merges · A2 | — |
| Local stack | Arnav | Containers created by code locally | Available | — |
| Azure resources | Arnav | Cosmos containers, Blob container, roles | A3 (with screen S4) | Local stack |

## 5. Proposed flow

```text
generator live ─▶ match-events  (setup, event, stats) ──┐
                  match-tracking (frames)              ──┤  consumer group: archiver
                                                         ▼
                              archiver core (same code locally and in the Function)
                              route by kind · drop duplicates · per-match state
                    │                         │                               │
          setup / result          events / stat panels                 frames by minute
                    ▼                         ▼                               ▼
          Cosmos `matches`        Cosmos `events` / `stats`            Blob `tracking`
          (id = match_id)         (id = event_id / stats-<ms>)         <match>/p<period>/m<minute>.ndjson.gz
                    └───────────── reader rebuilds the match in contract shapes ──────────┘
                                   (read-back check now; Vedant's replay route later)
```

- **Input:** Event Hubs trigger (Azure) or local runner (SDK), consumer group `archiver`; checkpoint only after the batch
  is durably stored.
- **Processing:** setup → `matches`; event → `events` (upsert by `event_id`, so redelivery is harmless); stat panel →
  `stats`; frames → per-minute Blob files; at `PeriodEnd` of period 2 the result (score,
  counts, minutes stored) is written to `matches`.
- **State retained:** per match, which minutes are complete; everything else is in the stores.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| What is stored | Setup, events, stat panels, tracking | Replays need positions and panels | Events only (no moving pitch) | **Agreed** · Arnav, 17 Oct |
| Setup and result | Cosmos `matches`, id and partition key `match_id` | Diagram's `matches` box; replay loads setup first | Special doc in `events` | **Agreed** · Arnav, 17 Oct |
| Events | Cosmos `events`, partition key `match_id`, id `event_id`, the §3 event unchanged | Upsert by id makes redelivery harmless; one query per match ordered by `seq` | Wrapped documents | **Agreed** · Arnav, 17 Oct |
| Cosmos billing | Free tier, database `live` with shared throughput (1,000 RU/s for all containers); serverless if throttled | $0; extra containers cost nothing | Serverless (~$0.25 per test match) | **Agreed** · Arnav, 17 Oct (recorded in `infra/specs/resources.md` in A3) |
| Stat panels | Cosmos `stats`, id `stats-<match_ms>` | Keeps `events` to contract events only; $0 extra under shared throughput | Inside `events` | **Agreed** · Arnav, 17 Oct |
| Tracking | Blob container `tracking`, `<match_id>/p<period>/m<minute 3 digits>.ndjson.gz`, one §4 frame per line | Contract §4; ~170 KB compressed per minute, ~95 files per match | One file per match (lost if the archiver crashes mid-match) | Proposed |
| Not losing frames on a crash | Each batch's frames are staged as a separate gzip block of the minute's blob; the blob is committed (blocks joined) when the minute is complete. Gzip allows joined members, so the file stays valid | The checkpoint only moves after staging, and staging survives a crash | Hold the open minute in memory (lost on crash) | Proposed · detailed in the spec |
| Duplicates in a minute after redelivery | Readers drop a frame whose `match_ms` they already have | Redelivered batches can overlap a staged block | Rewrite the minute (needs a download) | Proposed |
| Hosting | Function app shared with the relay: `archive_events`, `archive_tracking` triggers | Same deploy, identity and patterns | Container App (as drawn) | **Agreed** · Arnav, 17 Oct |
| Read-back | `archiver/reader.py` returns setup, events, frames, panels, result in contract shapes | Proves the archive and gives Vedant's replay route one format | Each consumer reads storage its own way | Proposed |
| Retention | Kept until 10 Nov + 7 days, then deleted with the resource group | Judges' link | Keep forever (cost) | **Agreed** · Arnav, 17 Oct |

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Hub messages | Generator → archiver | §1.4, §2–§4 | No | — |
| Stored match: `matches` doc, `events` docs, tracking files | Archiver → replay route, recap, judges' link | New `CONTRACTS.md` subsection (§4.1) | **Yes** (new) and closes §9 "tracking chunk format" | Vedant (reader) · pending |
| Replay delivery to browsers | Replay route → browser | §7 envelopes ("replay files use this one shape") | No | Vedant |

**Shared contract edits required:** `CONTRACTS.md` §4.1 (stored match) and §9 (tick the chunk-format question).

## 8. File and specification map

| File or small related group | Add / modify | Responsibility | Governing spec | Owner / shared reviewer |
|---|---|---|---|---|
| `archiver/specs/storage.md` | Modify | Full storage spec | This plan | Arnav · Pranav |
| `CONTRACTS.md` | Modify (hot) | §4.1 stored match; §9 tick | — | Arnav · Vedant, Azeem |
| `archiver/consumer.py` | Modify | Archiver core: check, group by match, route to the stores (no I/O) | `storage.md` | Arnav |
| `archiver/event_store.py` | Modify | Cosmos `matches`, `events`, `stats` (write and read back) | `storage.md` | Arnav |
| `archiver/tracking_chunks.py` | Modify | Blob per-minute files (staged blocks, committed after every batch) | `storage.md` | Arnav |
| `archiver/reader.py` | Add | Rebuild a stored match in contract shapes | `storage.md` | Arnav |
| `archiver/main.py` | Modify | Local runner (SDK, consumer group `archiver`, checkpoints in Azurite) | `storage.md` | Arnav |
| `archiver/pyproject.toml`, `archiver/.gitignore`, `archiver/tests/` | Add | Project, unit tests, round-trip check `tests/check_archive.py` | `storage.md` | Arnav |
| `archiver/README.md` | Modify | How to run and read back | — | Arnav |
| `functions/function_app.py`, `functions/requirements.txt` | Modify | `archive_events`, `archive_tracking` triggers using the archiver core | `storage.md` | Arnav |
| `infra/specs/local-development.md`, `infra/local/env.example` | Modify | Archiver in the run order and settings; Blob container | — | Arnav |
| `plans/active/PLAN_archiver_archive-flow.md` | Add | This plan | — | Arnav |
| A3 (with screen S4): `infra/modules/cosmos.bicep`, `storage.bicep`, `identity.bicep` | Modify | Containers `matches`, `events`, `stats`; Blob `tracking`; roles | `infra/specs/resources.md` | Arnav · Pranav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on viewers | How it will be checked |
|---|---|---|---|---|
| Redelivered events | Upsert by `event_id`: no change | — | None | Test |
| Redelivered frames | May repeat inside a minute file | Reader drops repeats by `match_ms` | None | Test |
| Archiver crash mid-minute | Staged blocks survive; batch redelivered from checkpoint | Minute committed when complete | None | Restart test |
| Archiver down for a while | Event Hubs keeps messages (retention) | Catches up from its checkpoint | None (live unaffected) | Stop/start test |
| Cosmos or Blob unavailable | Batch fails, not checkpointed, retried | Function retry policy / runner retry | None live | Test with emulator stopped |
| Invalid message | Logged and counted, skipped | — | Missing from replay | Test |
| Match never ends (stopped) | Open minute committed by the timer after 2 minutes idle; `matches` status stays `live` | — | Replay ends at last frame | Test |

## 10. Requirements specific to this work

- **Performance and load:** at 20× ~100 frames/s and ~8 events/s per match; Cosmos ~8 upserts/s; Blob one stage per batch.
  Must keep up without backlog (measured in A2).
- **Observability:** per match: events stored, panels stored, frames staged, minutes committed, duplicates, invalid, lag.
- **Azure resources and access:** Cosmos containers `matches`, `events`, `stats` (partition key `/match_id`, database `live`, shared throughput); Blob container
  `tracking`; the Function identity gets Cosmos data contributor on both and Storage Blob Data Contributor on `tracking`.
- **Cost:** one match ≈ 2.5k small Cosmos writes and ~95 blobs (~16 MB); negligible on serverless/free tiers. Confirmed in A3.
- **Security and data:** synthetic data only; no keys on Azure.
- **AI behavior / frontend:** Not applicable.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence |
|---|---|---|---|---|
| AC-01 | `storage.md` and `CONTRACTS.md` §4.1 agreed (Vedant approves the stored format) | PR review | — | PR link |
| AC-02 | A full 20× generator match is archived locally and the reader returns the recording exactly: setup, every event in `seq` order, every frame, final score | Round-trip script against `--record` output | Local stack | Report |
| AC-03 | Archiver killed and restarted mid-match: nothing lost, nothing duplicated after reading | Restart test | Local stack | Report |
| AC-04 | Relay and archiver running together: the screen check (relay e2e) still passes while the archive fills | Both checks in one run | Local stack | Reports |
| AC-05 | Unit tests: routing, duplicates, minute boundaries, period change, staged blocks, invalid messages | `pytest` | — | Output |
| AC-06 | Same round trip on Azure by changing settings only | Same script | Azure (A3) | Report |

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | AC | Estimate |
|---|---|---|---|---|---|
| A1 — Agree | Storage spec + `CONTRACTS.md` §4.1, reviewed by Vedant | Arnav (Pranav helps) | Vedant's review | AC-01 | 17–18 Oct |
| A2 — Archive locally | Core, stores, reader, runner, Function triggers; unit tests; round trip, restart, relay + archiver together | Arnav (Pranav helps) | A1, #32 merged | AC-02 – AC-05 | 18–19 Oct |
| A3 — On Azure | Bicep for containers and roles; same round trip on Azure (one Azure pass with screen S4) | Arnav (Pranav helps) | A2, subscription | AC-06 | 21–22 Oct |

- **Calendar check:** local archive by 19 Oct (before the 20 Oct checkpoint); Azure with the screen flow by 22 Oct.
- **Parallel work:** Vedant can design the replay route against the A1 format while A2 is built.
- **Scope reduction:** none, per Arnav.

## 13. Integration and change management

- **Branches / PRs:** `archiver/storage-spec` (spec + `CONTRACTS.md` §4.1 + plan) · `archiver/archive-flow` (code, tests,
  Function triggers) · A3 joins the screen flow's Azure branch.
- **Shared-file coordination:** `CONTRACTS.md` in its own commit, Vedant reviews; `functions/function_app.py` changes
  after #32 merges.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `functions/function_app.py`, `functions/requirements.txt` | PR #32 (screen relay) | Arnav | A2 starts after #32 merges | Agreed (same owner) |
| `infra/specs/local-development.md` | PR #32 does not touch it; screen plan does | Arnav | Small addition in A2 | Agreed (same owner) |
| `CONTRACTS.md` | none open | Vedant, Azeem | Dedicated commit in A1 | Pending |
| Replay route `web/src/app/api/replay/[id]` | `PLAN_web_live-match-viewer` (Vedant) | Vedant | Vedant builds on the A1 format | Pending |

Scanned at `d0cf75d` on 2026-10-17. Sources checked: plans ✓ · PRs ✓ (#32 open) · branches ✓ · hot files ✓.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks |
|---|---|---|---|---|---|
| R-01 | Azurite or Azure Blob handles staged blocks differently | Lost or invalid minute files | Arnav | Unit + round-trip tests on both | A2/A3 |
| R-02 | Vedant needs a different stored shape for replay | Rework | Arnav, Vedant | Agree in A1 before code | A2 |
| R-03 | Relay and archiver compete for the emulator's throughput | Throttling at 20× | Arnav | Measure in AC-04 | A2 |
| R-04 | The Function app imports the archiver from `../archiver`; a deployed bundle only contains `functions/` | Archive triggers fail to load on Azure | Arnav | Copy `archiver/*.py` into the bundle at build time (A3 deploy step) | A3 |
| R-05 | The Functions host itself (Event Hubs trigger metadata, retry) is untested locally: Core Tools not installed | Trigger differences found only on Azure | Arnav | Same core is tested through `main.py`; first host run in A3/S4 | A3 |

**Decisions (Arnav, 17 Oct):** D-01 stat panels in a separate `stats` container; D-02 retention until 10 Nov + 7 days;
D-03 events stored unchanged with `id` = `event_id`; Cosmos on the free tier with shared database throughput.

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
| Arnav | v1 | — | Pending | — |

**Implementation readiness:** A1 merged (#33); A2 built and verified locally (this PR).
**Next action and owner:** review and merge the A2 PR; then A3 with the screen flow's Azure pass · Arnav.

### Handover after implementation

**A2 (17 Oct), branch `archiver/archive-flow`.** Built: core (`consumer.py`), Cosmos stores (`event_store.py`), Blob
minute files (`tracking_chunks.py`), reader (`reader.py`), local runner (`main.py`), Function triggers
`archive_events` / `archive_tracking`, unit tests and the round-trip check.

| AC | Result | Evidence |
|---|---|---|
| AC-01 | Spec and §4.1 merged in #33 at `078e1b1`; its last amendment (`92c3e8f`: commit after every batch, no `tracking_minutes`) missed that merge and comes in with this PR | #33, this PR |
| AC-02 | Passed. SYN-0505 (seed 505, 20×): setup, 2,301 events, 30,302 frames read back identical; status finished; score 3–0 | `archiver/tests/check_archive.py SYN-0505` |
| AC-03 | Passed. Archiver stopped hard mid-match and restarted; it resumed from its checkpoints and the read-back had nothing missing or repeated. After a hard stop the new process waits about 2–2.5 min for the old partition ownership to expire before reading `match-events`, then catches up | Same run as AC-02 |
| AC-04 | Passed. Relay and archiver ran together: relay check got 8,377 envelopes, every event and frame, score 3–0 | `functions/tests/e2e_local.py --seed 505 --match 505` |
| AC-05 | Passed. 7 archiver tests (2 against Azurite and the Cosmos emulator); relay's 17 tests still pass; ruff clean | `uv run pytest` |
| AC-06 | Pending (A3) | — |

Open for A3: R-04 (copy `archiver/*.py` into the Functions bundle) and R-05 (first Functions host run).
