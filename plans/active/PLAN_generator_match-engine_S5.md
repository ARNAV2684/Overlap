# PLAN_generator_match-engine_S5 — the 100-match smoke check, with the whole league inside calibration

| Field | Complete this |
|---|---|
| Sprint | S5 — goals, shots and home advantage right across the 10-club league; 100-match smoke check; the generator wrapped up |
| Parent plan | [`PLAN_generator_match-engine.md`](PLAN_generator_match-engine.md) · v0.2 |
| Milestone in parent plan | M5 — smoke check (AC-03 at 100 seeds, AC-05, AC-06), extended from Calverholme v Dunmarrow to the full league |
| Author / owner | Azeem |
| Status | Done, in review (go from Azeem, 2026-10-17) |
| Reviewed branch and commit | main · 103a526 (after PRs #35–#39 merged) |
| Planned branch | `generator/engine-smoke` |

## 1. Outcome

- **What will work at the end of this sprint:**
  - **Calverholme v Dunmarrow:** over 100 seeds, every sourced match-total row in `CALIBRATION.md` passes, and every
    answer-key direction holds.
  - **The full league:** two seasons (180 matches) pass the same rows, including the home / draw / away split.
  - **Speed:** batch runs use all CPU cores and give the same output as a single core.
  - **Wrap-up:** every generator plan is marked done and in sync.
- **Not in this sprint:**
  - New event types or contract changes.
  - Venue climate and capacity.
  - The generator on Azure; the season loader into Cosmos (owners unassigned, Arnav decides).

**Diagnosis behind the steps.** Season S1 (90 matches, main · 103a526) passed 13 of 17 targets:

| Finding | League | Calverholme v Dunmarrow (12 matches) | Real / target |
|---|---|---|---|
| Goals ÷ xG | 0.74 (1.79 goals from 2.42 xG) | 0.87 | about 1.0 by definition |
| Shot outcomes: off target / blocked / on target | 60 / 14 / 26 % | — | about a third on target (`actions.md` §4) |
| Home xG / away xG | 1.20 / 1.22; goals 0.80 / 0.99 | — | home 42–49 % of wins |
| Pass completion | 77.0 % | 79.4 % | 79–84 % |

1. **Goals fall below xG.** P(goal | on target) divides xG by an *average* shooter's on-target chance. The real
   shooter's chance is then cut further for pressure, weak foot and fatigue, so goals sit below xG for everyone.
2. **The keeper term is too weak and off-centre.** Finishing is compared with goalkeeping directly. The code uses
   0.08 logit per 10 points while `actions.md` §4 says 0.15. Shooters include defenders and midfielders, so the
   term pulls conversion down across the league.
3. **No real home advantage.** The only home effects are +2 composure and slightly fewer fouls given, so home and
   away sides create the same chances.
4. **Pass completion is slightly low** in league matches. League clubs pass less well than Calverholme.

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| The 10-club league | PR #38 | Yes (merged) |
| Specs agreed: `engine.md`, `actions.md`, `live-and-batch.md` | PRs #14, #18 | Yes |
| Public sources for the shot outcome mix and home advantage | `CALIBRATION.md` | Partly: home win shares are sourced; on-target and blocked shares need a source (step 2). An unsourced row is reported but not tuned to |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `generator/outcomes.py` | Modify | Goal chance normalised so an average finisher against an average keeper scores at his xG; finishing and goalkeeping each measured from a league reference | `actions.md` §4 |
| `generator/config.py` | Modify | Shot outcome mix, keeper term, base pass success, home edge, reference ratings | `actions.md` §3–§4, `engine.md` §9 |
| `generator/decisions.py` | Modify | Shot weight follows finishing less steeply, so a club's shots spread across its attackers (added with Azeem's agreement, 2026-10-17) | `actions.md` §2 |
| `generator/world.py`, `generator/specs/world.md`, `generator/tests/test_world.py` | Modify | A lineup with no available player for a slot plays someone out of position, never stopping a season (found when season 2 crashed at matchweek 10; added with Azeem's agreement) | `world.md` §2 |
| `generator/specs/set-pieces-and-discipline.md`, `generator/tests/test_storylines.py` | Modify | Card rates synced to the code and tuned; the star-night test measured on top of the home edge | `set-pieces-and-discipline.md` §3 |
| `generator/engine.py` | Modify | Home edge: a small crowd-scaled boost to the home side's passing, finishing, tackling and composure | `engine.md` §9 |
| `generator/batch.py`, `generator/cli.py` | Modify | `--jobs N` plays matches in parallel processes; results identical to one process | `live-and-batch.md` §3, §5 |
| `generator/realism_report.py` | Modify | Measures the new rows: shots on target, blocked shots, goals per xG, home and away goals | `live-and-batch.md` §4 |
| `generator/specs/actions.md`, `engine.md`, `live-and-batch.md` | Modify | The new rules and numbers. `live-and-batch.md` §1: the setup's transport is now in `CONTRACTS.md` §1.4 (a follow-up left from the setup-transport plan) | themselves |
| `generator/specs/storylines.md` | Modify | §3 "good demo with": league clubs with room to change (D-02) | itself |
| `CALIBRATION.md` | Modify | Sources for the new rows; the measured column filled from the smoke check | — |
| `generator/tests/test_engine.py`, `test_batch.py` | Modify | xG and conversion anchors; `--jobs` gives byte-identical results | `actions.md` §4, `live-and-batch.md` §3 |
| `plans/active/PLAN_generator_match-engine.md`, `PLAN_generator_world-builder.md`, `PLAN_generator_world-builder_S3.md`, this plan | Modify, then move to `plans/done/` | Status Done with their PRs; links that point at them updated | — |

## 4. Steps

1. **Faster runs.** Add `--jobs` to batch mode first, so each tuning loop takes minutes, not a quarter of an hour.
   Check that `--jobs 8` gives byte-identical files to `--jobs 1`.
2. **Sources.** Find public figures for shots on target, blocked shots and the home / away goal split, and add them
   to `CALIBRATION.md`.
3. **Goals follow xG.** Normalise P(goal | on target) by the shooter's on-target chance under the same conditions
   for an average finisher. Centre the finishing and goalkeeping terms on league reference ratings, and bring the
   per-10-points value in line with `actions.md` (0.15). Target: goals ÷ xG within 0.95–1.05 across the league.
4. **Shot outcome mix.** Move the block and on-target chances towards the sourced shares.
5. **Home advantage.** Add a crowd-scaled home edge (proposed +3 to passing, finishing, tackling and composure at a
   full house, D-01). Tune it until the home / draw / away split is in range over 180 league matches.
6. **Pass completion.** Adjust base pass success if the league is still below 79 %, while keeping Calverholme v
   Dunmarrow in range.
7. **Smoke check.**
   - `cli.py season --repeat 100 --report --jobs 8` (Calverholme v Dunmarrow, AC-05 and AC-06).
   - Two league seasons (seeds 1 and 2, 180 matches).
   - `OVERLAP_SEEDS=100 pytest tests/test_invariants.py` (AC-03).
   Record everything in `CALIBRATION.md` and here.
8. **Wrap-up.**
   - Storyline demo pairing (D-02).
   - The `live-and-batch.md` §1 note.
   - Mark the match-engine and world-builder plans done and move them, then check every link.

## 5. Contracts and shared files

- **Contract changes:** none. Event shapes stay as they are; only how often outcomes happen changes.
- **Hot shared files touched:** none. `CALIBRATION.md` is the generator's own file.

## 6. Conflict scan

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `generator/specs/live-and-batch.md` §1 | `PLAN_contracts_setup-transport.md` (Ready for review; its §1.4 merged) | Arnav | The plan leaves this note's update to Azeem after §1.4 merges, which it has | Agreed (in that plan) |
| `live-and-batch.md`, the match-engine and world-builder plans | `PLAN_plans_housekeeping.md` (Arnav), from #40's scope report | Arnav | Its edits merged in PR #26 (a link in `live-and-batch.md` and status lines). This PR changes other lines, and moves the world-builder plans to `plans/done/` as that plan's lifecycle asks | Agreed (no shared edit) |
| `generator/specs/world.md` | Branch `generator/world-spec` (stale, 15 Oct) | Azeem | Not touched here; the branch can be deleted | Agreed |

No open PRs (all of #35–#39 merged).

**Scanned at `103a526` on 2026-10-17.** Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ · hot files ✓.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S5-AC-01 (AC-05) | Over 100 Calverholme v Dunmarrow seeds, Calverholme has more possession, lower PPDA and more high regains; Dunmarrow has the larger counter-shot and set-piece-shot shares | `cli.py season --repeat 100 --report` | Pending implementation |
| S5-AC-02 (AC-06, revised with Azeem on 2026-10-17) | Calverholme v Dunmarrow is an elite side at home against a promoted one, so league-average totals are judged on the league seasons (S5-AC-03). Over the 100 seeds this fixture shows Calverholme 2.5–3.5 goals and Dunmarrow 0.3–1.2, and its passes, completion, fouls, cards and match length sit inside the league ranges | Same report | Pending implementation |
| S5-AC-03 | Over two league seasons (180 matches), every sourced row passes, including home / draw / away | `cli.py season --report` for seeds 1 and 2 | Pending implementation |
| S5-AC-04 | Across the league, goals ÷ xG lies within 0.95–1.05 | Report row | Pending implementation |
| S5-AC-05 (AC-03) | Every invariant holds for 100 seeds | `OVERLAP_SEEDS=100 pytest tests/test_invariants.py` | Pending implementation |
| S5-AC-06 | `--jobs 8` writes byte-identical match files to `--jobs 1` | `test_batch.py` | Pending implementation |
| S5-AC-07 | Full suite green, `ruff check` clean, xG anchor tests unchanged | `pytest`, `ruff` | Pending implementation |
| S5-AC-08 | Across the league, a club's top shooter takes 25–30 % of its shots on average (judgement: top strikers take about a quarter of their team's shots) | Smoke-check script | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| D-01 Size and shape of the home edge. Proposed: +3 to passing, finishing, tackling and composure at a full house, scaled by attendance, replacing today's +2 composure | Too big a home edge makes results predictable; too small leaves the split out of range | Azeem | Step 5 |
| D-02 Storyline demo pairing: `late_pressure_surge` with a home side that has room to press more (for example Wexmoor or Hollowford at home) instead of Calverholme | A clearer demo | Arnav | None |
| Fixing one target moves others (goals change shots, home edge changes possession) | Several loops | Azeem | None; `--jobs` keeps each loop short |
| No public source for the on-target or blocked share | Reported, not tuned to | Azeem | Step 4 only |
| Time | Misses 24 Oct | — | **Cut first:** storyline pairing, then pass completion, then the shot outcome mix. Goals ÷ xG and home advantage stay |

## 9. Handover

Branch `generator/engine-smoke`. Final numbers come from league seasons S1 and S2 (seeds 1 and 2, 180 matches)
and a 100-match Calverholme v Dunmarrow repeat run, all with the final code.

**Acceptance criteria:**
- **S5-AC-01 (AC-05):** met over 100 seeds. Possession 0.56 / 0.44, PPDA 14.8 / 29.6, high regains 43.8 / 21.1,
  counter share 0.08 / 0.14, set-piece share 0.16 / 0.18.
- **S5-AC-02 (revised):** met. Calverholme scores 3.30 a match (2.5–3.5) and Dunmarrow 0.38 (0.3–1.2). Passes 947,
  completion 82.3 %, fouls 10.7 a team, yellows 4.7 and length 101.4 min all sit inside the league ranges. As an
  elite-v-promoted fixture it runs above the league averages on goals (3.68), conversion (13.6 %) and on-target
  share (51 %), and below on shots from outside the box (25 %). That's expected, which is why the criterion was
  revised.
- **S5-AC-03:** met on the 180 league matches together. All 20 measured rows pass, with values in
  `CALIBRATION.md`: goals 2.77, shots 27.0, conversion 10.3 %, passes 921, completion 80.3 %, fouls 10.8,
  yellows 4.0, home / draw / away 45 / 23 / 32 %, length 100.0 min, on target 46.3 % of unblocked shots, outside
  the box 35.7 %, goals ÷ xG 0.97. Single seasons are noisier: S1 passed 19 of 20 (home / draw / away
  47 / 19 / 34 %) and S2 passed 17 of 20 (goals 2.69, conversion 9.9 %, goals ÷ xG 0.95, each just outside).
- **S5-AC-04:** met. Goals ÷ xG is 0.97 across the league and 1.04 for Calverholme v Dunmarrow.
- **S5-AC-05 (AC-03):** met. `OVERLAP_SEEDS=100 pytest tests/test_invariants.py` gives 7 passed in 52 min.
- **S5-AC-06:** met. `test_parallel_runs_write_the_same_files` passes; `.gz` files are compared by content because
  the gzip header records when the file was written.
- **S5-AC-07:** met. Full suite 114 passed, `ruff check` clean, xG anchors unchanged.
- **S5-AC-08:** not met. The top shooter takes 32 % of a club's shots on average (range 19–43 %; Calverholme 43 %),
  and the top scorer 47 % of its goals. Softening how much finishing raises shot weight helped some clubs. The rest
  comes from where strikers stand and how often passes find them, which needs pass-target selection reworked.
  Known limit, follow-up below.

**What changed, and why:**
- **Goals follow xG.** The goal chance divides by an average finisher's on-target chance in the same conditions.
  Finishing and goalkeeping are measured from references (73 and 79), at 0.06 per 10 points. That was 0.08 in code
  and 0.15 in the spec; 0.06 keeps an elite finisher about 10–20 % above xG.
- **Shot outcome mix.** On-target base rate raised from 0.28 to 0.43.
- **Shot choice.** The flat base weight for shooting from the final third was cut (central 10 → 2, wide 1 → 0.5).
  Shot appetite went to 33 (K 0.30), and shot weight follows `(finishing / 70) ^ 0.25`.
- **Passing.** Base success raised: short 0.97, long 0.78.
- **Home advantage.** +6 to passing, finishing, tackling and composure at a full house, substitutes included,
  replacing +2 composure. +3 left home wins at 38 %.
- **Cards.** Ordinary yellow 0.085, tactical yellow 0.38. The discipline spec had drifted from the code and is
  synced.
- **Lineups.** A slot with nobody available who plays it is filled out of position. Season 2 had crashed at
  matchweek 10 when Hollowford ran out of central midfielders.
- **Parallel runs.** `--jobs N` for batch runs. On this 4-core laptop it gives about a 3.4× speed-up for repeat
  runs; seasons are limited to 5 matches at a time.
- **Specs** (`actions.md`, `engine.md`, `live-and-batch.md`, `set-pieces-and-discipline.md`, `world.md`,
  `storylines.md`) match the code, and `CALIBRATION.md` has three new sourced rows plus the measured column.

**Follow-ups:**
- **Shot spread (S5-AC-08):** rework pass-target selection so strikers aren't found so often.
- **Bottom of the table:** in S1 Wexmoor took 4 points and Elverstone 8. Strengths run from 68 to 84 in a
  10-club league; real bottom sides take about 10–14 points from 18 matches. Consider narrowing the levels.
- **D-02:** storyline demo pairing for Arnav.
