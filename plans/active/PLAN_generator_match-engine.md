# PLAN_generator_match-engine — G2 match engine (with G3 movement), Skyhaven vs Amberholt first

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Generator · match engine that plays Skyhaven vs Amberholt into contract-valid events and 5 Hz tracking |
| Author / primary owner | Azeem |
| Collaborators and responsibilities | None. The engine is built fresh (D1); `mock/` is only a reference for what consumers expect |
| Review coordinator | Arnav |
| Affected component owners | Consumers of events and tracking: stats engine, screen relay, archiver (all unassigned, Arnav decides); web app (Vedant). Arnav and Pranav (Event Hubs) |
| Proposal version and date | v0.2 · 2026-10-16 |
| Status | In progress (M1 merged in PR #15; M2 in PR #20; M4 on `generator/engine-discipline`; M3, M5 next) |
| Plan tier and file | Full · `plans/active/PLAN_generator_match-engine.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 75b7cba (PR #14, world traits, open and green) |
| Architecture box / work area | Layer 1 · synthetic generator: G2 match engine, and G3 movement model (decision D2) |
| Relevant issue, spec PR, or discussion | Registry deliverables G2, G3 (`plans/REGISTRY.md`); expanded DFD box 1 |
| Change note | v0.2: Azeem decided D1 (build fresh), D2 (movement in the same spec PR) and D4 (`generator/pitch.py`); added match conditions (weather, stadium) and a shot model as close to real football as public sources allow; added D9 (conditions in the match setup, separate contract PR) |

## 1. Purpose and intended outcome

- **Problem or need:** every later layer needs real generator output. Today only the uncalibrated mock produces
  matches. The 20 Oct target is one full match end to end, which needs a real engine.
- **Proposed outcome:** given the world file and a seed, the engine plays a full Skyhaven vs Amberholt match and
  returns the match setup, every event (`CONTRACTS.md` §3) and 5 Hz tracking frames (§4), with the clubs' styles,
  roles, takers, preferred feet, the stadium and the weather visibly shaping play, and goals following a realistic
  shot model.
- **Benefit to viewers or teammates:** the stats engine, agents and web app build against real generator output,
  and the two reference clubs give them an answer key.
- **Success statement:** 100 seeded Skyhaven vs Amberholt matches all pass the contract and invariant checks, the
  same seed gives byte-identical output, and Skyhaven's possession, pressing and high regains are clearly above
  Amberholt's while Amberholt's counter and set-piece shares are clearly above Skyhaven's.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Current code or placeholder files | main · 75b7cba · `generator/engine.py`, `state.py`, `decisions.py`, `outcomes.py`, `set_pieces.py`, `discipline.py`, `config.py`, `movement.py`, `tests/test_invariants.py`, `tests/test_seed.py` | Comment-only placeholders |
| World builder | `generator/world.py` (PR #11), roles, takers and traits (PR #14, open) | Clubs, 12 attributes, 10 style traits, roles, takers, lineups, match setups |
| Governing component specifications | `generator/specs/engine.md`, `actions.md`, `set-pieces-and-discipline.md`, `movement.md` | All **not started** |
| Shared contracts | `CONTRACTS.md` v0 §1 (frames, time, ids), §3 (events), §4 (tracking), §8 (metric definitions) | Shapes and rules the output must follow; generator invariants listed in §3 |
| Mock engine | `mock/overlap_mock/engine.py` (Arnav, PR #4) | A demo of what consumers need (shapes, 5 Hz tracking, invariants). Not a source of code or numbers (D1) |

**Differences between references:** the registry lists G2 (engine) and G3 (movement) as separate deliverables, but
in a step-by-step simulation the engine moves the players every step, so it cannot produce events consistent with
tracking without movement (decision D2). `CONTRACTS.md` asks for one shared coordinate helper, but none exists for
Python yet; the mock has its own `pitch.py` (decision D4). The mock times a `Carry` at the moment the carry ends;
`CONTRACTS.md` does not say, and consumers built on the mock expect it.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Specs: `engine.md`, `actions.md`, `set-pieces-and-discipline.md`, and `movement.md` if D2 is agreed, in **one** spec PR | Live streaming to Event Hubs and the CLI (G5, own plan, next) |
| Engine loop, match state, possession, clock and stoppage time, pressure, fatigue, seeds | Full seasons and the realism report (G6) |
| On-ball decisions and outcomes driven by attributes, roles, style traits, score and pressure | Storyline files and answer keys (G4); this plan only leaves a hook for them |
| Shots and goals from a shot model as close to real football as public sources allow (distance, angle, body part, preferred and weak foot, situation, assist type, pressure, keeper, weather) | Extra time and shootouts (periods 3–5) |
| Match conditions: weather per match (seeded from the venue's climate and kickoff month) and stadium effects (crowd, surface) | Sending conditions to other layers: D9, separate contract PR |
| Set pieces with the club's takers; fouls, cards, substitutions; simple offside | Injuries |
| 5 Hz player and ball movement (if D2) | The other 8 clubs (world M3) |
| Tests: contract shapes, invariants, seed reproducibility; a 100-match smoke check | Calibration against public sources across a season (G6) |

- **Minimum complete result:** agreed specs; one seeded Skyhaven vs Amberholt match produces valid setup, events and
  tracking; invariants and seed tests pass.
- **Optional extension:** the 100-match smoke check with the expected style signature (M5).
- **Boundary with neighbouring components:** the engine ends at in-memory setup, events and frames (plus a recorded
  file for local use). Sending them anywhere is G5.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| World traits, roles, takers | Azeem (PR #14) | Merged | Pending review · M3 | M2 runs on the world already on `main` |
| Event and tracking shapes (`CONTRACTS.md` §3, §4) | Producer Azeem; consumers unassigned (Arnav decides), Vedant | Supplied unchanged | Agreed v0 · M2 | — |
| xG definition (`CONTRACTS.md` §8, `stats/specs/metrics.md`) | Stats engine owner: unassigned (Arnav decides) | Same shot-quality inputs on both sides | `metrics.md` not started · M3 | Generator writes its model in `config.py`; aligned when `metrics.md` is written |
| Python coordinate helper (D4) | Azeem | `generator/pitch.py` | Decided · M2 | — |
| Venue fields for the stadium (world spec) | Azeem | `capacity`, `surface` and climate in `world.md` §1, the YAML and `world.py` | Pending · own small PR after PR #14 merges (the world spec is on #14) | Engine spec defines what it reads |
| Conditions in the match setup (D9) | Producer Azeem; consumers unassigned (Arnav decides), Vedant | Optional `conditions` in `CONTRACTS.md` §2 so agents and the web app can mention the weather | Proposed · separate contract PR | Engine works without it; conditions stay internal |

**My owned deliverables:** G2 (and G3 if D2): specs, engine modules, tests, calibration targets used here.  
**Shared deliverables:** none in the minimum result.

## 5. Proposed flow

```text
world file (S1.json) + home, away, seed
        │
        ▼
build_setup ──▶ match setup (§2)
        │
        ▼
engine loop, every 200 ms of match time:
  movement: every player steps toward a shape target; ball flies or is carried
  if the carrier is ready: decisions → outcomes → state update → events (§3)
  every step: tracking frame (§4, 5 Hz)
        │
        ▼
MatchResult(setup, events, frames)  ──▶ (G5) Event Hubs · (local) recorded files
```

- **Input arrives through:** a function call with the world, the two club ids, a match id and a seed.
- **Processing performed here:** the whole simulation, deterministic for a given seed.
- **Output goes to:** memory, then G5 (live) or a recorded file.
- **Execution relationship:** runs as fast as the CPU allows; pacing to 1×/5×/20× is G5's job.
- **State retained:** none between matches; the world file is read-only.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| D1 · Starting point | Build the engine fresh to the specs; `mock/` only shows what consumers expect | The world's data is the source of truth; no demo shortcuts or numbers carried over | Adapt the mock: faster, but carries its uncalibrated rules | **Agreed** · Azeem, 2026-10-16 |
| D2 · Engine and movement | One step-by-step simulation (200 ms); `movement.py` is the module the engine calls each step; G3's spec goes in the same spec PR | Events and tracking come from the same positions, so they always agree; speeds come from capped acceleration, not noise (`CONTRACTS.md` §4) | Engine emits events only, movement fills tracking afterwards: separable, but events and positions drift apart | **Agreed** · Azeem, 2026-10-16 |
| D3 · Randomness | `random.Random` streams per concern (decisions, outcomes, discipline, movement), each seeded from the match seed | Tuning one area doesn't reshuffle every other dice roll; same seed, same match | One stream (mock): simpler, but any change reshuffles everything | Proposed |
| D4 · Coordinates | `generator/pitch.py` holds the team-frame ↔ pitch-frame conversion | `CONTRACTS.md` wants one helper | Import the mock's `pitch.py`: nothing outside `mock/` may import it | **Agreed** · Azeem, 2026-10-16 |
| D5 · Decision model | For the player on the ball, each action gets a weight: base rate by pitch zone × attributes × role × team style × score and time × pressure; one weighted pick | Every new trait and role has an obvious place to act; easy to tune in `config.py` | Hand-written if/else chains (mock): fast to write, hard to tune or explain | Proposed |
| D6 · Shots | Shot quality from a logistic model of distance, angle, body part (with preferred and weak foot), situation, assist type, pressure and keeper position, fitted to public shot data; the shooter's finishing and the keeper's goalkeeping then move the goal chance around that xG | Goals and xG behave like real football; the same inputs let the stats engine's xG agree | Fixed conversion rates: simple, unrealistic | Proposed · stats owner to confirm §8 inputs |
| D9 · Conditions | Weather (temperature, rain, wind) seeded per match from the venue's climate and month; small, sourced effects on passing, control, keeper handling, ball speed and stamina. Crowd size gives home advantage | Real matches change with weather and venue; the agents get more to talk about | Ignore conditions: simpler, less realistic | Proposed · contract field needs consumers' agreement (separate PR) |
| D7 · Carry timing | Emit a `Carry` when it ends, with its start in `x`/`y` (the mock's choice) | Keeps `seq` order equal to time order; consumers built on the mock keep working | Emit at start: needs a second update event | Proposed · consumers |
| D8 · Tunable numbers | Every base rate, multiplier and threshold in `config.py`, each with a comment saying what it moves | One place to calibrate | Constants spread across modules | Proposed |

**Assumptions:** 200 ms steps are fine-grained enough for believable movement (the mock shows they are); a full
match runs in well under a minute in plain Python (mock: about 11 s per match, plus validation).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Match setup | Generator → all | `CONTRACTS.md` §2 | No | — |
| Event | Generator → stats, screen relay, archiver | `CONTRACTS.md` §3 | No (`Carry` timing written into `engine.md`, D7) | Unassigned owners (Arnav decides) |
| Tracking frame | Generator → screen relay, archiver, web | `CONTRACTS.md` §4 | No | Vedant; unassigned owners |

- Ids, frames and time follow §1 exactly; `seq` strictly increases; `match_ms` is monotonic; coordinates 0–100.
- The §3 invariants are tested on every match: score = goal shots; no events after full time; successful passes go
  to a teammate who isn't the passer; nobody acts after a red card; key-pass links are exact; same seed, same match.
- Speeds come from capped acceleration and per-player top speed, so sprint tags and distance stay meaningful.

**Shared contract edits required:** None.  
**Source of truth:** `CONTRACTS.md`; the generator specs for everything internal.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `generator/specs/engine.md` | Modify (M1) | State, loop, possession, clock, pressure, fatigue, seeds, events out | Itself · all open | Azeem / Arnav |
| `generator/specs/actions.md` | Modify (M1; M2: press-line wording fixed to name the carrier's frame) | Action set, decision weights, outcomes, shots, speeds, calibration knobs | Itself · agreed in PR #15 | Azeem / Arnav |
| `generator/specs/set-pieces-and-discipline.md` | Modify (M1) | Restarts with takers, fouls, cards, substitutions, offside | Itself · all open | Azeem / Arnav |
| `generator/specs/movement.md` | Modify (M1, if D2) | Shape targets, acceleration and top speed, ball flight, sprints, distance | Itself · all open | Azeem / Arnav |
| `generator/engine.py`, `generator/state.py` | Modify (M2) | Loop, clock, possession, event emission | `engine.md` | Azeem |
| `generator/movement.py` | Modify (M2, if D2) | Player and ball motion each step; tracking frames | `movement.md` | Azeem |
| `generator/pitch.py` | Add (M2) | Pitch size and frame conversion (D4) | `CONTRACTS.md` §1.1 | Azeem |
| `generator/decisions.py`, `generator/outcomes.py` | Modify (M2 first version, M3 tuned) | On-ball choices and their results, including the xG model | `actions.md` | Azeem |
| `generator/set_pieces.py` | Modify (M2: kickoffs, throw-ins, goal kicks, corners; M4: free kicks, penalties) | Restarts | `set-pieces-and-discipline.md` §1 | Azeem |
| `generator/discipline.py` | Modify (M4) | Fouls, cards, substitutions, offside | `set-pieces-and-discipline.md` §2–§5 | Azeem |
| `generator/config.py` | Modify (M2–M4) | Every tunable number | `actions.md` §6 | Azeem |
| `generator/tests/test_invariants.py`, `generator/tests/test_seed.py` | Modify (M2) | §3 invariants; same seed, same match | `engine.md` | Azeem |
| `generator/tests/test_engine.py` | Add (M2–M5) | Contract shapes, style effects, smoke check | specs above | Azeem |
| `CALIBRATION.md` | Modify (M5) | Public sources for the targets the smoke check uses | Itself | Azeem |
| `plans/active/PLAN_generator_match-engine.md` | Add | This plan | — | Azeem |
| `mock/overlap_mock/engine.py`, `contracts.py` | Use unchanged | Reference for D1; `contracts.py` validators run by hand as a one-off check (no import from generator code) | — | Arnav |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| An invariant breaks in a match | The test names the seed and the first bad event | Fix and re-run that seed | None until G5 ships | Invariant tests over many seeds |
| A side goes below 7 players (red cards) | Match is abandoned with a clear error (laws of the game) | — | None | Test with forced red cards |
| No player can take a set piece (all takers off) | Best available player by the relevant attribute | — | None | Test with takers subbed off |
| Simulation stalls (no progress in match time) | Fails fast with the seed and state | Fix and re-run | None | Step-count guard in the loop |
| Same seed differs between runs | Seed test fails | Remove the hidden source of randomness (e.g. set iteration order) | Replays break | `test_seed.py` |

## 10. Requirements specific to this work

- **Performance and load:** one match in under 30 s of CPU on a laptop (unmeasured; mock reference about 11 s).
- **Observability:** a one-line summary per match (score, shots, possession, events, frames) and the seed on every
  error.
- **Azure resources and access:** not applicable — local only; G5 sends to Azure.
- **Cost:** not applicable.
- **Security and data:** no secrets; no real names in code, tests or logs.
- **AI behavior:** not applicable — no model calls.
- **Frontend experience:** not applicable.
- **Synthetic data or calculations:** fully seeded; tuned only against public aggregates cited in `CALIBRATION.md`;
  no match-level real data.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | The three (or four) specs answer every question and merge with status agreed | Spec PR review | — | Spec PR link |
| AC-02 | Given the world and seed 1, a full Skyhaven vs Amberholt match produces a setup, events and 5 Hz frames that pass `validate_setup`, `validate_event` and `validate_frame` | Test plus a one-off run of the mock's validators | World on `main` | Test output |
| AC-03 | Every §3 invariant holds for 100 seeds | `test_invariants.py` | — | Test output |
| AC-04 | The same seed gives byte-identical events and frames | `test_seed.py` | — | Test output |
| AC-05 | Over 100 seeds, Skyhaven has more possession, a lower PPDA (presses more) and more high regains than Amberholt; Amberholt has a larger share of counter shots and set-piece shots | Smoke check computing these from the events | PR #14 merged | Table of measured values |
| AC-06 | Over 100 seeds, goals, shots, passes and fouls per match fall inside the `CALIBRATION.md` ranges that have public sources | Smoke check | Sources added in M5 | Table of measured values |
| AC-07 | Set pieces use the club's takers when they are on the pitch | Test | PR #14 merged | Test output |

**Validation limits:** the stats engine doesn't exist yet, so AC-05 uses the generator's own simple counts, not the
stats engine's metrics; the real connection is proven only when G5 streams into the stats engine.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Specs | One PR with engine, actions, set-pieces-and-discipline (and movement) specs | Azeem | D1, D2 answered | AC-01 | 16–17 Oct |
| M2 — A match runs | Full SKH v AMH match: valid setup, events, frames; invariants and seed tests | Azeem | M1 merged; D1 | AC-02, AC-03, AC-04 | 17–18 Oct |
| M3 — Style shows | Decisions and outcomes use attributes, roles and the ten style traits | Azeem | M2; PR #14 merged | AC-05 (directional) | 18–19 Oct |
| M4 — Set pieces and discipline | Takers, fouls, cards, subs, offside | Azeem | M3 | AC-07 | 19 Oct |
| M5 — Smoke check | 100-match check with the style signature and public-source ranges | Azeem | M4 | AC-05, AC-06 | 19–20 Oct |

- **Project calendar check:** M2 must land by 18 Oct so G5 (live mode, own plan) can stream a real match by
  **20 Oct**. Every required feature by 24 Oct; freeze 25–26 Oct; submission 27 Oct. Tight: D1 is what makes it fit.
- **First integration checkpoint:** M2 output through the mock's contract validators (real data, mock validator);
  the real one is G5 into Event Hubs and the stats engine.
- **Parallel work:** the G5 plan can be written during M2–M3; it only needs the `MatchResult` shape.
- **Dependency-bound work:** M2 waits for M1 and D1; M3 waits for PR #14.
- **Scope reduction if time runs short:** drop offside, then substitutions beyond fatigue, then M5's public-source
  ranges (keep the style signature).

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `generator/engine-specs` (M1, specs only); then `generator/match-engine`
  (M2), `generator/engine-actions` (M3), `generator/engine-set-pieces` (M4), `generator/engine-smoke` (M5).
- **Shared-file coordination:** `CALIBRATION.md` is Azeem's file (registry). No hot shared files.
- **Conflict scan result:** No overlaps found on 2026-10-16 at 75b7cba.

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| — | PR #14 (`generator/world-traits`) touches `world.py`, `reference_clubs.yaml`, `world.md`, tests; this plan touches none of them | Azeem | M3 starts after #14 merges | — |

  Sources checked: plans ✓ (no other active plan touches the engine, movement or these specs) · PRs ✓ (#14 only) ·
  branches ✓ · hot files ✓ (none).
- **Integration procedure:** `cd generator && uv run pytest`; a small function call plays and checks one match.
- **Configuration or setup changes:** none.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** the four generator specs; `CALIBRATION.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Building fresh (D1) is slower than adapting | 20 Oct at risk | Azeem | Scope cuts in §12; G5 can stream the mock on 20 Oct if the engine slips | M2 |
| R-02 | Weather effects overstated | Matches look odd in rain | Azeem | Small effects only, each sourced or marked as a judgement call | M3 |
| R-03 | Generator shot model and stats xG disagree | Season xG and goals drift apart | Stats owner (unassigned) | Same §8 inputs; align when `metrics.md` is written | M3 |
| R-04 | Four specs in one PR is a big review | Slow review | Arnav | Short answers, linked decisions, one review sitting | M1 |
| R-05 | Time | Features slip past 20 Oct | Azeem | Scope cuts in §12 | All |

**Decisions requested from Arnav or affected owners:**

1. **D9:** add an optional `conditions` object (weather and attendance) to the match setup in `CONTRACTS.md` §2, in
   its own small contract PR, so the agents and the web app can mention the weather. Recommendation: yes; no
   consumer has been built yet, so it is cheap now.
   The same PR updates the penalty xG in `CONTRACTS.md` §8 from about 0.76 to Opta's sourced 0.78, which
   `actions.md` §4 uses (`CALIBRATION.md` is updated in its own calibration-sources PR).
2. **Stats xG:** the stats engine's xG uses the same inputs as the generator's shot model (`actions.md` §4).

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
| Arnav | v0.1 | — | Pending | — |

**Implementation readiness:** M1 in progress (go from Azeem, 16 Oct); M2 is blocked by M1 merging.  
**Relevant specification agreement:** pending (four generator specs).  
**Next action and owner:** spec PR reviewed by Arnav · Azeem.

### Handover after implementation

**M3 part 1 — style shows** (branch `generator/engine-balance`, stacked on M4 #22). Part 2 continues with the
realism report from batch mode.

- `counter_attack` now does what `actions.md` §2 and `movement.md` §2 say: a fast first release after a regain,
  forward pass targets in the counter window, and attackers breaking forward. Pass accuracy and base weights tuned
  toward `CALIBRATION.md`: fewer misplaced passes, more long balls from deep, fewer crosses.
- AC-05 over seeds 1–6, four of five directions met: Skyhaven has more possession (0.55 against 0.45), presses harder
  (PPDA 17.8 against 37.9), wins more high regains (71.5 against 19.3), and Amberholt has the larger share of shots
  from set pieces (0.17 against 0.05). **Not met:** Amberholt's counter-shot share (0.00 against 0.04).
- **Remaining gap:** Amberholt takes about 2 shots a match (expected 5–9) because its carrier in the final third has
  on average 0.9 team-mates there; support runs into attack need work. Skyhaven's shots (about 29) run high.
  Pass completion is now 79 % for Skyhaven and 73 % for Amberholt (target 79–84 % overall).

**M4 — set pieces and discipline** (branch `generator/engine-discipline`, stacked on live mode #21; done before
M3 so tuning works on complete matches).

- **AC-07:** passed. Penalties use `set_pieces.penalties` (test with a hand-placed foul in the box); corners and
  free kicks use their lists.
- Fouls (with advantage), yellow cards, second yellows, straight reds (denying a clear chance: the attacker within
  20 m, central, no other outfield defender goal-side), five substitutes in three windows, offside on through balls and
  long passes, direct and crossed free kicks with a wall, penalties. A sent-off keeper is replaced by a substitute
  keeper (if a substitution is left) or by an outfield player. Matches now include all 18 event types.
- Measured over seeds 1–10: fouls 16.8 per match (target 18–28, low), yellows 4.2 (3–5), reds 0.2, penalties 0.6
  (high: Skyhaven spends long spells in Amberholt's box, the M3 gap), offsides 6.1 (2–6), substitutions 10,
  shots 27.3, goals 3.1. Contract check passed for seeds 1–5 with tracking; `pytest` 75 passed.

**M2 — a match runs** (branch `generator/match-engine`, PR #20). M3 and M5 not started.

- Acceptance results:
  - **AC-02:** passed. Full Skyhaven vs Amberholt matches produce a setup, about 2,400 events and about 30,000 frames
    (5 Hz), and pass the mock's `validate_match` (setup, every event, every frame, the invariants) for seeds 1–20,
    run by hand with `conditions` removed from the setup copy because the mock predates it.
  - **AC-03:** passed for the seeds run (3 in CI via `OVERLAP_SEEDS`, 20 by hand); 100 seeds waits for batch mode.
  - **AC-04:** passed. `test_seed.py`: the same seed gives byte-identical setup, events and frames.
  - Also: `pytest` 57 passed (38 world, 19 engine); `ruff 0.17.0` clean on every changed file; events match the
    tracked position of their actor (`test_events_and_tracking_agree`); a match plays in about 12–15 s.
- Measured over seeds 1–20 (uncalibrated): goals 3.0 per match (target 2.7–3.3), shots 28.4 (25–28), passes about
  1,070 (820–950, high), pass completion 72–77 % (79–84 %, low), added time 3–5 minutes in the second half, top
  speed 33.7 km/h (33–36), median distance 10.6–11.6 km (9–14). Skyhaven won 18, drew 2 (both 0–0); Amberholt
  scored 2 goals in 20 matches.
- **Known gap for M3:** the match is lopsided. Skyhaven's pressing produces about 400 pressure events and Amberholt
  completes about 11 passes into the final third against Skyhaven's 99, so Amberholt takes about 1 shot a match.
  M3 tunes pressing, counter-press and counter-attacks against the expected A-vs-B signature (AC-05).
- Differences from the agreed proposal: `decisions.py`, `outcomes.py` and `set_pieces.py` (kickoffs, throw-ins,
  goal kicks, corners) got first versions in M2, because a valid match needs them; M3 tunes them and M4 adds fouls,
  cards, substitutions, offside, free kicks and penalties. The press line in `actions.md` named the wrong frame and
  is reworded; the behaviour is what the spec meant. The penalty-spot xG anchor (about 0.30, unsourced) can't be met
  by a smooth model that meets the sourced anchors; the model gives about 0.18 there.
- Setup and integration: `cd generator && uv run python engine.py` plays one match and prints a summary;
  `engine.play(clubs, "SKH", "AMH", match_id=..., seed=...)` returns the `MatchResult` live mode (G5) streams.
