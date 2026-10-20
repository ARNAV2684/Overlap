# PLAN_contracts_setup-transport — write the Event Hubs transport into CONTRACTS.md (decision L1)

| Field | Complete this |
|---|---|
| Proposal title | Contracts: document how the setup, events and tracking travel on Event Hubs |
| Author / primary owner | Arnav (this document change). The behaviour it documents was designed and built by **Azeem** (live mode, PR #18 spec and PR #21 code; decision L1 in his live-mode plan) |
| Collaborators and responsibilities | Azeem: confirm the text matches live mode. Vedant: confirm nothing changes for the web side |
| Review coordinator | Arnav |
| Affected component owners | Producer: Azeem (generator). Consumers: stats engine, archiver and screen relay (unassigned, Arnav decides); mock (Arnav); web app via the relay (Vedant) |
| Proposal version and date | 1.0 · 17 Oct 2026 |
| Status | Ready for review |
| Plan tier and file | Full · `plans/active/PLAN_contracts_setup-transport.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 6f2f459 |
| Architecture box / work area | Box 1 → box 2 handoff (generator → Event Hubs → consumers) |
| Relevant issue, spec PR, or discussion | Decision L1 in `PLAN_generator_live-mode` (in `plans/active/` until PR #26 moves it to `plans/done/`); spec PR #18; code PR #21 |

## 1. Purpose and intended outcome

- **Problem or need:** `CONTRACTS.md` defines the shape of the setup, events and tracking frames but not how they
  travel on Event Hubs. The only description is in the generator's spec and in the mock's code, so stats, archiver and
  relay authors would have to read those to know the first message on `match-events` is the setup.
- **Proposed outcome:** `CONTRACTS.md` §1.4 states the hubs, order, `kind` property, partition key and content type,
  exactly as live mode already does.
- **Benefit to viewers or teammates:** consumers build against one shared document.
- **Success statement:** every statement in §1.4 matches `generator/live.py` and the mock's Event Hubs sink.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code | `generator/live.py` (`schedule`, Event Hubs sink) · main 6f2f459 | Setup first on `match-events` with `kind=setup`; events `kind=event`; tracking `kind=tracking` on `match-tracking`; partition key and property `match_id`; `application/json` |
| Governing component specifications | `generator/specs/live-and-batch.md` §1 (agreed, PR #18) | Same transport; asks for it to be written into `CONTRACTS.md` (L1) |
| Shared contracts | `CONTRACTS.md` §1.3, §2–§4 | Shapes and `seq` dedupe; transport missing |
| Architecture diagram or meeting decision | Mock's Event Hubs sink, marked provisional pending this decision | Consumers built on the mock already expect this |

**Differences between references:** none in behaviour; only the missing paragraph.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| A new `CONTRACTS.md` §1.4 describing the existing transport | Any change to message shapes or to live mode; a separate setup hub; updating the "not in CONTRACTS.md yet" notes in `generator/specs/live-and-batch.md` and the mock (follow-ups, see §13) |

- **Minimum complete result:** §1.4 merged with the producer's agreement.
- **Optional extension:** None.
- **Boundary with neighboring components:** documentation only; no code changes.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| `CONTRACTS.md` (hot file) | Azeem (producer); Vedant (web) | Agreement that §1.4 matches the behaviour | Pending · M1 | Live mode already works this way |

**My owned deliverables:** the §1.4 text.  
**Shared deliverables:** none.

## 5. Proposed flow

```text
generator live mode -> match-events: setup (kind=setup), then events (kind=event)  -> stats, archiver, relay
                    -> match-tracking: frames (kind=tracking)                       -> relay, archiver
```

- **Input arrives through:** not applicable (documentation of existing behaviour).
- **Processing performed here:** none.
- **Output goes to:** `CONTRACTS.md`.
- **Execution relationship:** not applicable.
- **State retained:** not applicable.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| L1 · Setup transport | Setup first on `match-events`, `kind=setup` | Already built by Azeem and the mock; consumers expect it | A separate setup hub: cleaner, but a change for every consumer | Proposed by Azeem · agreement in this PR |

**Assumptions:** none.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Event Hubs messages | Generator → stats, archiver, relay | `CONTRACTS.md` §1.4 (new), §2–§4 | Documentation only; no shape or behaviour change | Azeem, Vedant · pending in this PR |

**Shared contract edits required:** `CONTRACTS.md` §1.4 (new).  
**Source of truth:** `CONTRACTS.md`.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `CONTRACTS.md` | Modify | Add §1.4 | `generator/specs/live-and-batch.md` §1 (agreed) | Arnav · Azeem, Vedant |
| `plans/active/PLAN_contracts_setup-transport.md` | Add | This plan | — | Arnav |

## 9. Failure handling and recovery

Not applicable — documentation only. Duplicate delivery after a retry is already covered by §1.3 and restated in §1.4.

## 10. Requirements specific to this work

Not applicable — no code, resources, cost, data or AI behaviour change.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given §1.4, when compared with `generator/live.py`, then hubs, order, `kind`, partition key, properties and content type all match | Read side by side | `generator/live.py` | Azeem's review |
| AC-02 | Given the PR, when the checks run, then they pass | PR checks | — | Check results |

**Validation limits:** none.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Contract text agreed | §1.4 merged | Arnav | Azeem's review | AC-01, AC-02 | 17 Oct |

- **Project calendar check:** fits before the 20 Oct end-to-end milestone, which the consumers need.
- **First integration checkpoint:** not applicable.
- **Parallel work:** none blocked.
- **Dependency-bound work:** none.
- **Scope reduction if time runs short:** none needed.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `contracts/setup-on-match-events`, one PR.
- **Shared-file coordination:** `CONTRACTS.md` is a hot file; Azeem and Vedant are reviewers.
- **Conflict scan result:** scanned at 6f2f459 on 17 Oct. Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `generator/specs/live-and-batch.md` (its "not in CONTRACTS.md yet" note) | PR #26 (`plans/housekeeping`) edits the same line's link | Azeem / Arnav | Not edited here; Azeem updates the note after both merge | Agreed (no shared edit) |

- **Integration procedure:** not applicable.
- **Configuration or setup changes:** none.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** follow-ups after merge: the note in `generator/specs/live-and-batch.md` §1 (Azeem) and the
  "provisional" comment in `mock/overlap_mock/sinks/eventhubs.py` (Arnav).

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | §1.4 misstates live mode | Consumers built on the wrong order or property | Azeem | His review (AC-01) | M1 |

**Decisions requested from Arnav or affected owners:**

1. Azeem: confirm §1.4 matches live mode.

## 15. Review, agreement, and handover

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Azeem | 1.0 | — | Pending | — |
| Vedant | 1.0 | Nothing changes for the web side: the browser never reads Event Hubs, only the relay's §7 envelopes | Approved | 20 Oct |

**Implementation readiness:** ready for the stated scope.  
**Relevant specification agreement:** `generator/specs/live-and-batch.md` §1, PR #18.  
**Next action and owner:** review · Azeem.

### Handover after implementation

Pending implementation.
