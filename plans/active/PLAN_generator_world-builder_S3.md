# PLAN_generator_world-builder_S3 — new identities for the reference clubs, then the rest of the league

| Field | Complete this |
|---|---|
| Sprint | S3 — two reference clubs that no longer look like real teams, plus 8 generated clubs for a 10-club league |
| Parent plan | [`PLAN_generator_world-builder.md`](PLAN_generator_world-builder.md) · v0.1 |
| Milestone in parent plan | M3 — rest of the league ("Sprint plan ACs"); also answers risk R-03 again, after Arnav's review flag |
| Author / owner | Azeem |
| Status | In progress (Part A; go from Azeem on 2026-10-17) |
| Reviewed branch and commit | main · 8fa24d4 |
| Planned branch | Part A `generator/reference-rotation`; Part B `generator/world-builder-s3` |

## 1. Outcome

- **What will work at the end of this sprint:**
  - **Part A:** the two reference clubs keep their style, formation and ratings (the answer key), but their names,
    ids, cities, venues, colours, shirt numbers, player name origins and feet no longer point at any real team.
  - **Part B:** `world.py` builds a 10-club world from the season seed: the 2 reference clubs plus 8 generated clubs.
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
| `generator/names.py` | Modify | **A:** regional first-name and surname pools, and a seeded draw. **B:** invented city, venue and club-suffix pools; the denylist check against `name_denylist.private.txt` when present | `world.md` §5 |
| `generator/kits.py` | Modify | **B:** generated colours spread round the colour wheel, using the existing contrast and clash checks | `world.md` §6 |
| `generator/world.py` | Modify | **A:** the shirt rule (`assign_shirts`) and the feet draw (`draw_feet`), shared with generated clubs. **B:** `generate_clubs(seed)` builds ids, formation, style, a 25-player squad, ratings, roles, feet, shirts, default XI and set-piece takers. `build_world` adds them to the reference clubs. Archetype means are kept in `world.py` | `world.md` §1–§4 |
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

6. **B1 — spec §4.** Define style archetypes, each the centre of the ten style traits:
   - possession, high press, direct, counter, balanced and low block;
   - a club gets ±0.08 jitter around its archetype, kept inside 0–1;
   - each archetype has its usual formations;
   - add the city, venue and club-name pools to §1 and §5.
7. **B2 — generate squads.** Build `generate_clubs(seed)`:
   - 8 clubs whose target levels are spread evenly over 68–80;
   - 25 players each (3 GK, 9 defenders, 8 midfielders, 5 forwards);
   - ratings drawn around archetype means with standard deviation 6, and roles taken from the allowed list;
   - shirts by the rule, plus a default XI and set-piece takers by the existing pickers.
   Every existing build rule applies unchanged.
8. **B3 — kits and names.** Colour-wheel primaries that pass the contrast and clash rules, with no duplicate names,
   plus the denylist check.
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
| `PLAN_web_live-match-viewer.md` | Reads club names and colours from the setup | Vedant | Values change, the shape doesn't. Tell Vedant that the demo clubs change | Pending (tell Vedant) |

**Scanned at `8fa24d4` on 2026-10-17.** Sources checked: plans ✓ · PRs ✓ (#35, #36 open) · branches ✓ · hot files ✓.
There are no unresolved overlaps on files this plan must change.

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S3-AC-01 | The reference clubs carry no real-team echo: new names, ids, cities, venues and colours; shirts by the generated rule; names and feet from the draw | `test_world.py` (shirts, pool names, feet as drawn); Arnav's review of the Part A PR | Pending implementation |
| S3-AC-02 | With the private map present, no reference name is within edit distance 3 of the real name it is modelled on | `test_world.py` (skipped without the file) | Pending implementation |
| S3-AC-03 | After the rotation, the 12-match repeat report gives the same pass count as #35, and every answer-key direction holds | `cli.py season --repeat 12 --report` | Pending implementation |
| S3-AC-04 | Seed 1 builds 10 clubs (2 reference + 8 generated), and a second run writes a byte-identical world file | `pytest` | Pending implementation |
| S3-AC-05 | Every generated club passes every existing build rule: ranges, squad shape, slot cover, takers, outfield goalkeeping ≤ 20, unique names and ids, kit contrast and clash | `pytest` | Pending implementation |
| S3-AC-06 | Generated strengths lie within 68–80 and use at least 4 different archetypes. The left-footed share across the league falls within the sourced range | `pytest` | Pending implementation |
| S3-AC-07 | A generated-v-generated setup passes the mock's `validate_setup` (`CONTRACTS.md` §2 shapes) and plays through the invariants test | `pytest`; one-off run from `mock/` | Pending implementation |
| S3-AC-08 | `cli.py season` plays all 90 matches without errors; the realism report is recorded (its ranges are measured in engine M5, not judged here) | Run by hand | Pending implementation |

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| D-01 League make-up. **Azeem (2026-10-17):** the other 8 clubs are also modelled on real clubs, disguised the same way as the two references, because real squads come with proper balance. **Open:** how far to model them. Option 1, club level: each club copies a real club's style, formation, strength tier and squad shape (positions, roles, depth per slot), and the players are generated inside that shape. Option 2, player level: all 200 players are hand-rated like the references. Option 1 keeps the balance with no player to trace and takes about a day; option 2 takes several days, and every player is a recognition risk. Arnav's flag asked for generated clubs in the demo, so he needs to agree either way | Changes `world.md` §1, §3 and §5 and Part B's steps | Azeem, Arnav | B1 (not Part A) |
| D-02 Rename the clubs, not just the colours. **Agreed by Azeem (2026-10-17).** "Skyhaven" and "Amberholt" both point at their colours, and so at the real teams' nicknames | About 70 mentions of the ids change inside `generator/`; no other layer is affected | Azeem, Arnav | A1 |
| D-03 Keep each reference player's ratings. **Agreed by Azeem (2026-10-17)**, pending Arnav: keep them, because they are the answer key and the flag didn't name them. Without name, number, origin or feet, a rating line no longer singles out one person | If Arnav wants more, add ±3 noise per rating and re-run S3-AC-03 | Arnav | A3 |
| D-04 The rule "kit colours may echo the real team's" stays in `CONTRIBUTING.md` and the planning skill | It conflicts with the flag; it's a hot file outside this plan | Arnav, Pranav | None |
| D-05 Storylines' demo pairing (open on #36) moves to generated clubs | A generated pressing-room side shows the surge more clearly than the current near-1.0 press | Arnav | None |
| The engine was tuned on the two reference clubs only, so generated matches may land outside the calibration ranges | A weak demo season | Azeem, measured in engine M5 | None |
| Time | Part B misses 24 Oct | — | **Cut first:** the denylist check, then archetypes down to 4, then `cli.py world` output. Part A is never cut |

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
- An earlier, narrower draft of the rotation (kept names, ids and feet) sits on the local branch
  `generator/reference-rotation-draft`. It was never pushed, and this plan replaces it.
