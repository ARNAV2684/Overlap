# PLAN_contracts_match-conditions — match conditions in the setup, sourced penalty xG

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Contracts · optional `conditions` in the match setup; penalty xG 0.78 |
| Author / primary owner | Azeem |
| Collaborators and responsibilities | None |
| Review coordinator | Arnav |
| Affected component owners | Setup consumers: stats engine, screen relay, archiver (unassigned, Arnav decides), web app (Vedant), agents (unassigned, Arnav decides); `mock/` validator (Arnav) |
| Proposal version and date | v0.1 · 2026-10-16 |
| Status | Ready for review |
| Plan tier and file | Full · `plans/active/PLAN_contracts_match-conditions.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 75b7cba |
| Architecture box / work area | Shared contracts (`CONTRACTS.md` §2, §8) |
| Relevant issue, spec PR, or discussion | D9 in `PLAN_generator_match-engine`; engine specs in PR #15 |

## 1. Purpose and intended outcome

- **Problem or need:** the engine (PR #15) simulates weather and crowd, but the match setup has no field for them, so
  the agents and the web app can't mention them. `CONTRACTS.md` §8 says penalty xG ≈ 0.76; the public value is 0.78.
- **Proposed outcome:** the setup can carry `conditions` (temperature, precipitation, wind, attendance), and §8 uses
  the sourced 0.78.
- **Benefit to viewers or teammates:** commentary and screens can say "in heavy rain" or show the crowd; the stats
  engine and generator agree on penalty xG.
- **Success statement:** `CONTRACTS.md` on `main` defines `conditions` and penalty xG 0.78, agreed by the setup's
  consumers.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code or placeholder files | main · 75b7cba | No consumer of the setup exists yet except `mock/` and placeholders (`web/src/lib/contracts.ts` is a placeholder) |
| Governing component specifications | `generator/specs/engine.md` §9 (PR #15) | How conditions are drawn and what they change |
| Shared contracts | `CONTRACTS.md` v0 §2, §8 | Setup shape; xG definition |
| Architecture diagram or meeting decision | — | — |

**Differences between references:** `mock/overlap_mock/contracts.py` checks setup fields with strict equality, so a
setup that carries `conditions` would fail it; see §7.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| `conditions` in `CONTRACTS.md` §2 (shape, meaning, optional in v0) | How the generator draws conditions (engine spec) |
| Penalty xG 0.78 in §8 | Showing conditions on screen (web app) or in commentary (agents) |
| — | Changing `mock/` (Arnav's call; see §7) |

- **Minimum complete result:** the two contract edits merged with the consumers' agreement.
- **Optional extension:** none.
- **Boundary with neighbouring components:** the contract only; every consumer adopts it in its own work.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Setup consumers | Arnav (for unassigned layers), Vedant | Agreement to accept `conditions` | Pending · merge | Field is optional, nothing breaks |
| Stats engine xG | Unassigned (Arnav decides) | Agreement on penalty 0.78 | Pending · merge | — |
| `mock/` validator | Arnav | Accept `conditions` as optional, or not (§7) | Pending | Generator only sends `conditions` once the engine exists |

**My owned deliverables:** the contract text.  
**Shared deliverables:** consumers adopting the field (each owner).

## 5. Proposed flow

```text
generator (engine.md §9) ──conditions in setup──▶ match-events hub ──▶ stats, relay, archiver, web, agents
```

- **Input arrives through:** the setup, sent once before kickoff. **Processing here:** none (contract only).
  **Output goes to:** every setup consumer. **Execution relationship:** unchanged. **State retained:** not applicable.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Optional or required | Optional in v0; the generator always sends it | Nothing breaks for the mock or anything built on it | Required: cleaner, but every current setup becomes invalid | Proposed · consumers |
| Shape | Flat object: `temperature_c`, `precipitation`, `wind_ms`, `attendance` | Small, easy to validate, enough for words and a weather icon | Nested weather object: no gain at this size | Proposed |
| Numbers to agents | Only through evidence packs | Keeps "numbers come from code" (§5.1) | Let agents read setup numbers: unverifiable claims | Proposed |
| Penalty xG | 0.78 | Opta's published value (`CALIBRATION.md`) | Keep ≈ 0.76: unsourced | Proposed · stats owner |

**Assumptions:** no consumer has hard-coded the setup's fields yet beyond `mock/` (checked: placeholders only).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Match setup | Generator → stats, screen relay, archiver, web, agents | `CONTRACTS.md` §2 | Add optional `conditions` | Arnav (unassigned layers), Vedant · pending |
| xG definition | Stats engine ↔ generator | `CONTRACTS.md` §8 | Penalty ≈ 0.76 → 0.78 | Stats owner (unassigned, Arnav decides) · pending |

- `temperature_c` number with one decimal; `precipitation` one of `none`, `light`, `heavy`; `wind_ms` number ≥ 0 with
  one decimal; `attendance` whole number ≥ 0. All four present whenever `conditions` is.
- **Unknown or missing:** consumers accept a setup with or without `conditions`, and reject unknown keys inside it.
- **Compatibility:** `mock/overlap_mock/contracts.py` checks setup keys with strict equality; it would reject a
  generator setup with `conditions`. Arnav decides whether the mock's validator accepts it; the generator only starts
  sending it with the engine (G2 M2), so there is time.

**Shared contract edits required:** `CONTRACTS.md` §2 and §8.  
**Source of truth:** `CONTRACTS.md`.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `CONTRACTS.md` | Modify (hot) | §2 example and `conditions` bullet; §8 penalty xG | Itself | Azeem / Arnav, Vedant |
| `plans/active/PLAN_contracts_match-conditions.md` | Add | This plan | — | Azeem |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| A consumer receives a setup without `conditions` | Accepts it; shows no weather | — | None | Contract review |
| A consumer receives a bad `precipitation` value | Rejects the setup, like any invalid field | Generator fix | Match not shown until fixed | Generator tests (G2) |

## 10. Requirements specific to this work

- **Performance and load, Observability, Azure resources and access, Cost:** not applicable — a contract text change.
- **Security and data:** conditions are synthetic; no personal data.
- **AI behavior:** agents may describe conditions in words; numbers only via evidence packs.
- **Frontend experience:** a missing `conditions` must not break any screen.
- **Synthetic data or calculations:** penalty xG 0.78 is sourced in `CALIBRATION.md`.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | `CONTRACTS.md` §2 defines `conditions` with types, ranges and the optional rule; §8 says 0.78 | Review | — | PR diff |
| AC-02 | The affected owners agree in the PR | PR review | — | Review record |

**Validation limits:** no consumer code exists to test against yet.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Contract agreed | Edits merged | Azeem | Owners' agreement | AC-01, AC-02 | 16–17 Oct |

- **Project calendar check:** fits; nothing on the 20 Oct path waits for it.
- **First integration checkpoint:** the engine's first setups (G2 M2).
- **Parallel work:** everything; the field is optional.
- **Dependency-bound work:** consumers showing conditions.
- **Scope reduction if time runs short:** drop `conditions`, keep the penalty fix.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `contracts/match-conditions`, contract only.
- **Shared-file coordination:** `CONTRACTS.md` is hot: Arnav (unassigned consumers and stats) and Vedant (web) are
  told through the PR.
- **Conflict scan result:** No overlaps found on 2026-10-16 at 75b7cba.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| — | No open PR or active plan changes `CONTRACTS.md` | — | — | — |

- **Integration procedure:** consumers read §2 when they build their setup parsing.
- **Configuration or setup changes:** none.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** `CONTRACTS.md` only.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Consumers prefer `conditions` required | Small rework | Arnav, Vedant | Make it required before the mock is deleted | None |
| R-02 | Mock validator rejects generator setups with `conditions` | Local checks fail | Arnav | Mock accepts it, or the generator checks with its own validator | G2 M2 |

**Decisions requested from Arnav or affected owners:**

1. Agree `conditions` as optional in v0, with this shape. Recommendation: yes.
2. Agree penalty xG 0.78 in §8. Recommendation: yes, it is sourced.
3. Should `mock/`'s validator accept `conditions`? Arnav's call.

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
| Arnav, Vedant | v0.1 | — | Pending | — |

**Implementation readiness:** the edit is written; merging needs the owners' agreement.  
**Relevant specification agreement:** `engine.md` §9 in PR #15.  
**Next action and owner:** owners review the PR · Azeem.

### Handover after implementation

- Implementation PR and commit: branch `contracts/match-conditions`; PR to follow.
- Acceptance results: AC-01 written; AC-02 pending review.
- Setup and integration instructions: see §7.
- Differences from the agreed proposal: none.
- Known limitations and follow-up owner: `mock/` validator (Arnav).
