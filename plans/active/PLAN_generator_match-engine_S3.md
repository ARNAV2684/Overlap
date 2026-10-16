# PLAN_generator_match-engine_S3 — M3 part 2: the reference clubs look real

| Field | Complete this |
|---|---|
| Sprint | S3 — Skyhaven vs Amberholt plays like the teams they resemble, and match totals land in range |
| Parent plan | [`PLAN_generator_match-engine.md`](PLAN_generator_match-engine.md) · v0.2 |
| Milestone in parent plan | M3 (part 2) and the match-total half of M5 · AC-05, AC-06 |
| Author / owner | Azeem |
| Status | In progress (go from Azeem, 2026-10-17) |
| Reviewed branch and commit | `generator/batch-mode` · 60badf2 (PR #24, stacked on #20–#23); `main` · 62678ce |
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
| Batch mode and the realism report | PR #24 (open, stacked on #20–#23) | Yes — this branch stacks on it; the PR into `main` shows #20–#24's commits until they merge |
| Targets with sources | `CALIBRATION.md` (PR #16, merged) | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `generator/movement.py` | Modify | **Support runs:** with the ball in the final third, attack-line and wide players push to the box and stay near the ball, one central midfielder supports; **counter runs:** breakers run toward the space behind the opponent's line; **compact block:** out of possession the gap between lines shrinks as `line_height` falls | `movement.md` §1 |
| `generator/decisions.py` | Modify | Counter-window pass targets favour runners in behind; any shot or cross weights that need retuning once runners arrive | `actions.md` §2 |
| `generator/config.py` | Modify | New knobs for the rules above; retuned values for shot appetite, pass success and interceptions, decision delay, added time | `actions.md` §6 |
| `generator/engine.py` | Modify only if needed | Support runners sprint like breakers (`_targets`) | `engine.md` §2 |
| `generator/discipline.py` | Modify only if fouls stay below 9 | Foul base rate | `set-pieces-and-discipline.md` §2 |
| `generator/specs/movement.md` | Modify | §1: support runs, counter runs, compact block | Itself |
| `generator/specs/actions.md` | Modify | §2 base-weight table and counter window, §6 knobs, kept in step with `config.py` | Itself |
| `generator/specs/engine.md`, `set-pieces-and-discipline.md` | Modify only if their code changes | The matching rule | Itself |
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

No overlaps found on 2026-10-17 at `main` 62678ce. Open PRs #20–#25 are all Azeem's and this branch stacks on #24;
#25 (`generator/storylines-spec`) changes only `specs/storylines.md` and its own plan. No remote branch changes the
files above beyond `generator/batch-mode`. Active plans that name these files (calibration-sources, world-traits)
are merged work. Hot files: none.

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

**In progress — work-in-progress commit, not validated.** Specs not yet updated; tests and ruff not yet run.

Done in code (`movement.py`, `decisions.py`, `engine.py`, `outcomes.py`, `config.py`):
- Support runs in the final third (`SUPPORT_OFFSET_PCT` per slot, far-post runs); counter runners on the last
  defender's shoulder.
- Compact block out of possession (`BLOCK_DEPTH_*`); back line goal-side of the ball and narrow near goal
  (`GOAL_SIDE_PCT`, `DEEP_DEFENCE_*`); marking in the own third (`MARK_*`).
- Shot weight × (`SHOT_DIRECTNESS_BASE` + directness), and × (1 + counter_attack) in the counter window; short passes
  cut in the counter window (`COUNTER_SHORT_CUT`).
- Counter window: 12 s, only after a regain in the own half (`COUNTER_FROM_X`), ended by a backward pass
  (`COUNTER_BACK_PCT`).
- Corners from blocked shots, headed-away crosses and cut-out crosses (`BLOCK_CORNER`, `CROSS_*_CORNER`).
- Ground passes to a marked spot are harder (`MARKED_*`); box cutback and cross weights lowered.

Latest 16-seed diagnostic (not the 12-match report): Skyhaven 24.1 shots, Amberholt 5.3; counter share 0.13 against
0.15 (met); set-piece share 0.15 against 0.08 (**not met**); possession 0.56, PPDA 24 against 49, high regains 60
against 27 (met). Totals: goals 4.6 (high), shots 29.4 (high), passes 971 (slightly high), completion 75.9 %
(low), fouls 8.9 a team (low), yellows 4.5 (ok).

Left: bring Skyhaven's shots and xG down (it spends about 465 actions a match in the final third), Amberholt's
set-piece share back above Skyhaven's, totals; update `movement.md`, `actions.md` (§2, §3, §4, §6) and
`engine.md`; shape tests in `test_engine.py`; `uv run pytest`; ruff; the 12-match report; the parent plan handover;
the PR.
