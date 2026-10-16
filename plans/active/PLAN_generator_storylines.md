# PLAN_generator_storylines — G4 storylines and answer keys

| Field | Complete this |
|---|---|
| Change | M1: write `generator/specs/storylines.md` (format, allowed effects and limits, catalogue, answer keys). M2, after it merges: `storylines.py`, the storyline files, the engine hook and tests |
| Why | Registry deliverable G4. The demo needs scripted drama, and the agents' recall evaluation needs to know when each storyline started |
| Author / owner | Azeem |
| Status | In progress (M1, go from Azeem, 17 Oct) |
| Reviewed commit | `generator/batch-mode` (PR #24, stacked on #20–#23) |
| Branch | `generator/storylines-spec` (M1); `generator/storylines` (M2) |
| Governing spec | `generator/specs/storylines.md` — not started; this plan writes it (spec gate) |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `generator/specs/storylines.md` | Modify (M1) | All four sections answered |
| `generator/storylines.py` | Modify (M2) | Load and check storyline files; apply their effects within the limits; record answer keys |
| `generator/storylines/*.yaml` | Modify / add (M2) | The six catalogue storylines (the existing `late_pressure_surge.yaml` placeholder filled in) |
| `generator/engine.py` | Modify (M2) | Storyline effects through the score-and-time hook; answer keys in the summary |
| `generator/discipline.py` | Modify (M2) | Foul and card rates take the storyline multipliers |
| `generator/tests/test_storylines.py` | Add (M2) | File checks, limits, onset and ramp, answer keys, no forced events |
| `plans/active/PLAN_generator_storylines.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. The setup already carries `storylines` names (`CONTRACTS.md` §2);
  answer keys stay in the generator's output files.
- **Conflict scan:** No overlaps on 2026-10-17. Sources checked: plans ✓ (only this stack's plans touch `generator/`;
  `agents/specs/evaluation.md` is read, not changed) · PRs ✓ (#20–#24 are this stack) · branches ✓ · hot files ✓.
- **Done when (M1):** the spec answers every question and merges as agreed. **(M2):** a match with
  `late_pressure_surge` shows more home pressures and shots per 5 minutes after onset than before, over 20 seeds; every
  storyline file loads within its limits; answer keys are in `summary.json`; tests pass.
- **Risk:** effects too weak to notice or too strong to believe. The limits in §2 bound the second; M2 measures the
  first with the realism report.
- **Handover:** Pending implementation.
