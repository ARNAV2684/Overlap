# PLAN_generator_world-traits — pressing and transition style, player roles, set-piece takers

| Field | Complete this |
|---|---|
| Change | Add four team style traits (`counter_press`, `press_height`, `counter_attack`, `set_piece_focus`), a role for every player, and set-piece takers per club to the world spec, the reference clubs, the builder and its tests. Also restore the spec rows lost when PR #8 merged before its last commit |
| Why | Before the engine (G2) is specced, the world has to hold what the engine will read. These traits give the two reference clubs clearly different, measurable behaviour (pressing, transitions, set pieces, who does what), which is what makes them an answer key for the stats engine and the agents |
| Author / owner | Azeem |
| Status | Done (merged in PR #14) |
| Reviewed commit | main · 75b7cba |
| Branch | `generator/world-traits` |
| Governing spec | `generator/specs/world.md` (agreed in PR #8). This plan changes the spec and the code together, so they stay in step |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `generator/specs/world.md` | Modify | §1: club A 4-2-3-1 and club B 5-4-1 (restoring commit f9772b7, which never reached `main`), new `roles` and `set_pieces` fields. §2: set-piece takers. §3: player roles. §4: four new style traits, their values for both clubs, and the decisions each one touches; `5-4-1` in the formation list. §6: light primary needs a dark secondary (also from f9772b7) |
| `generator/reference_clubs.yaml` | Modify | Four new style values per club, a `role` for all 51 players, `set_pieces` per club |
| `generator/world.py` | Modify | `STYLE_KEYS` grows to ten (the setup still sends three); `ROLES` catalogue and checks; `set_pieces` checks; both saved in the world file |
| `generator/tests/test_world.py` | Modify | Tests for roles, takers and the new style keys, including broken-data cases |
| `plans/active/PLAN_generator_world-builder.md` | Modify | Status line only: M1 and M2 done, M3 not started (it still says M2 is in progress) |
| `plans/active/PLAN_generator_world-traits.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. The match setup keeps exactly `press_intensity`, `directness` and
  `width` and the six attributes; roles, takers and the new traits stay inside the generator.

## Proposed: new style traits (all 0–1)

| Trait | 0 means | 1 means | Engine decisions it touches (confirmed in `engine.md` / `actions.md`) | How the stats engine sees it | Skyhaven | Amberholt |
|---|---|---|---|---|---|---|
| `counter_press` | Drops back after losing the ball | Swarms the ball straight away | Pressure and tackle attempts in the seconds after a turnover | Regains within 5 s of a loss; high regains | 0.90 | 0.30 |
| `press_height` | Low block: presses only in its own third | High press: presses the goalkeeper and centre-backs | Where pressing starts out of possession (separate from `line_height`, which is where the back line sits) | Press height, PPDA, pressing zones | 0.85 | 0.35 |
| `counter_attack` | Recycles after a regain | Goes forward fast and direct after a regain | Pass choice and speed in the first actions after a regain | Share of shots with `situation: counter` | 0.45 | 0.80 |
| `set_piece_focus` | Plays corners and free kicks short and safe | Targets them: crosses to the best headers, rehearsed routines | Delivery choice and target at corners and wide free kicks | Share of xG from set pieces | 0.35 | 0.75 |

## Proposed: player roles

One role per player, valid for the player's primary position. Ratings say how good a player is; the role says what
they do (for example, a poacher rarely drops deep, an inverted winger cuts inside onto his stronger foot). The engine
spec decides the exact effect of each role.

| Role | Allowed primary positions | Meaning |
|---|---|---|
| `sweeper_keeper` | GK | Plays high, sweeps behind the line, joins build-up |
| `shot_stopper` | GK | Stays on the line, kicks long more often |
| `ball_playing_cb` | CB | Carries and passes forward from the back |
| `stopper` | CB | Steps out to win the ball, clears rather than plays |
| `overlapping_fullback` | LB, RB | Runs outside the winger and crosses |
| `inverted_fullback` | LB, RB | Steps into midfield in possession |
| `wing_back` | LWB, RWB, LB, RB | Provides all the width on his side, crosses |
| `anchor` | DM | Holds position in front of the defence |
| `deep_playmaker` | DM, CM | Sets the tempo from deep, long and progressive passes |
| `ball_winner` | DM, CM | Presses and tackles, gives simple passes |
| `box_to_box` | CM, DM | Covers ground, arrives late in the box |
| `playmaker` | CM, AM | Creates chances: through balls, key passes |
| `inverted_winger` | LW, RW, LM, RM | Cuts inside onto his stronger foot to shoot or combine |
| `wide_winger` | LW, RW, LM, RM | Stays wide, beats his man on the outside, crosses |
| `wide_midfielder` | LM, RM | Works up and down the flank, tracks back |
| `poacher` | ST | Lives in the box, few touches, many shots |
| `target_man` | ST | Wins headers and holds the ball up for others |
| `pressing_forward` | ST | Leads the press, runs in behind |

**Skyhaven:** Dalvenuto `sweeper_keeper` · Mourelo, Nogueira, Ashdown `ball_playing_cb` · Adebanjo, Rahimov
`stopper` · Lameira, Halloran, Denholm `inverted_fullback` · Haddouche, Šimunić `overlapping_fullback` · Echagüe `deep_playmaker` · Whitford `box_to_box` · Benchikh `anchor` · Brkljača, Belkadi,
Ibarrola `playmaker` · Ampofo-Reid, Prescott, Kabongo, Lucena, Okwuosa `inverted_winger` · Ndour `wide_winger` · Holt
`poacher` · Arrieta `shot_stopper`.

**Amberholt:** Kalogirou, Hadley `shot_stopper` · Ogundipe, Muldoon, Tendeng, Wexford, Mullan `stopper` · Hartshorn,
Leadbetter `wing_back` · Lindsay-Grant, Fairclough `overlapping_fullback` · Ishiwata `deep_playmaker` · Kouadio-Brun,
Onwuachi `ball_winner` · Pemberton, Haverstock, Fjellheim `box_to_box` · Ainscough, Petridis `playmaker` · Kettering,
Bouzid, Ouattara-Lenoir `inverted_winger` · Ashby-Lowe `wide_winger` · Coulton `wide_midfielder` · Tarbet
`target_man` · Mabika `pressing_forward`.

## Proposed: set-piece takers

Ordered shirt lists per club; the first available player on the pitch takes it. Each list has at least two players.

| Club | Penalties | Corners | Direct free kicks |
|---|---|---|---|
| Skyhaven | Holt, Prescott | Belkadi, Prescott | Belkadi, Prescott |
| Amberholt | Tarbet, Bouzid | Ashby-Lowe, Leadbetter | Ashby-Lowe, Bouzid |

## Checks the build adds

- Style has exactly the ten keys, all 0–1.
- Every player has a role from the catalogue that is allowed for their primary position.
- `set_pieces` has exactly `penalties`, `corners` and `free_kicks`; each lists 2 or more different shirts from the
  squad; no goalkeeper takes corners.

- **Conflict scan:** No overlaps found on 2026-10-16 at 75b7cba. Sources checked: plans ✓ (other active plans that
  name these files are finished generator plans or CI/registry plans that only refer to them) · PRs ✓ (none open) ·
  branches ✓ (`generator/world-spec` holds only f9772b7, which this plan restores into `world.md`; no other branch
  touches `generator/`) · hot files ✓ (none).
- **Done when:** spec and code agree on every new field; `pytest` passes, with new tests for each check above;
  `ruff` clean; the A-vs-B match setup still passes the mock's `validate_setup` unchanged; CI green.
- **Not in this plan:** how the engine uses these traits (G2 specs), and the expected A-vs-B signature that defines
  "checks out" (storylines answer key, G4).
- **Risk:** roles that the engine spec later finds it can't use. Fallback: the engine ignores a role until it has a
  rule for it; the catalogue stays.
- **Handover:**
  - **Checked:** `pytest` 38 passed (12 new: style traits, trait contrast, roles, takers, and 8 broken-data cases),
    none skipped; `ruff 0.17.0` clean; both A-vs-B setups pass the mock's `validate_setup`, still with only the three
    contract style keys; no real names in any changed file. Strength unchanged (A 83.9, B 72.3).
  - **Also done:** `world_version` bumped to 2, as `world.md` §7 requires for any change to the YAML (the feet change
    in PR #12 should have bumped it too).
  - **Not checked:** how the engine uses roles and the new traits; that is G2.
