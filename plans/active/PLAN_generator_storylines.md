# PLAN_generator_storylines — G4 storylines and answer keys

| Field | Complete this |
|---|---|
| Change | M1: write `generator/specs/storylines.md` (format, allowed effects and limits, catalogue, answer keys). M2, after it merges: `storylines.py`, the storyline files, the engine hook and tests |
| Why | Registry deliverable G4. The demo needs scripted drama, and the agents' recall evaluation needs to know when each storyline started |
| Author / owner | Azeem |
| Status | In progress (M1, the spec, merged in PR #25; M2, the code, in review) |
| Reviewed commit | `generator/batch-mode` (PR #24, stacked on #20–#23); M2 on `generator/reference-realism` (PR #35) |
| Branch | `generator/storylines-spec` (M1); `generator/storylines` (M2) |
| Governing spec | `generator/specs/storylines.md` — agreed (PR #25) |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `generator/specs/storylines.md` | Modify (M1) | All four sections answered |
| `generator/storylines.py` | Modify (M2) | Load and check storyline files; apply their effects within the limits; record answer keys |
| `generator/storylines/*.yaml` | Modify / add (M2) | The six catalogue storylines (the existing `late_pressure_surge.yaml` placeholder filled in) |
| `generator/engine.py` | Modify (M2) | Storyline effects through the score-and-time hook; answer keys in the summary |
| `generator/discipline.py` | Modify (M2) | Foul and card rates take the storyline multipliers |
| `generator/config.py` | Modify (M2) | A `storylines` random stream (for the start jitter) |
| `generator/batch.py` | Modify (M2) | A run can carry storylines; their names go in the run name and `run.json` |
| `generator/cli.py` | Modify (M2) | `--storyline` on `play`, `live` and `season`; a bad storyline file prints an error |
| `generator/tests/test_storylines.py` | Add (M2) | File checks, limits, onset and ramp, answer keys, no forced events |
| `plans/active/PLAN_generator_storylines.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. The setup already carries `storylines` names (`CONTRACTS.md` §2);
  answer keys stay in the generator's output files.
- **Conflict scan:** No overlaps on 2026-10-17. Sources checked: plans ✓ (only this stack's plans touch `generator/`;
  `agents/specs/evaluation.md` is read, not changed) · PRs ✓ (#20–#24 are this stack) · branches ✓ · hot files ✓.
  Re-checked for M2 at `main` 8fa24d4; the PR's scope report lists two overlaps, neither a conflict:

  | Overlap | Resolution |
  |---|---|
  | PR #35 (Azeem) changes `config.py`, `engine.py` and other engine files | M2 stacks on #35's branch and merges after it |
  | `PLAN_plans_housekeeping.md` (Arnav) lists this plan | Its status-line edit merged and is already in this branch; M2 updates that line |

  Hot files: none.
- **Done when (M1):** the spec answers every question and merges as agreed. **(M2):** a match with
  `late_pressure_surge` shows more home pressures and shots per 5 minutes after onset than before, over 20 seeds; every
  storyline file loads within its limits; answer keys are in `summary.json`; tests pass.
- **Risk:** effects too weak to notice or too strong to believe. The limits in §2 bound the second; M2 measures the
  first with the realism report.
- **Handover (M2):** `storylines.py` loads and checks the six catalogue files (limits from §2, at most two per
  match), starts each at its minute (with seeded jitter) or on its `after` condition, ramps it in and applies it
  through the engine's style, shot appetite, stamina and discipline hooks; `star_night` adds a form bonus to one player.
  The summary carries an answer key per storyline with the signals measured over the 15 minutes before and after
  onset. `fading_legs` applies to the leading side (the catalogue says "either").
  Measured with and without each storyline on the same seeds (8 seeds, SKH v AMH):

  | Storyline | Window | Signal | With | Without |
  |---|---|---|---|---|
  | `late_pressure_surge` | 58'+ | SKH pressures per 100 AMH passes | 98.8 | 85.5 |
  | `red_card` | 28'–42' | AMH fouls / cards | 3.0 / 0.75 | 1.4 / 0.12 |
  | `low_block_resistance` | whole match | SKH pressures / AMH fouls / AMH cards | 339 / 11.6 / 3.9 | 288 / 8.4 / 1.4 |

  Done-when check, 20 seeds, SKH at home: home pressures per 5 minutes 17.7 before onset, 19.7 after; shots 0.93,
  1.13. The averages rise, but per match pressures rise in only 13 of 20 and shots in 8 of 20, because Skyhaven
  already presses at 0.85–0.90 and the surge is clipped at 1.0. With Amberholt at home (0.45 press) the surge is
  clear in every seed tested. **Open:** whether the catalogue's "good demo with Skyhaven at home" should move to a
  side with room to press more (a spec change for Arnav). The low block's extra fouls and cards are not forced: a
  deeper Amberholt defends more often near its own box.
