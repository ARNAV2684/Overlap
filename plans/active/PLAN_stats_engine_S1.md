# PLAN_stats_engine_S1 — numbers from a match

| Field | Complete this |
|---|---|
| Sprint | S1 — the stats engine reads a match in order and computes its numbers (work map ST1 + ST2) |
| Parent plan | [`PLAN_stats_engine.md`](PLAN_stats_engine.md) · v0.1 |
| Milestone in parent plan | S1 · AC-02, AC-03 (xG, possession and PPDA), AC-04 |
| Author / owner | Azeem |
| Status | Done, in review (go from Azeem, 2026-10-20) |
| Reviewed branch and commit | main · 7bda05a (after #50 merged) |
| Planned branch | `stats/numbers` |

## 1. Outcome

- **What will work at the end of this sprint:** `cd stats && uv run python main.py replay <folder>` reads a recorded
  match, or a whole run of them, in `seq` order. It drops duplicates, holds at gaps and stops on conflicts. It prints
  each match's numbers as JSON: per-shot xG, pass difficulty, team and player totals, possession and PPDA. The
  consumer for both hubs is written and unit-tested.
- **Not in this sprint:**
  - Rolling windows, pass network, pressing grid and zones.
  - Stat panels, `match_state`, a live run against the emulator, the restart test (S2).
  - Triggers, evidence and moments (S3).
  - Azure (S4).

**Decisions from #50's review:** #50 was merged by Arnav on 2026-10-20 with no review comments. The proposals stand
as written: D-01 panel shape and rate, D-02 `match_state`, D-03 `context.players`, D-08 a 15-minute window. D-07
(registry owner) is still open; the registry says unassigned.

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Agreed specs: `metrics.md` §1–§3, §6, §7; `publishing.md` (input rules) | PR #50 | Yes |
| `CONTRACTS.md` §1.3, §1.4, §3, §4 | main | Yes |
| Recorded generated matches | `generator/` on main; local seasons S1, S2 and the 100-match repeat in `data/seasons/` (gitignored) | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `stats/pyproject.toml` | Add | Package `overlap-stats` with the archiver's dependencies (Event Hubs, blob checkpoints, identity, Cosmos); pytest | `publishing.md` |
| `stats/consumer.py` | Modify | Reads both hubs as group `stats`, with blob checkpoints (Azurite locally). Yields `(hub, kind, match_id, body)`; skips `kind=stats`. Checkpoints only when told | `publishing.md` (input, restart) |
| `stats/dedupe.py` | Modify | Per-match ordering: apply contiguous `seq`, hold back after a gap, drop duplicates, raise on a conflicting body | `publishing.md`, `CONTRACTS.md` §1.3 |
| `stats/state.py` | Modify | Match state: setup, teams, players on the pitch, score, period, clock, possessions, cards; team and player totals | `metrics.md` §6 |
| `stats/xg.py` | Modify | The xG model of `metrics.md` §1 | `metrics.md` §1 |
| `stats/pass_difficulty.py` | Modify | Difficulty, progressive pass, distance | `metrics.md` §2 |
| `stats/per_event.py` | Modify | Annotates each event: shot xG, the pass's difficulty, progressive and key-pass flags; player speed, distance and sprints from frames | `metrics.md` §1–§3 |
| `stats/whole_match.py` | Modify | Team and player totals, possession %, PPDA, press height, momentum weights, small-sample flags. Pass network, zones and pressing grid come in S2 | `metrics.md` §4–§7 |
| `stats/main.py` | Modify | `replay <match or run folder> [--out file]`; `live` prints a "not yet: S2" message | `publishing.md` |
| `stats/tests/fixtures/SYN-1017/` | Add | One generated match (KES v ORR, seed 1017; events and setup, gzipped), the same as Pranav's shot-cluster fixture | — |
| `stats/tests/test_dedupe.py`, `test_metrics.py`, `test_replay.py`, `test_consumer.py` | Modify / add | Duplicates, gaps, conflicts; xG anchors and calibration terms; pass difficulty; possession and PPDA on hand-made events; a deterministic replay of the fixture | as above |
| `stats/README.md` | Modify | How to install and run `replay` | — |
| `docs/knowledge/stats-engine.md` | Modify | Status: S1 runtime exists (replay only) | `docs/specs/knowledge-sharing.md` |
| `plans/active/PLAN_stats_engine.md`, this plan | Modify / add | Status, file map row for the test fixture, handover | — |

`stats/tests/test_triggers.py` stays a placeholder until S3. The parent plan's file map gains
`stats/tests/fixtures/` for this sprint.

## 4. Steps

1. **Package.** Add `pyproject.toml` (Python 3.12, `uv`, as the archiver does); confirm `uv sync` and an empty test
   run work.
2. **Ordering.** Write `dedupe.py` and its tests first: duplicates dropped, a gap held then released when the missing
   event arrives, a conflicting body raises.
3. **Per-event metrics.** Write `xg.py` and `pass_difficulty.py` with tests against the spec's anchors and fitted
   coefficients, then `per_event.py`.
4. **State and totals.** Write `state.py` and `whole_match.py`: possession by `possession_id`, PPDA, press height,
   momentum, totals per team and player, small-sample flags.
5. **Replay runner.** `main.py replay` over one match folder or a whole run folder, writing JSON. Add the KES–ORR
   fixture, plus a test that replaying it twice gives identical output.
6. **Consumer.** `consumer.py` with the Event Hubs client and blob checkpoint store, tested with a fake client. The
   live run with the emulator is S2.
7. **Cross-check by hand (AC-03)** on the local generated runs:
   - goals ÷ engine xG over league seasons S1 and S2;
   - possession and PPDA against the generator's Calverholme v Dunmarrow answer key over the 100-match repeat.

   Record the table in the parent plan.
8. **Docs.** README, knowledge note, plan statuses. Ruff clean.

## 5. Contracts and shared files

- **Contract changes:** none. The engine reads `CONTRACTS.md` §3 and §4 as they are.
- **Hot shared files touched:** none. The test fixture lives in `stats/tests/fixtures/`, not the shared `fixtures/`
  folder.

## 6. Conflict scan

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `stats/` | — | — | No other plan, PR or branch touches it | Agreed |
| `docs/knowledge/stats-engine.md` | `PLAN_docs_graphify-knowledge-map.md`, `PLAN_docs_knowledge-sharing.md` | Pranav | Updated in this PR, as the knowledge-sharing rule asks | Agreed |

**Scanned at `7bda05a` on 2026-10-20.** Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ · hot files ✓
(none touched).

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| AC-02 | Replaying the KES–ORR fixture twice gives byte-identical JSON | `test_replay.py` (CI) | Pending implementation |
| AC-03 (xG) | Over league seasons S1 and S2 (180 matches), goals ÷ engine xG is 0.9–1.1 | `main.py replay` by hand | Pending implementation |
| AC-03 (possession, PPDA) | Over the 100 Calverholme v Dunmarrow matches, the engine's possession is within ±0.03 and its PPDA within ±15 % of the generator's answer key | `main.py replay` by hand | Pending implementation |
| AC-04 | Duplicates are dropped, a gap holds later events until filled, and a conflicting body raises | `test_dedupe.py` (CI) | Pending implementation |
| S1-AC-05 | xG anchors from `metrics.md` §1 hold (4.5 m foot 0.36, header 0.18, 16.5 m 0.066, 25 m 0.023, penalty 0.78) | `test_metrics.py` (CI) | Pending implementation |
| S1-AC-06 | The consumer skips `kind=stats` messages and hands events and frames to the pipeline per match | `test_consumer.py` with a fake client (CI) | Pending implementation |

**Limits:** no live hub, Cosmos or relay in this sprint. If the generator's PPDA is defined differently, the AC-03
PPDA comparison shows it; the gap is explained, not tuned away.

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| D-07: the registry still lists stats as unassigned | Scope reports name no owner | Arnav | None |
| The generator's answer-key PPDA or possession may be defined differently from `metrics.md` | AC-03 shows a gap that isn't a bug | Azeem | None. Explain the difference in the handover |
| Fixture size (one gzipped match, about 150 KB) | A slightly bigger repository | Azeem | None |
| Time | S1 slips into S2's days | — | **Cut first:** player sprints and high-intensity distance (tracking extras), then the consumer's tests (keep the code) |

## 9. Handover

Branch `stats/numbers`. 27 tests pass (`pytest` in `stats/`), and `ruff check` is clean.

| AC | Result |
|---|---|
| AC-02 | Met. `test_replaying_twice_gives_identical_numbers`. Shuffled and repeated delivery also give the same numbers (`test_shuffled_and_repeated_delivery_gives_the_same_numbers`) |
| AC-03 (xG) | Met. 499 goals against 463.9 engine xG over league seasons S1 and S2 (180 matches): goals ÷ xG 1.08, within 0.9–1.1. The generator's own xG, which also knows defenders and keeper position, was 514.5 |
| AC-03 (PPDA) | Met. Over 100 Calverholme v Dunmarrow matches the engine's PPDA equals the generator's answer key: 14.75 / 14.75 and 29.62 / 29.63 |
| AC-03 (possession) | **Not met, explained.** Engine 0.594 / 0.406 against the generator's 0.562 / 0.438, a 0.032 gap against ±0.03. The generator counts live ball time inside the simulation. The engine counts each possession up to the next one, so a stoppage after an attack goes to the attacking side (`metrics.md` §6). Counting only first-to-last event narrows it to 0.023, but that would change the definition just agreed in #50, so it is left for a spec change if Arnav or Vedant want it |
| AC-04 | Met. `test_dedupe.py`: duplicate dropped; a gap holds later events until filled; a conflicting body raises, whether the first copy was applied or held. `test_a_missing_event_holds_everything_after_it` covers it on the fixture |
| S1-AC-05 | Met. The xG anchors hold within 0.006, and the penalty is 0.78 (`test_xg_meets_the_spec_anchors`) |
| S1-AC-06 | Met. `test_consumer.py`: panels are skipped, and the checkpoint moves once, at full time |

**Differences from the plan:**
- **Consumer checkpoints.** A partition's checkpoint moves only when every match seen on that partition has
  finished. Event Hubs checkpoints are per partition, so this keeps the spec's rule: a restart re-reads an unfinished
  match from its setup.
- **`Pipeline.finished`** was added for that.
- **The stats package** gained `[tool.ruff] line-length = 120`, as the generator has.

**Not checked here:**
- a live run against the emulator (S2);
- speeds from real tracking: the fixture has events only, and sprints are tested with hand-made frames.
