# PLAN_generator_world-builder_S3 — new identities for the reference clubs, then the rest of the league

| Field | Complete this |
|---|---|
| Sprint | S3 — two reference clubs that no longer look like real teams, plus 8 generated clubs for a 10-club league |
| Parent plan | [`PLAN_generator_world-builder.md`](PLAN_generator_world-builder.md) · v0.1 |
| Milestone in parent plan | M3 — rest of the league ("Sprint plan ACs"); also answers risk R-03 again, after Arnav's review flag |
| Author / owner | Azeem |
| Status | In progress (Part A in PR #37; Part B on `generator/world-builder-s3`; go from Azeem on 2026-10-17) |
| Reviewed branch and commit | main · 8fa24d4 |
| Planned branch | Part A `generator/reference-rotation`; Part B `generator/world-builder-s3` |

## 1. Outcome

- **What will work at the end of this sprint:**
  - **Part A:** the two reference clubs keep their style, formation and ratings (the answer key), but their names,
    ids, cities, venues, colours, shirt numbers, player name origins and feet no longer point at any real team.
  - **Part B:** `world.py` builds a 10-club world from the season seed: the 2 reference clubs plus 8 league clubs,
    each a hand-authored template modelled on a real club at club level, with players generated inside it (D-01).
    `cli.py season` then plays a full 90-match double round robin.
- **Why Part A comes first:** Arnav flagged that the reference clubs could be recognised as real teams. The giveaways
  are the colours, style, shirt numbers, player nationalities and feet taken from real profiles. This breaks the
  synthetic-data and no-real-IP rules, and Premier League judges could spot it.
- **Not in this sprint:**
  - The 100-match smoke check across the league (engine M5).
  - Tuning the engine for generated clubs.
  - Venue climate and capacity.
  - Loading seasons into Cosmos (`season` container, owner unassigned, Arnav decides).
  - Changing the rule text in `CONTRIBUTING.md` and `.claude/skills/` (D-04).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| `world.md` agreed | PR #8, #11, #14 | Yes |
| Engine and storyline PRs merged; they touch the same tests, `cli.py`, `batch.py` and `realism_report.py` that the rename touches | PR #35, PR #36 (Azeem), reviewer Arnav | No. Part A can stack on #36 and merge after it. Part B branches from `main` after Part A |
| Decisions D-01 to D-03 | Azeem, Arnav | No. They block steps A1 and B1 |
| A public source for the share of left-footed and two-footed professional players | `CALIBRATION.md` | No. To find in step A2; until then, the feet split is an Assumption |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `generator/specs/world.md` | Modify | **A:** reference clubs drop the real-team echoes. Colours no longer echo (§6). Shirts follow the generated rule (§2). Names and feet are drawn like generated players' (§3, §5). **B:** style archetypes for generated clubs (§4); city, venue and club-name pools (§1, §5) | itself |
| `generator/reference_clubs.yaml` | Modify | **A:** new club names, ids, cities, venues, colours, shirts, player names and feet, plus `default_xi` and `set_pieces` renumbered. Style, formation, ratings and roles are unchanged. `world_version` 2 → 3 | `world.md` §1–§6 |
| `generator/names.py` | Modify | **A:** regional first-name and surname pools, and a seeded draw. **B:** the denylist check against `name_denylist.private.txt` when present; four surnames swapped so the pools can't produce a listed name | `world.md` §5 |
| `generator/league_clubs.yaml` | Add | **B:** the 8 templates: invented name, id, city, venue and colours, and the formation, style, level and squad shape modelled on a real club | `world.md` §1–§6 |
| `generator/world.py` | Modify | **A:** the shirt rule (`assign_shirts`) and the feet draw (`draw_feet`), shared with generated clubs. **B:** `generate_club(template, seed)` draws a 25-player squad in the template's shape (ratings from position archetypes and role bonuses, shifted so the XI lands on the level), with feet, names, shirts, default XI and set-piece takers. `load_league` and `build_world` add the 8 to the reference clubs; the denylist check runs in `validate_clubs` | `world.md` §1–§4 |
| `generator/cli.py`, `generator/batch.py`, `generator/engine.py`, `generator/realism_report.py` | Modify | **A:** the new ids replace `SKH` / `AMH` in defaults and in the answer-key labels. **B:** `cli.py world` lists the league | `live-and-batch.md` §2–§4 |
| `generator/storylines/star_night.yaml` | Modify | **A:** the new club id and the striker's new shirt | `storylines.md` §3 |
| `generator/specs/storylines.md`, `generator/specs/live-and-batch.md` | Modify | **A:** the new ids in examples; nothing else | themselves |
| `generator/tests/test_world.py` | Modify | **A:** the rotation checks. **B:** league checks | `world.md` |
| `generator/tests/test_engine.py`, `test_discipline.py`, `test_invariants.py`, `test_live.py`, `test_seed.py`, `test_batch.py`, `test_storylines.py` | Modify | **A:** the new ids and shirts. **B:** one match between two generated clubs passes the invariants | `engine.md` |
| `CALIBRATION.md` | Modify | **A:** one new row, the share of left-footed and two-footed players with a public source | — |
| `plans/active/PLAN_generator_world-builder.md`, this plan | Modify / add | Status lines and handover | — |

Local only, never committed: `generator/reference_map.private.yaml` (new names against the real names, for the
edit-distance test) and `generator/name_denylist.private.txt`. Both are already covered by `generator/.gitignore`.

## 4. Steps

**Part A — rotation (target 19 Oct, so the 20 Oct end-to-end match uses the new identities)**
1. **A1 — spec.** Settle D-01 to D-03, then write the `world.md` changes:
   - Reference clubs get colours with no link to the real team.
   - Their shirts follow the generated rule.
   - Their names and feet are drawn the same way as generated players'.
2. **A2 — pools and feet.** Add the name pools to `names.py`. Find a source for the foot split and add it to
   `CALIBRATION.md`. The draw uses that split: left, right, both and `weak_foot`.
3. **A3 — new identities.**
   - Draw each club's names from a mix of regions, and feet from the same split (fixed seed, recorded here).
   - Give each club a new name, city, venue and colours, reviewed by hand. Renumber shirts by the rule.
   - Write it all into `reference_clubs.yaml` with `world_version` 3, and update the local private map.
4. **A4 — rename everywhere else.** Replace the old ids across `generator/`. Leave `plans/done/` alone (history).
5. **A5 — check the answer key still holds.** Run the full suite and the 12-match repeat report.
   - Only the feet change in a way the engine can feel, through weak-foot xG.
   - Expect 16 of 16 targets as on #35; record any difference.

**Part B — the generated clubs (target 24 Oct)**

6. **B1 — spec.** League clubs are templates modelled on real clubs at club level (D-01, option 1). Write that
   into `world.md` §1–§7: what a template holds, how players are drawn inside it, default XI and takers, and that
   colours never echo the real club.
7. **B2 — templates.** Write the 8 in `league_clubs.yaml`, with levels spread over 68–80 and varied formations
   (4-3-3 ×2, 4-1-4-1, 4-2-3-1 ×2, 4-4-2, 5-3-2, 3-4-3). Record each template's real club in the private file.
8. **B3 — generate squads.** Build `generate_club` and `load_league`:
   - ratings drawn around per-position archetype means, plus role bonuses, with standard deviation 6;
   - first-choice players are drawn 4 points above the rest, then the squad is shifted so the XI lands on the level;
   - secondary positions next to the primary; shirts, feet and names by the shared rules;
   - every existing build rule still applies, plus the denylist check.
9. **B4 — play the league.**
   - `cli.py world` lists the 10 clubs.
   - One generated-v-generated match runs through the invariants test (in CI).
   - One full season runs with `cli.py season` (by hand, results recorded here).
   - The mock validator checks the setup's shape only; the real consumers (relay, archiver) are not exercised in
     this sprint.

## 5. Contracts and shared files

- **Contract changes:** none. The match setup (`CONTRACTS.md` §2) keeps its shape; only values change (names, ids,
  colours). There are no fixtures for these clubs, and no other layer's code uses `SKH` or `AMH` (checked on `main`).
- **Hot shared files touched:** none. The rule text that allows kit colours to echo a real team lives in
  `CONTRIBUTING.md` and `.claude/skills/` (Arnav, Pranav). This plan doesn't change it; see D-04.

## 6. Conflict scan

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| Tests, `cli.py`, `batch.py`, `engine.py`, `realism_report.py`, `storylines/` | PR #35, PR #36 | Azeem | Order: Part A stacks on #36 and merges after both | Agreed (same owner) |
| `generator/specs/world.md` | Branch `generator/world-spec` (1 commit, 15 Oct) | Azeem | Stale: its formation change was restored on `main` in PR #14. No action; the branch can be deleted | Agreed (same owner) |
| `world.md` spec gate | `PLAN_ci_pr-checks.md` row "told before M3" | Arnav | `world.md` stays `agreed` and is edited in the same PR as the code, which is what the gate expects | Pending (tell Arnav) |
| `generator/specs/live-and-batch.md` | `PLAN_contracts_setup-transport.md` (Arnav) and `PLAN_plans_housekeeping.md` (Arnav), from #37's scope report | Arnav | Neither edits the line this PR changes (the `play` example's ids). Housekeeping's link edit merged in PR #26. Setup-transport leaves Azeem a follow-up: update the §1 note now that `CONTRACTS.md` §1.4 has merged. That edit is not in this PR | Agreed (no shared edit) |
| `test_invariants.py`, `cli.py`, `world.py`, `names.py`, `reference_clubs.yaml`, `world.md`, `test_world.py` | `PLAN_generator_match-engine.md`, `PLAN_generator_storylines.md`, `PLAN_generator_world-builder.md` (all Azeem), from #38's scope report | Azeem | Same owner. The engine and storyline work these plans list merged in #35 and #36 before this PR; the world-builder plan is this sprint's parent | Agreed (same owner) |
| `PLAN_web_live-match-viewer.md` | Reads club names and colours from the setup | Vedant | Values change, the shape doesn't. Tell Vedant that the demo clubs change | Pending (tell Vedant) |

**Scanned at `8fa24d4` on 2026-10-17.** Sources checked: plans ✓ · PRs ✓ (#35, #36 open) · branches ✓ · hot files ✓.
There are no unresolved overlaps on files this plan must change.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S3-AC-01 | The reference clubs carry no real-team echo: new names, ids, cities, venues and colours; shirts by the generated rule; names and feet from the draw | `test_world.py` (shirts, pool names, feet as drawn); Arnav's review of the Part A PR | Pending implementation |
| S3-AC-02 | With the private map present, no reference name is within edit distance 3 of the real name it is modelled on | `test_world.py` (skipped without the file) | Pending implementation |
| S3-AC-03 | After the rotation, the 12-match repeat report gives the same pass count as #35, and every answer-key direction holds | `cli.py season --repeat 12 --report` | Pending implementation |
| S3-AC-04 | Seed 1 builds 10 clubs (2 reference + 8 league), and a second run writes a byte-identical world file | `pytest` | Pending implementation |
| S3-AC-05 | Every generated club passes every existing build rule: ranges, squad shape, slot cover, takers, outfield goalkeeping ≤ 20, unique names and ids, kit contrast and clash | `pytest` | Pending implementation |
| S3-AC-06 | Each league club follows its template (formation, style, shape, roles) and its strength lies within 1 of its level (68–80). The left-footed share across the league falls within the sourced range. With the private file present, no club's name, city or id is close to the real club it resembles | `pytest` | Pending implementation |
| S3-AC-07 | A generated-v-generated setup passes the mock's `validate_setup` (`CONTRACTS.md` §2 shapes) and plays through the invariants test | `pytest`; one-off run from `mock/` | Pending implementation |
| S3-AC-08 | `cli.py season` plays all 90 matches without errors; the realism report is recorded (its ranges are measured in engine M5, not judged here) | Run by hand | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| D-01 League make-up. **Azeem (2026-10-17):** the other 8 clubs are also modelled on real clubs, disguised the same way as the two references, because real squads come with proper balance. **Decided by Azeem: option 1**; Arnav still needs to agree in the Part B PR. Option 1, club level: each club copies a real club's style, formation, strength tier and squad shape (positions, roles, depth per slot), and the players are generated inside that shape. Option 2, player level: all 200 players are hand-rated like the references. Option 1 keeps the balance with no player to trace and takes about a day; option 2 takes several days, and every player is a recognition risk. Arnav's flag asked for generated clubs in the demo, so he needs to agree either way | Changes `world.md` §1, §3 and §5 and Part B's steps | Azeem, Arnav | B1 (not Part A) |
| D-02 Rename the clubs, not just the colours. **Agreed by Azeem (2026-10-17).** "Skyhaven" and "Amberholt" both point at their colours, and so at the real teams' nicknames | About 70 mentions of the ids change inside `generator/`; no other layer is affected | Azeem, Arnav | A1 |
| D-03 Keep each reference player's ratings. **Agreed by Azeem (2026-10-17)**, pending Arnav: keep them, because they are the answer key and the flag didn't name them. Without name, number, origin or feet, a rating line no longer singles out one person | If Arnav wants more, add ±3 noise per rating and re-run S3-AC-03 | Arnav | A3 |
| D-04 The rule "kit colours may echo the real team's" stays in `CONTRIBUTING.md` and the planning skill | It conflicts with the flag; it's a hot file outside this plan | Arnav, Pranav | None |
| D-05 Storylines' demo pairing (open on #36) moves to generated clubs | A generated pressing-room side shows the surge more clearly than the current near-1.0 press | Arnav | None |
| The engine was tuned on the two reference clubs only, so generated matches may land outside the calibration ranges | A weak demo season | Azeem, measured in engine M5 | None |
| Time | Part B misses 24 Oct | — | **Cut first:** the denylist check, then role bonuses, then `cli.py world` output. Part A is never cut |

## 9. Handover

**Pending implementation.** Part A progress:
- The one-off draw used seed `reference-rotation-S3`; the script stays outside the repository. Both clubs' home
  regions came out as one region each (A Italian, B Nordic).
- Three drawn names collided with well-known real people from other sports, so their first names were changed by hand.
- **S3-AC-01:** met. New names, ids, cities, venues and colours. `test_reference_shirts_follow_the_rule`,
  `test_reference_names_come_from_the_pools` and `test_the_foot_split_matches_calibration` pass (league squads come
  out 20–27 % left-footed, CAL 20 %, DTN 31 %). Arnav's review is still pending.
- **S3-AC-02:** met on Azeem's machine. The private map was re-keyed to the new ids and shirts, and
  `test_reference_names_not_recognisable` passes.
- **S3-AC-03:** not met on the 12-match report: 13 of 16 targets pass (#35 had 16). The misses sit just outside their
  ranges: goals 2.42 (2.7–3.3), conversion 9.6 % (10–12) and passes 950.08 (820–950). Every answer-key direction still
  holds: possession 0.56 / 0.44, PPDA 14.3 / 40.9, high regains 56.3 / 20.5, shots 18.8 / 6.3, counter share
  0.13 / 0.22, set-piece share 0.16 / 0.18.
  On #35's second sample (seeds 1–32) the totals match #35 almost exactly, so the 12-match drop is sample noise:

  | Seeds 1–32 | #35 | After the rotation |
  |---|---|---|
  | Goals | 2.5 | 2.5 |
  | Shots (CAL / DTN) | 24.2 (18.2 / 6.1) | 24.8 (19.1 / 5.8) |
  | Passes | 940 | 938 |

  The largest single feet change is CAL's playmaker, who went from two-footed to weak foot 2.
- Full suite: 101 passed. `ruff check` is clean.
- **Part B** (branch `generator/world-builder-s3`, stacked on PR #37):
  - **S3-AC-04:** met. Seed 1 builds 10 clubs, and `test_same_seed_gives_byte_identical_world` passes.
  - **S3-AC-05:** met. All 8 league clubs pass every build rule, plus the denylist check on Azeem's machine.
  - **S3-AC-06:** met. Each club follows its template (`test_league_clubs_follow_their_templates`). Strengths land
    within 0.4 of their levels: 79.6, 78.2, 76.7, 75.3, 73.9, 72.4, 70.0 and 68.2. The league is 23.5 % left-footed.
    `test_league_clubs_not_recognisable` passes with the private file.
  - **S3-AC-07:** met. KES v WEX, HLW v ORR and ASH v CAL setups pass the mock's `validate_setup`, and a KES v WEX
    match runs through every invariant test.
  - **S3-AC-08:** met. `cli.py season --report` played all 90 matches without errors. Final table top four: THW 36,
    KES 36, ORR 35, CAL 31.
  - **Realism report:** 13 of 17 targets pass. Misses, for engine M5: goals 1.79 (2.7–3.3), conversion 6.5 %
    (10–12), pass completion 77.0 % (79–84) and home / draw / away 29 / 31 / 40 % (42–49 / 22–28 / 28–33).
  - **Diagnosis:** goals are equally low with or without a reference club (1.79 in both groups), so the main cause
    is the engine, tuned on one lopsided fixture, not the generated squads. Some league keepers rate well above
    their attackers' finishing (ELV 85 against 62.8), which M5 should watch.
  - Full suite: 112 passed. `ruff check` is clean.
- An earlier, narrower draft of the rotation (kept names, ids and feet) sits on the local branch
  `generator/reference-rotation-draft`. It was never pushed, and this plan replaces it.
