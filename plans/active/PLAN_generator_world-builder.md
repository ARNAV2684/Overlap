# PLAN_generator_world-builder — world spec and builder, two reference clubs first

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Generator · world spec and world builder, starting with two reference clubs and their full squads |
| Author / primary owner | Azeem |
| Collaborators and responsibilities | None yet |
| Review coordinator | Arnav |
| Affected component owners | Arnav (review, hot files); Vedant (web app reads club names, colours, lineups from the match setup); stats engine, agents and archiver owners: unassigned (Arnav decides) |
| Proposal version and date | v0.1 · 2026-10-15 |
| Status | In progress (M1 done in PR #8; M2 done in PR #11; M3 part A merged in PR #37, part B in review in PR #38; see [`PLAN_generator_world-builder_S3.md`](PLAN_generator_world-builder_S3.md)) |
| Plan tier and file | Full · `plans/active/PLAN_generator_world-builder.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 71ad1ef (M2); main · 38a8038 (M1) |
| Architecture box / work area | Layer 1 · synthetic generator (world builder) |
| Relevant issue, spec PR, or discussion | Depends on [PR #7](https://github.com/ARNAV2684/Overlap/pull/7) (reference profiles rule), open, awaiting Arnav |

## 1. Purpose and intended outcome

- **Problem or need:** the match engine needs clubs and players to simulate, and every later layer needs believable
  names, kits, lineups and attributes. `generator/specs/world.md` is blank, so nothing can be built yet.
- **Proposed outcome:** an agreed world spec, then a world builder that produces two **reference clubs** (style and
  attributes hand-set to resemble two real teams with clearly different styles, invented names) with full squads,
  saved as one world file and able to emit a valid match setup (`CONTRACTS.md` §2) for a match between them. The rest
  of the league follows in a later milestone.
- **Benefit to viewers or teammates:** every layer gets an answer key. We know how the two reference clubs should
  play, so a wrong possession share, press metric, chart or commentary line stands out immediately.
- **Success statement:** running the world builder with a fixed seed writes the same world file every time, and its
  match setup for reference club A vs reference club B passes the contract check for §2.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code or placeholder files | main · 38a8038 · `generator/world.py`, `names.py`, `kits.py`, `tests/test_world.py` | Comment-only placeholders; nothing implemented |
| Governing component specifications | `generator/specs/world.md` · not started | Every question in §1–§7 unanswered |
| Shared contracts | `CONTRACTS.md` v0 §1.3 (IDs), §2 (match setup) | Team id = 3 capitals; player id = `TEAM-NN` (shirt); ratings 1–99; style 0–1; `attr` has exactly six keys; lineup is 11 with goalkeeper first; consumers reject unknown fields |
| Architecture diagram or meeting decision | Reference profiles discussed with Arnav, 2026-10-15; written record is PR #7 | Not yet agreed in writing: PR #7 is open |

**Differences between references:** the mock (`mock/overlap_mock/world.py`) invents six clubs with six-attribute
archetypes. It is temporary and not a reference for this design; the world builder does not import or replace it.
`world.md` §5 asks how to guarantee no name matches a real player; with reference profiles the question becomes "no
name is close to the real player it is modelled on", which the spec answers.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Fill in `generator/specs/world.md` (all seven sections), with reference profiles | Match engine, actions, movement (later generator specs) |
| Two hand-authored reference clubs, full squads (about 25 players each) | Clubs 3+ of the league (milestone M3, its own sprint plan) |
| World builder: load reference clubs, validate, assign ids and shirts, save the world file | Fatigue, form and injuries changing attributes during a season (spec answers §7 versioning only) |
| Kit colour rules and checks | Crests and any artwork |
| Match setup builder for any two clubs (`CONTRACTS.md` §2), lineup and bench picking | Live streaming, batch seasons, realism report |
| Tests: ranges, unique names and shirts, readable kits, same seed same world | Changing `CONTRACTS.md` |

- **Minimum complete result:** agreed spec + the two reference clubs saved as a world file + a valid match setup
  between them.
- **Optional extension:** a committed sample match setup for the two clubs in `fixtures/` (hot shared file, only after
  telling the owners).
- **Boundary with neighbouring components:** the world builder ends at the world file and the match setup. The engine
  (also Azeem) reads the full world file; every other layer only sees the match setup message.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Reference profiles rule (PR #7) | Arnav | Approval of the rule | Pending · blocks merging M1 | Draft the spec in parallel |
| Match setup shape (`CONTRACTS.md` §2) | Producer: Azeem · consumers: Vedant, stats/agents/archiver owners (unassigned) | Supplied unchanged | Agreed v0 · M2 | Not applicable |
| Real squads the reference clubs are modelled on | Azeem | Private roster and style notes, kept outside the repo | Pending · blocks M2 | Spec can be written without them |
| Engine needs from the world (extra attributes, style knobs) | Azeem (engine spec) | Internal attribute list the engine will read | Proposed in this spec · M1 | Engine spec adopts or amends it |

**My owned deliverables:** `world.md`, `world.py`, `names.py`, `kits.py`, reference club file, tests.  
**Shared deliverables:** none (no contract or hot-file change in the minimum result).

## 5. Proposed flow

```text
reference_clubs.yaml (hand-authored) ─┐
season seed ──────────────────────────┼─▶ world.py ─▶ data/generated/world/S1.json (full world, all attributes)
                                      │        │
                                      │        └─▶ build_setup(home, away, seed) ─▶ match setup (CONTRACTS §2)
private mapping (local, gitignored) ──┘ (only read by an optional name-distance test)
```

- **Input arrives through:** a hand-authored YAML file of reference clubs, plus a season seed.
- **Processing performed here:** validate every club and player against the spec's ranges, assign player ids, check
  names and kits, and save the world. Later (M3), generate the invented clubs from the seed.
- **Output goes to:** the world file (read by the engine) and match setups (sent by live mode to Event Hubs).
- **Execution relationship:** run once per season (or on demand from the CLI); match setups are built per match.
- **State retained:** the world file. It is reproducible from the YAML and the seed, so it is not committed.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Reference clubs | Two clubs with clearly different styles: A = possession and high press; B = contrasting style (mid-to-low block, direct, counters), chosen by Azeem | The contrast is what tests whether stats and agents notice style | One club only: cheaper, but nothing to contrast against | Proposed · B and its style confirmed by Azeem, 2026-10-15 |
| Where reference data lives | Hand-authored `generator/reference_clubs.yaml` (invented names, attributes, style) | Readable, reviewable in a PR, no code change to tweak a rating | Python constants: harder to review | Proposed |
| Real-to-invented mapping | Local `generator/reference_map.private.yaml`, gitignored, never committed | Keeps real names out of the public repo (PR #7 rule) | Shared doc outside the repo: fine too | Proposed |
| Attribute set | World holds a richer internal set (pace, acceleration, passing, vision, dribbling, finishing, tackling, positioning, aerial, stamina, composure, goalkeeping) plus preferred foot and weak-foot quality; the match setup keeps sending only the six contract attributes | Engine needs more detail; no contract change needed now | Extend `CONTRACTS.md` §2: needs every consumer to agree, not worth it yet | Proposed |
| Ratings | Hand-set 1–99 by judgement from public knowledge of each player; never copied from a game ratings database | Project rule | — | Agreed (PR #7 rule, pending merge) |
| Squad size | About 25 per club: 3 GK, 8–9 DEF, 7–8 MID, 5–6 FWD; reference clubs mirror their real squad shape | Enough for subs, rotation and injuries later | 18-man matchday squad only: no rotation | Proposed |
| Style | Contract `style` (press_intensity, directness, width) plus internal tempo, line_height, build_up_short (all 0–1) | Engine spec decides how they act | Contract only: too coarse to tell styles apart | Proposed |
| Kits | Primary/secondary hex; within a club, contrast ≥ 3:1 between primary and secondary; between two clubs in a match, colour difference ΔE2000 ≥ 20 on primaries, else the away club wears its secondary | One of the pair is always readable on dark or light; two clubs never look alike | Fixed palette: simpler, fewer colours | Proposed |
| Persistence | `data/generated/world/S1.json`, already gitignored; regenerated from YAML + seed | Reproducible, no generated file to merge | Commit the world file: easy to read, but a generated file to merge | Proposed |
| Tooling | Python 3.12, `uv`, `ruff`, `pytest`, `pyyaml`; own `generator/pyproject.toml` | Matches CONTRIBUTING's planned tooling and the mock's setup | — | Proposed |

**Assumptions:** the engine only needs the attributes listed above (checked when the engine spec is written);
Vedant's web app only reads the match setup, not the world file (checked with Vedant before M2 merges).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Match setup | Generator → stats, screen relay, archiver, web | `CONTRACTS.md` §2 | No | Not applicable (no change) |
| World file | World builder → engine (both generator) | `generator/specs/world.md` §7 (to be written) | New, internal to the generator | Azeem |

- The setup keeps exactly the six `attr` keys, the id formats in §1.3, 11-player lineups with the goalkeeper first,
  ratings 1–99 and style 0–1. Internal attributes never leave the generator.
- Invalid reference data (out-of-range rating, duplicate shirt or name, unreadable kit) fails the build with a message
  naming the club and player; nothing is saved.

**Shared contract edits required:** None.  
**Source of truth:** `CONTRACTS.md` §2 for the setup; `generator/specs/world.md` for the world file.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `generator/specs/world.md` | Modify (M1, M2) | M1: answer §1–§7, with reference profiles. M2: status set to agreed and wording kept in step with the code | Itself · agreed in PR #8 | Azeem / Arnav |
| `generator/reference_clubs.yaml` | Add (M2) | The two reference clubs: names, city, venue, kits, formation, style, squads, attributes | `world.md` §1–§4, §6 | Azeem |
| `generator/world.py` | Modify (M2) | Load, validate, assign ids, save world; build match setups | `world.md` §1–§4, §7 | Azeem |
| `generator/names.py` | Modify (M2) | Name uniqueness checks now; invented name pools in M3 | `world.md` §5 | Azeem |
| `generator/kits.py` | Modify (M2) | Contrast and colour-difference checks; clash rule | `world.md` §6 | Azeem |
| `generator/tests/test_world.py` | Modify (M2) | Ranges, uniqueness, kits, same seed same world, setup shape | `world.md` | Azeem |
| `generator/pyproject.toml` | Add (M2) | Python 3.12 project, `pyyaml`, dev `pytest`, `ruff` | CONTRIBUTING planned tooling | Azeem |
| `generator/.gitignore` | Add (M2) | Ignore `reference_map.private.yaml`, `.venv/`, `uv.lock` (as the mock does) | — | Azeem |
| `plans/active/PLAN_generator_world-builder.md` | Add | This plan | — | Azeem |
| `mock/overlap_mock/contracts.py` | Use unchanged | Run `validate_setup` by hand on our setup as a one-off check (no import from generator code) | `CONTRACTS.md` §2 | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Rating outside 1–99 or missing attribute | Build fails, names club and player | Fix the YAML | None; nothing saved | Test with a bad fixture |
| Duplicate name or shirt in a club | Build fails | Fix the YAML | None | Test |
| Kit pair below contrast, or two clubs too alike | Build fails (club pair) or away club switches to secondary (match) | Adjust colours | Readable kits on screen | Test |
| Not enough fit players for a formation | Setup build fails, names the missing position | Fix the squad | None | Test |
| Private mapping file absent | Name-distance test is skipped, with a message | — | None | Run without the file |

## 10. Requirements specific to this work

- **Performance and load:** not applicable — runs once per season, small data.
- **Observability:** build prints a one-line summary per club (players, positions, average rating).
- **Azure resources and access:** not applicable — local only.
- **Cost:** not applicable — no cloud resources.
- **Security and data:** no secrets. The private mapping never leaves the author's machine (gitignored).
- **AI behavior:** not applicable — no model calls.
- **Frontend experience:** not applicable — kits are checked for readability on dark and light backgrounds.
- **Synthetic data or calculations:** same seed gives the same world; ratings hand-set, never copied from a game
  ratings database; no real names, crests or venues; no match-level real data.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | `world.md` answers every question in §1–§7 and is merged after Arnav's review | PR review | PR #7 merged | Spec PR link |
| AC-02 | Given the reference YAML and seed 1, the builder writes the world file, and a second run produces a byte-identical file | `pytest` | `reference_clubs.yaml` | Test output |
| AC-03 | Every rating is 1–99, style 0–1, names and shirts unique per club, ids match `TEAM-NN` | `pytest` | — | Test output |
| AC-04 | Both clubs' kits pass the contrast rule, and the two clubs pass the clash rule | `pytest` | — | Test output |
| AC-05 | A match setup for club A vs club B passes `validate_setup` from the mock (real check against `CONTRACTS.md` §2 shapes; mock only used as a validator) | One-off run from `mock/` | Mock validator | Command output |
| AC-06 | With the private mapping present, no invented name is within edit distance 3 of the real name it is modelled on | `pytest` (skipped without the file) | Local private file | Test output on Azeem's machine |

**Validation limits:** whether the reference clubs *play* like their real teams can only be checked once the engine
exists; AC-05 checks shape, not behaviour.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — World spec agreed | `world.md` filled in, PR open and reviewed | Azeem | PR #7 | AC-01 | 15–16 Oct |
| M2 — Two reference clubs built | World file and A-vs-B match setup from the CLI-less builder, tests green | Azeem | M1 merged; private rosters | AC-02 to AC-06 | 17 Oct |
| M3 — Rest of the league | Invented clubs from name pools and seed (own sprint plan) | Azeem | M2 merged; engine tested on A vs B | Sprint plan ACs | After 20 Oct, by 24 Oct |

- **Project calendar check:** M1–M2 fit before the 20 Oct "one full match end to end" target, but that target also
  needs the engine, actions, set pieces and movement specs and code, all owned by Azeem. The world must stay small so
  the engine gets the time. M3 is not needed for 20 Oct.
- **First integration checkpoint:** AC-05, the A-vs-B setup against the contract shapes (validator from the mock,
  real data).
- **Parallel work:** the engine spec can be drafted during M1 review.
- **Dependency-bound work:** M2 waits for M1 to merge and for the private rosters.
- **Scope reduction if time runs short:** drop the internal extra attributes to the contract's six; drop weak-foot and
  composure; keep the two clubs and the setup.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** M1 on `generator/world-spec` (spec + this plan only); M2 on
  `generator/world-builder`; M3 on its own branch.
- **Shared-file coordination:** none in the minimum result. If the optional `fixtures/` sample is added, tell Arnav
  and the setup's consumers first, in its own commit.
- **Conflict scan result:** No overlaps found on 2026-10-15 at 38a8038.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `generator/README.md` (not in this file map) | PR #7 · `docs/reference-profiles` | Azeem | No overlap: this plan does not touch it | — |

  Sources checked: plans ✓ (`PLAN_mock_live-feed`, `PLAN_mock_single-match-demo` touch only `mock/`;
  `PLAN_docs_reference-profiles` touches docs, the skill and `generator/README.md`) · PRs ✓ (#7 only) · branches ✓
  (`mock/live-viewer` touches only `mock/`; `docs/reference-profiles` as above; the rest merged) · hot files ✓ (none
  touched).
- **Integration procedure:** `cd generator && uv sync && uv run pytest`; then build the A-vs-B setup and run the mock's
  `validate_setup` on it.
- **Configuration or setup changes:** none; the private mapping file is optional and local.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** `generator/specs/world.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | PR #7 not approved | Reference profiles not allowed | Arnav | Fall back to two invented clubs with the same contrasting styles | M1 merge |
| R-02 | Reference club B's proposed style values may not match how its real team plays now | A wrong answer key for B | Azeem | Resolved: Azeem confirmed the §4 values on 2026-10-15 | None |
| R-03 | A reference name or kit too close to the real one | Public IP problem in the demo | Azeem, reviewed by Arnav | AC-06 plus review in the M2 PR | M2 |
| R-04 | Engine time squeezed by world work | 20 Oct target missed | Azeem | Keep M2 to one day; scope cuts in §12 | 20 Oct target |

**Decisions requested from Arnav or affected owners:**

1. Approve PR #7 (reference profiles). Recommendation: approve; it gives every layer an answer key.
2. Agree the world file stays internal to the generator, with no change to `CONTRACTS.md` §2.

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
| Arnav, Vedant, Pranav | v0.1 | Spec and plan approved (reported by Azeem) | Agreed for stated scope | 2026-10-14 · PR #8 merged |

**Implementation readiness:** M1 done; M2 implemented (go from Azeem after PR #8 merged).  
**Relevant specification agreement:** PR #8, merged 2026-10-14.  
**Next action and owner:** M2 PR reviewed · Azeem. Then M3 (rest of the league) gets its own sprint plan.

### Handover after implementation

M2 (two reference clubs). M3 is not started.

- Implementation PR and commit: branch `generator/world-builder`; PR to follow.
- Acceptance results:
  - **AC-01:** passed — spec merged in PR #8.
  - **AC-02:** passed — `test_same_seed_gives_byte_identical_world`.
  - **AC-03:** passed — `test_ratings_style_and_ids`, `test_squad_shape`, `test_names_unique`.
  - **AC-04:** passed — `test_kits_readable_and_distinct`; home light blue/navy 6.8:1, amber/black 8.8:1; the two
    home primaries are ΔE2000 46.5 apart.
  - **AC-05:** passed — both A-vs-B and B-vs-A setups pass `validate_setup` from `mock/overlap_mock/contracts.py`
    (run by hand from the repo root; the generator does not import the mock).
  - **AC-06:** passed on Azeem's machine with the private mapping present; skipped in CI, where the file doesn't exist.
  - Also checked: 26 tests pass (`pytest`), including broken-data cases and the CIEDE2000 reference value; `ruff
    0.17.0` clean on every changed `.py` file. Strength: A 83.9, B 72.3.
- Setup and integration instructions: `cd generator && uv sync && uv run pytest`; `python world.py` writes
  `data/generated/world/S1.json` and prints a summary per club. `world.build_setup(home, away, ...)` returns a match
  setup.
- Differences from the agreed proposal: `world.py` can be run directly to save the world (the CLI comes with
  `cli.py` later). `world.md` was added to the M2 file map (agreed with Azeem) to set its status to agreed and keep
  it in step with the code: setup `pos` is the slot played, bench fill rule, `overall` is a plain mean, outfield
  goalkeeping ≤ 20 and two-player slot cover are now build rules, the name denylist is marked M3. Squad data gained
  secondary positions so every formation slot has a backup.
- Known limitations and follow-up owner: feet are partly estimates (Azeem to confirm); no invented clubs yet (M3,
  Azeem); behaviour on the pitch can only be checked once the engine exists.
