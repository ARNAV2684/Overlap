# PLAN_plans_housekeeping — move finished plans to done and map the remaining folders

| Field | Complete this |
|---|---|
| Change | Move the 10 plans whose work has merged to `plans/done/`, correct the status line of the plans that stay active, and add `mock/` and `plans/` to the registry |
| Why | All 15 plans were still in `plans/active/`, so the PR checks reported overlaps with work that had already merged, and the scope report listed `plans/` as "not mapped to a layer" |
| Author / owner | Arnav |
| Status | Ready for review |
| Reviewed commit | main · 6f2f459 (after PRs #20–#25 merged) |
| Branch | `plans/housekeeping` |
| Governing spec | `plans/README.md` (lifecycle) and `plans/REGISTRY.md`; no spec change |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `plans/active/` → `plans/done/` | Move | `PLAN_contracts_match-conditions` (#17), `PLAN_docs_reference-profiles` (#7), `PLAN_generator_batch-mode` (#24), `PLAN_generator_calibration-sources` (#16), `PLAN_generator_live-mode` (#18, #21), `PLAN_generator_reference-feet` (#12), `PLAN_generator_world-traits` (#14), `PLAN_mock_live-feed` (#4), `PLAN_mock_single-match-demo` (#6), `PLAN_plans_generator-deliverables` (#13); each status line set to Done with its PR |
| `plans/active/PLAN_ci_pr-checks.md` | Modify | Status line only: M1 and M2 merged, M3 (ruleset on `main`) not confirmed |
| `plans/active/PLAN_generator_match-engine.md` | Modify | Status line only: M1, M2, M4 and M3 part 1 merged; M3 part 2 and M5 next |
| `plans/active/PLAN_generator_storylines.md` | Modify | Status line only: M1 (spec) merged; code not started |
| `plans/REGISTRY.md` | Modify | Two rows: `mock/` (Arnav) and `plans/` (shared; only Arnav edits the registry) |
| `generator/specs/live-and-batch.md` | Modify | The two links to the live-mode plan point to `plans/done/` instead of `plans/active/`; nothing else |
| `plans/active/PLAN_plans_housekeeping.md` | Add | This plan |

- **Contracts or hot shared files touched:** `plans/REGISTRY.md` (Arnav). No contract change. Decision L1 goes in its own
  contract PR.
- **Untouched on purpose:** `PLAN_generator_world-builder` (M3 not started) and `PLAN_web_live-match-viewer` (Vedant's
  draft) stay as they are. Plain-text mentions of moved plans in older conflict-scan notes are history and stay.
- **Conflict scan:** No overlaps found on 2026-10-17 at 6f2f459. Sources checked: plans ✓ · PRs ✓ (none open) ·
  branches ✓ · hot files ✓ (`plans/REGISTRY.md`, Arnav).
- **Done when:** `plans/active/` holds only the 5 plans with unfinished work plus this one; every relative Markdown link
  in the repository resolves; the PR checks pass.
- **Risk:** a plan moved to `done/` still has unfinished work. Each was checked against its milestones before moving.
- **Handover:** Pending implementation.
