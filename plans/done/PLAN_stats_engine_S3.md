# PLAN_stats_engine_S3 — moments with evidence, and a guide for the agents flow

| Field | Complete this |
|---|---|
| Sprint | S3 — triggers, evidence packs and moment documents for the AI agents (work map ST5), plus a stats-side guide to how each agent should use them |
| Parent plan | [`PLAN_stats_engine.md`](../active/PLAN_stats_engine.md) · v0.1 |
| Milestone in parent plan | S3 · AC-07, AC-08, AC-09, AC-10 |
| Author / owner | Azeem |
| Status | Done (merged in PR #54, 2026-10-20) |
| Reviewed branch and commit | main · 36f5d00 (after #53, S2, merged) |
| Planned branch | `stats/moments`, from main |

## 1. Outcome

- **What will work at the end of this sprint:**
  - The engine flags moments (`triggers.md`), builds their evidence packs (`evidence-packs.md`) and writes each as a
    moment document (`CONTRACTS.md` §10.2, with `context.players`) in Cosmos `moments`, created once, with stable
    IDs.
  - `main.py replay --moments` lists a recorded match's moments, identically every time.
  - A guide, `stats/agents-guide.md`, tells Arnav and Pranav what each agent in the insight flow (spotter, analyst,
    narrator, fact-checker, director, translator, recap writer) gets from the stats engine and how to use it. Its
    summary goes in this sprint's PR description, as Azeem asked.
- **Not in this sprint:**
  - The `sprint` trigger (D-01).
  - Agent code, prompts and overlays (Pranav).
  - Changes to Pranav's MCP schema (his: see D-02).
  - Azure (S4).
  - A live Cosmos run (D-03).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| Agreed specs: `triggers.md`, `evidence-packs.md`, `publishing.md` §3; `CONTRACTS.md` §5, §10.1–§10.2 | PR #50 | Yes |
| S1 and S2 code: state, windows, publisher, live mode | PRs #51, #53 | Yes (merged) |
| Pranav's expected shot-cluster moment (KES v ORR, seed 1017) | `agents/specs/examples/shot-cluster.md` | Yes. The fixture match still reproduces it (checked 19 Oct) |
| Pranav's MCP reader accepting `context.players` and the other trigger types | `mcp_server/schema.py` (Pranav) | **No.** Today it accepts only `shot_cluster` with two facts and rejects unknown fields. AC-08 waits on his update (D-02) |
| Generated runs for recall and volume | Local `data/seasons/S1`, the 20 `late_pressure_surge` matches and their 20 controls (gitignored) | Yes |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `stats/triggers.py` | Modify | The eight event triggers with their rules, warm-ups and cooldowns; no merging across types; evaluation order per `triggers.md` §1 | `triggers.md` |
| `stats/evidence.py` | Modify | Evidence packs per trigger: keys, units and decimals; facts below their minimum sample left out; windows, `event_ids`, `player_ids`. Also the moment document: ordinals, `source`, `context` (with `players`) captured at the triggering event | `evidence-packs.md`; `CONTRACTS.md` §5, §10.1–§10.2 |
| `stats/publish.py` | Modify | `MomentStore`: Cosmos create-only. An identical repeat is a no-op; a different one stops the match. Written directly, before the event's panels; `match_state` is written with each moment. A dict store for tests | `publishing.md` §3 |
| `stats/state.py` | Modify | What triggers need that the state lacks: scorer goal counts, the last possession's events, counts of cards and fouls | `metrics.md` §6 |
| `stats/main.py` | Modify | The pipeline evaluates triggers after each event. `replay --moments`; `live` writes moments | `publishing.md` |
| `stats/tests/test_triggers.py` | Modify | Each trigger's rule, warm-up, cooldown, ordering and identity, on hand-made events | `triggers.md` |
| `stats/tests/test_evidence.py` | Add | Pack contents per trigger. The fixture's shot cluster equals Pranav's example (evidence, source, context; ordinal aside). A missing fact is left out, never zero. No `unit` key where the contract forbids one | `evidence-packs.md`, `CONTRACTS.md` §10 |
| `stats/tests/test_moments.py` | Add | Replay twice gives identical moments; the store's no-op on an identical repeat and conflict on a different one | `publishing.md` §3 |
| `stats/specs/triggers.md`, `evidence-packs.md` | Modify | `sprint` marked deferred, with the reason (D-01); the final measured volume and recall | themselves |
| `stats/agents-guide.md` | Add | The guide for the agents flow (§4 step 7) | — (guidance, not a contract) |
| `stats/README.md`, `docs/knowledge/stats-engine.md` | Modify | Status; how to list moments | — |
| `plans/active/PLAN_stats_engine.md`, this plan | Modify / add | Status, handover | — |

## 4. Steps

1. **State additions**, then **`triggers.py`** with tests: each trigger's rule, cooldown and warm-up, the
   no-look-ahead rule, and the evaluation order within one event.
2. **`evidence.py`** with tests:
   - Packs per trigger.
   - Context captured after the triggering event (the score includes a goal that completes a cluster, as in Pranav's
     example).
   - Ordinals in processing order.
   - The fixture's shot cluster checked against Pranav's example.
3. **`MomentStore`** and pipeline wiring: synchronous create, then `match_state`. Replay and live.
4. **Volume (AC-10):** replay season S1 and record moments per match by type.
5. **Recall (AC-09):** replay the 20 surge matches against their 20 controls.
6. **Schema check (AC-08, part):** validate the shot-cluster moment against Pranav's `parse_moment`, run from his
   `mcp_server` environment. Record that it passes except for `context.players`, which his schema must allow (D-02).
7. **`stats/agents-guide.md`**, for each agent role:
   - which moments and facts it receives;
   - the priority and cooldowns that matter;
   - football-sense rules for words: what each trigger supports saying and what it doesn't (for example, a shot
     cluster is not proof of dominance, and a big chance is not "should have scored");
   - claim-to-fact mapping for the fact-checker;
   - a suggested visual per trigger for the director;
   - what the analyst's MCP tools can read from `match_state` and the archived panels;
   - what the recap writer can build from a match's moments and final `match_state`.

   Its summary goes in the PR description.
8. **Docs, statuses and handover.**

## 5. Contracts and shared files

- **Contract changes:** none to shapes; this sprint implements §5 and §10.1–§10.2 as agreed in #50. The only spec
  change is marking `sprint` deferred (D-01).
- **Hot shared files touched:** none.
- **A neighbour has to change:** Pranav's reader must accept `context.players` (agreed in #50) and the other trigger
  types and fact keys before those moments pass it (D-02). The guide lists exactly what it must accept.

## 6. Conflict scan

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| Cosmos `moments` documents (`CONTRACTS.md` §10.2) | `PLAN_agents_ai-insights-mcp.md`, `_S1`, `_S2` (MCP reader, workflow) | Pranav | No shared file edit. His reader must accept the agreed `context.players` and more trigger types (D-02). The guide and PR give him the exact list | Pending (Pranav) |
| `plans/active/PLAN_stats_engine*.md` | `PLAN_agents_ai-insights-mcp_S1.md`, `PLAN_plans_housekeeping.md`, `PLAN_docs_graphify-knowledge-map.md` (#54's scope report) | Pranav, Arnav | Read-only references: the agents plan reads these as its producer's plans, the knowledge map links them, housekeeping merged in #26. None edits them | Agreed (no shared edit) |
| `docs/knowledge/stats-engine.md` | `PLAN_docs_graphify-knowledge-map.md`, `PLAN_docs_knowledge-sharing.md` | Pranav | Updated in this PR, as the rule asks. STATS-01 / MCP-01 are updated with the AC-08 evidence | Agreed |

**Scanned at `36f5d00` on 2026-10-20.** Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ · hot files ✓
(none touched).

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S3-AC-01 | Each trigger fires exactly per `triggers.md` §1 (rule, warm-up, cooldown, team), with no look-ahead and no merging across types | `test_triggers.py` (CI) | `test_triggers.py`: each trigger's rule, warm-up, cooldown, team and order, on hand-made events, plus the fixture firing Pranav's cluster. Passes |
| AC-07 | The fixture's `shot_cluster` moment equals Pranav's example in `evidence`, `source` and `context` (`players` added). Its `moment_id` follows our ordinal rule | `test_evidence.py` (CI) | `test_evidence.py`: the fixture's KES cluster (`MO-1017-0013`) equals the example in `evidence`, `source` and `context`; `players` matches `player_ids`. Passes |
| S3-AC-02 | Replaying twice gives identical moments and IDs. The store does nothing on an identical repeat and stops the match on a different one | `test_moments.py` (CI) | `test_moments.py`: two replays give identical documents and ids `MO-1017-0001`…`0021`; a second run into the same store writes nothing; a changed document raises `MomentConflict`, keeps the old one and stops the match. Passes |
| AC-10 | Season S1 averages 15–35 moments a match | `replay --moments` by hand | **19.7 a match** on season S1 (median 19.5, range 10–33; 73 of 90 matches inside 15–35, none above). By type: press change 6.04, momentum swing 5.52, goal 2.86, shot cluster 2.59, big chance 1.61, milestone 0.57, red card 0.49, penalty 0.06. Passes |
| AC-09 | `momentum_swing` or `press_change` fires for the surging side within 15 minutes of onset in at least 70 % of the 20 surge matches, and in clearly more matches than in the 20 controls | `replay --moments` by hand | **15 of 20** surge matches against **10 of 20** controls within 15 minutes (11 by `press_change`, 4 by `momentum_swing`; first one 3–14 minutes after onset). Within 10 minutes: 7 against 2. Passes; half the controls also fire, recorded in `triggers.md` |
| AC-08 (part) | Pranav's `parse_moment` accepts the fixture's shot-cluster moment with `context.players` removed. The full pass waits on D-02 | Run from `mcp_server` by hand | Pranav's `parse_moment` (pydantic 2.14.1, his pinned version, in a throwaway venv) accepts `MO-1017-0013` and `MO-1017-0019` with `context.players` removed, and rejects them as written (`extra_forbidden` on `players`). Other triggers fail on his `trigger`, fact and `event_ids` limits (D-02). Partly passes, as planned |
| S3-AC-03 | `stats/agents-guide.md` covers every agent role, and the PR description summarises it for Arnav | Review | `stats/agents-guide.md`: spotter, analyst, narrator, fact-checker, director, translator, recap writer, and what Pranav's reader must accept. Summarised in the PR description |

**Limits:**
- No live Cosmos run here (D-03). The store's create-once logic is tested with a fake.
- Agent behaviour isn't tested: that's Pranav's.
- Recall and volume are measured on generated matches.

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| D-01: defer the `sprint` trigger | One fewer moment type (about 1 a match). Frames arrive independently of events, so a sprint moment's ordinal would differ between live and replay, breaking stable IDs. It was already first on the cut list | Azeem (Arnav in review) | None |
| D-02: Pranav's reader must accept `context.players` and the other triggers and keys | Until then only `shot_cluster` moments can pass his reader, and only once `players` is allowed | Pranav | AC-08 full pass |
| D-03: no live Cosmos run in this sprint (the Docker cycle again) | Cosmos create-once behaviour is only checked with a fake | Azeem | None. Run it in S4 against Azure, or in one more local session if wanted |
| Recall in the surge storyline is limited by 5-minute samples (`triggers.md` §1) | AC-09 may land near 70 % | Azeem | None; recorded honestly |
| Time | Into 24 Oct | — | **Cut first:** the `milestone` trigger, then `press_change`. Goal, big chance and shot cluster stay |

## 9. Handover

**Done (2026-10-20, branch `stats/moments`):**
- **Code:** `triggers.py` (eight triggers, fixed order, cooldowns, warm-ups), `evidence.py` (packs and the §10.2
  document with `context.players`), `publish.py` (`Moments`, `DictMomentStore`, `CosmosMomentStore`: create-only,
  conflict stops the match), `state.py` (possession events, last fouls, event players, players on the pitch),
  `rolling.py` (`event_ids`), `main.py` (pipeline wiring, `replay --moments`, live writes moments).
- **Tests:** 63 pass, ruff clean. New `test_evidence.py` and `test_moments.py`; `test_triggers.py` rewritten.
- **By hand:** the pack checks of `test_evidence.py` pass on all 1,776 moments of season S1. Volume, recall and
  Pranav's reader as in §7.
- **Docs:** `triggers.md` and `evidence-packs.md` (sprint deferred, measured numbers), `stats/agents-guide.md`,
  README, knowledge note (STATS-01 evidence).

**Not done / for the next person:**
- **D-02 (Pranav):** his reader must accept `context.players`, the other triggers and keys, and 1–500 `event_ids`
  (guide §5). His sample uses `MO-1017-0001` for the KES cluster; the engine writes `MO-1017-0013` because every
  trigger counts toward the ordinal. MCP-01 in `docs/knowledge/mcp.md` is his record to update.
- **D-03:** no live Cosmos run; `CosmosMomentStore` is exercised only through the same create-once rule in memory.
  Run it in S4 or one more local session.
- **D-01:** `sprint` is deferred; building it needs frame-ordered ordinals that are the same live and in replay.
- Half the control matches also fire a comparison trigger within 15 minutes of the surge minute. The spotter should
  treat `momentum_swing` / `press_change` as "worth a line", not "the turning point" (guide §4).
