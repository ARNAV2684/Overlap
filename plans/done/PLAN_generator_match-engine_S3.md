# PLAN_generator_match-engine_S3 — M3 part 2: the reference clubs look real

| Field | Complete this |
|---|---|
| Sprint | S3 — Skyhaven vs Amberholt plays like the teams they resemble, and match totals land in range |
| Parent plan | [`PLAN_generator_match-engine.md`](PLAN_generator_match-engine.md) · v0.2 |
| Milestone in parent plan | M3 (part 2) and the match-total half of M5 · AC-05, AC-06 |
| Author / owner | Azeem |
| Status | Done (merged in PR #35, 2026-10-17) |
| Reviewed branch and commit | `generator/batch-mode` · 60badf2; `main` · 8fa24d4 merged in on 2026-10-17 after PRs #20–#34 merged |
| Planned branch | `generator/reference-realism`, from `generator/batch-mode` |

## 1. Outcome

- **What will work at the end of this sprint:** in `cli.py season --repeat 12 --report`, Amberholt takes 5–9 shots a
  match with a larger counter-shot share than Skyhaven; Skyhaven takes 16–22 and still has more possession, a lower
  PPDA and more high regains; most `CALIBRATION.md` match-total rows pass.
- **Not in this sprint:** the other 8 clubs and a full season; offsides (6 a team, but the row has no source yet);
  the stats engine's own xG; recording measured values in `CALIBRATION.md` (that waits for a full season).

**Baseline** (report on 60badf2, 12 matches; extra counts from a diagnostic run over seeds 1–8):

| | Skyhaven | Amberholt | Why |
|---|---|---|---|
| Shots | 29.2 | 1.7 | |
| Team-mates in the final third when the carrier is there | 4.8 | 1.1 | 5-4-1 midfield stays at about 62 % when the ball is at 75 % |
| Final-third actions: cross / cutback / shot | 10 % / 13 % / 3.5 % | 0.2 % / 0.9 % / 1.9 % | nobody in the box to cross to |
| xG per shot | 0.15 | 0.08 | low block is 20 m deep between lines, so Skyhaven shoots past few defenders |
| Counter share | 0.07 | 0.05 | 8 s window; Amberholt's breakers stay level with the ball |

Match totals failing: goals 4.33 (2.7–3.3), shots 30.8 (25–28), conversion 14.1 % (10–12 %), passes 1,059 (820–950),
completion 75.2 % (79–84 %), fouls 8.9 a team (9–14), match length 103.1 min (99–103).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Agreed `movement.md`, `actions.md`, `engine.md` | PR #15 (merged) | Yes |
| Batch mode and the realism report | PR #24 (merged) | Yes |
| Targets with sources | `CALIBRATION.md` (PR #16, merged) | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `generator/movement.py` | Modify | **Support runs:** with the ball in the final third, attack-line and wide players push to the box and stay near the ball, one central midfielder supports; **counter runs:** breakers run toward the space behind the opponent's line; **compact block:** out of possession the gap between lines shrinks as `line_height` falls | `movement.md` §1 |
| `generator/decisions.py` | Modify | Counter-window pass targets favour runners in behind; any shot or cross weights that need retuning once runners arrive | `actions.md` §2 |
| `generator/config.py` | Modify | New knobs for the rules above; retuned values for shot appetite, pass success and interceptions, decision delay, added time | `actions.md` §6 |
| `generator/engine.py` | Modify | Counter window only from own-half regains, ended by a pass that doesn't go forward; corners from blocked shots and headed or cut-out crosses; the agreed short corners and long throws (missing until now); `set_piece_focus` on deliveries; marking passed to pass success | `actions.md` §2–§3, `set-pieces-and-discipline.md` §1 |
| `generator/outcomes.py` | Modify | A ground pass to a marked spot is harder | `actions.md` §3 |
| `generator/specs/movement.md` | Modify | §1: support runs, counter runs, compact block | Itself |
| `generator/specs/actions.md` | Modify | §2 base-weight table and counter window, §6 knobs, kept in step with `config.py` | Itself |
| `generator/specs/set-pieces-and-discipline.md` | Modify | §1 delivery bonus from `set_piece_focus`, counter window wording; §2 foul factor in own box | Itself |
| `generator/tests/test_discipline.py` | Modify | The offside test allows the half to end before the free kick is taken (an edge case the new seeds hit; the engine is right) | `set-pieces-and-discipline.md` §5 |
| `generator/tests/test_engine.py` | Modify | Shape tests: a 5-4-1 side has at least three players in the final third when it has the ball there; a low block is more compact than a high line | `movement.md` §1 |
| `plans/active/PLAN_generator_match-engine.md` | Modify | M3 part 2 handover | — |
| `plans/active/PLAN_generator_match-engine_S3.md` | Add | This sprint plan | — |

## 4. Steps

1. **Support runs and counter runs** (`movement.py`, `config.py`, `movement.md`). Re-measure Amberholt's final-third
   support (target about 3–4) and shots.
2. **Compact low block** out of possession. Re-measure Skyhaven's xG per shot (target about 0.11) and shots.
3. **Counters:** pass targets in the counter window favour runners in behind; counter window length if the data
   says 8 s is too short (spec updated with it). Check Amberholt's counter share beats Skyhaven's.
4. **Match totals** with `config.py` knobs, one small step at a time: shot appetite (shots, goals), pass success and
   interceptions (completion), decision delay (passes), foul base (fouls), added time (match length).
5. **Tests and checks:** new shape tests; `uv run pytest`; `OVERLAP_SEEDS=10` invariants by hand; `ruff 0.17.0`;
   final 12-match report.
6. **Specs and handover** in step with the code; PR into `main`, reviewer Arnav.

Iteration uses a fast parallel diagnostic (8 seeds in about 35 s); every acceptance number comes from the 12-match
report.

## 5. Contracts and shared files

- **Contract changes:** none. Events and tracking keep their shapes; only how often things happen changes.
- **Hot shared files touched:** none.

## 6. Conflict scan

No overlaps found on 2026-10-17 at `main` 62678ce. Re-checked at `main` 8fa24d4 after PRs #20–#34 merged; the PR's
scope report lists two plans, neither a conflict:

| Overlap | Resolution |
|---|---|
| `PLAN_generator_storylines.md` (Azeem) lists `generator/engine.py` for its M2 | Its code hasn't started; it starts from `main` after this PR merges |
| `PLAN_plans_housekeeping.md` (Arnav) lists `PLAN_generator_match-engine.md` | Its status-line edit merged in PR #26 and is already in this branch; this PR changes other lines |

Hot files: none.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S3-AC-01 | Over 12 repeat matches, Amberholt averages 5–9 shots and Skyhaven 16–22 | Answer key in the report | Pending implementation |
| S3-AC-02 (AC-05) | Skyhaven has more possession, a lower PPDA and more high regains; Amberholt has larger counter-shot and set-piece-shot shares | Answer key | Pending implementation |
| S3-AC-03 (AC-06) | At least 6 of the 8 match-total rows pass (goals, shots, conversion, passes, completion, fouls, yellows, length) | Report table | Pending implementation |
| S3-AC-04 | Invariants and seed tests still hold; new shape tests pass; ruff clean | `uv run pytest`, `OVERLAP_SEEDS=10`, `uvx ruff@0.17.0 check` | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Twelve matches is a small sample (Amberholt's shots vary a lot match to match) | A row passes or fails by noise | Azeem | None — report the 12-match numbers and a 24-seed check beside them |
| Fixing one total moves others (shots, goals and conversion are linked) | Tuning loops | Azeem | Step 4 order; stop at "most rows pass" |
| Counter window longer than 8 s | `actions.md` §2, §4 change | Azeem | Step 3 only |
| Shot conversion depends on xG per shot, which the stats engine will also compute | Drift later | Stats owner, unassigned (Arnav decides) | None now |

**Cut first if time runs short:** match length, then fouls; keep Amberholt's shots and the answer-key directions.

## 9. Handover

**Done.** Branch `generator/reference-realism`; PR into `main` (reviewer Arnav).

**Acceptance results** (`cli.py season --repeat 12 --report`, report in `data/generated/reports/S1-repeat-SKH-AMH-12/`):

| | Skyhaven | Amberholt |
|---|---|---|
| Shots | 20.8 | 6.0 |
| Possession | 0.56 | 0.44 |
| PPDA | 13.5 | 33.3 |
| High regains | 51.5 | 23.1 |
| Counter share | 0.10 | 0.17 |
| Set-piece share | 0.14 | 0.18 |

- **S3-AC-01:** met (Amberholt 6.0 in 5–9; Skyhaven 20.8 in 16–22).
- **S3-AC-02 (AC-05):** met: every direction holds.
- **S3-AC-03 (AC-06):** met: all 8 match-total rows pass (goals 3.08, shots 26.8, conversion 11.5 %, passes 931,
  completion 79.5 %, fouls 11.0 a team, yellows 4.75, match length 101.0 min); **16 of 16** measured targets pass
  (baseline 9 of 16).
- **S3-AC-04:** met: `pytest` 83 passed, 1 skipped (the private name check; its mapping file is not in this checkout); four new shape and counter tests; `ruff 0.17.0` clean on every changed `.py` file.
- **Second sample** (seeds 1–32, quick diagnostic, same code): Skyhaven 18.2 shots, Amberholt 6.1; counter share 0.10
  against 0.15 (met); set-piece share 0.18 against 0.11 (**not met on this sample**); goals 2.5 and shots 24.2
  (slightly low), passes 940, completion 80.1 %, fouls 9.5. The set-piece share depends on a handful of Amberholt
  corners a match, so it flips between samples.

**What changed:** support runs in the final third and counter runs on the last defender's shoulder; a compact low
block, a back line that stays goal-side and narrows near goal, marking in the own third; a quality-sensitive shot
choice where direct sides shoot sooner; a counter window that starts only in the own half and ends when the attack
stops going forward; corners from blocks and defended crosses; the agreed short corners and long throws, which were
missing; `set_piece_focus` on deliveries; marked passes harder; base weights, success rates and decision delay
retuned. Amberholt's carrier now has 3.1 team-mates in the final third (was 0.9).

**Differences from this plan:** `outcomes.py` and `test_discipline.py` were added to the file map; `discipline.py`
was not needed (more tackles brought fouls into range). The counter window is now 12 s from own-half regains (was
8 s from the own half or middle third).

**Follow-ups:** offsides run at about 3.5 a team (the row has no source yet); Amberholt's set-piece share needs more
corners to be stable; `CALIBRATION.md` measured values wait for a full season.
