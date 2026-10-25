# PLAN_cross_live-insight-moments — Head-to-head, connection and workhorse moments, and connections on the 3D pitch

| Field | Complete this |
|---|---|
| Proposal title | Turn the S8 live insights into moments the agents narrate, and draw the top connections on the 3D pitch |
| Author / primary owner | Arnav |
| Collaborators and responsibilities | Azeem: stats engine owner; agreed to the `stats/` changes (24 Oct, told to Arnav) |
| Review coordinator | Arnav |
| Affected component owners | Stats engine: Azeem. Agents, MCP server: Arnav. Web: Arnav, Azeem. `CONTRACTS.md`: producer Azeem, consumers Arnav |
| Proposal version and date | 1.0 · 24 Oct 2026 |
| Status | Implemented and validated locally; folded into the S8 branch, PR not opened yet |
| Plan tier and file | Full · `plans/active/PLAN_cross_live-insight-moments.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | `claude/gallant-noether-0jf0ql` · `df2db05` (main `b18297f` plus S8) |
| Architecture box / work area | Box 3 (stats engine) → box 5 (agents, MCP) → box 7 (web) |
| Relevant issue, spec PR, or discussion | [`PLAN_web_football-revamp_S8`](PLAN_web_football-revamp_S8.md) §8 follow-ups; Arnav's go on 24 Oct |

## 1. Purpose and intended outcome

- **Problem or need:** S8 shows head-to-heads, connections and the engine room as numbers on the screen, but the agents
  never talk about them, so the multi-agent part of the product does not cover what the screen points out. The top
  connections are drawn only on a small 2D card.
- **Proposed outcome:** three new moment types, `head_to_head`, `connection` and `workhorse`, fired by the stats
  engine, carried through the MCP server and the seven agents like every other moment, shown in the live commentary
  with a link to the matching card; and a **Connections** view on the 3D pitch.
- **Success statement:** on a generated match the stats engine fires each new type a few times, every pack passes the
  MCP schema, the agents' template path produces a checked line for each, and the web links each card to its insight
  card; the 3D pitch draws a team's top three pairs with shirt numbers.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Triggers | `stats/triggers.py` · `df2db05` | Eight triggers, cooldowns per (trigger, side, period), fixed order |
| Evidence | `stats/evidence.py` | One `_<trigger>` method per trigger; 2–7 facts; `context.players` from `player_ids` |
| Validation | `mcp_server/schema.py` | `Trigger` literal, `FACT_SPECS`, `TRIGGER_FACTS`; every player must be on the moment's team |
| Agents | `agents/spotter.py`, `director.py`, `fallbacks.py`, `fact_checker.py`, `analyst.py`, `prompts/` | Tables keyed by trigger; unknown triggers raise |
| Web | `web/src/lib/live/live-insights.ts`; `components/pitch3d/scene/stage.ts` | S8 calculations; story overlays drawn with `Ribbons` and `Discs` |

**Differences between references:** the web's progressive pass (10 m forward, ending in the other half) differs from
the stats engine's (`pass_difficulty.is_progressive`: open play from x ≥ 35, ending at least 25 % closer to goal). The
web adopts the stats engine's rule so cards and commentary quote the same number.

## 3. Scope and boundaries

| In scope | Outside this proposal / deferred |
|---|---|
| Three triggers and their evidence; per-player aerials won and clearances; a rolling 15-minute pass-pair log | Model prompt tuning beyond the per-trigger rules; Azure deployment (on hold) |
| `CONTRACTS.md` §5, §6, §10.6: triggers, facts, three `visual.component` values, the rival rule | Changing any existing trigger or fact |
| MCP schema; every agent table keyed by trigger; prompts; evaluation labels | New evaluation bench runs on Azure |
| Web: kinds, labels, chart links, the stats engine's progressive rule, the 3D Connections view | Season pages |

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status | How work can continue meanwhile |
|---|---|---|---|---|
| `stats/` | Azeem | Three triggers, evidence, two per-player counts | Agreed (24 Oct, through Arnav) | — |
| `CONTRACTS.md` (hot file) | Azeem (producer), Arnav (consumers) | The new section text | Agreed by both | — |

## 5. Proposed flow

```text
event -> stats state -> triggers: head_to_head | connection | workhorse -> evidence pack -> moments (Cosmos)
      -> agents (spotter, analyst via MCP, narrator, fact-checker, translator, director) -> overlay card
      -> web: commentary strip (kind, label) -> "chart" link scrolls to the Head-to-head / Connections / Engine room card
                                              -> a connection card on screen turns on the 3D Connections view
```

## 6. Technical approach and decision rationale

| Decision | Choice | Reason | Alternative and tradeoff | Status |
|---|---|---|---|---|
| D-01 Roles | GK / defender (CB, LB, RB, LWB, RWB) / midfielder (DM, CM, AM, LM, RM) / forward (LW, RW, ST); unknown → midfielder | Same as the web | Per-position battles: too many moments | Agreed |
| D-02 Role score | Forward: 3·goals + 4·xG + on target + 0.5·shots + 0.5·take-ons won + key passes. Midfielder: 0.05·completed + 0.6·progressive + 1.5·key passes + 0.4·recoveries + 2·goals. Defender: tackles won + interceptions + aerials won + 0.5·clearances + 0.5·recoveries + 0.2·progressive | Same formulas as the web cards | — | Agreed |
| D-03 `head_to_head` | From 20′: in a role, the side whose leader has the higher role score leads the battle when its score is ≥ 3 and ≥ 1.25 × the other leader's. Fires when the leading player differs from the last one announced for that role. Cooldown 15 min per role, per period | A clear swing, not noise | Fire on every lead change: too many | Agreed |
| D-04 The rival | `player_ids` = [the leader, their opposite number]; the second may be on the other team, for this trigger only | The line must be able to name who is being beaten | Facts only, no name: a flat line | Agreed with Arnav |
| D-05 `connection` | On each completed pass and shot: a team's top pair over the last 15 min of the same period (passes + 2·progressive + into final third + 3·passes in moves that ended in a shot), with ≥ 6 passes and (≥ 2 progressive or ≥ 1 shot move). Fires when that pair differs from the last announced for the team. Cooldown 15 min per team, per period; from 10′ of the period | Matches the Connections card | Whole-match pairs: never changes after half time | Agreed |
| D-06 `workhorse` | From 25′: work score = 2·km + 0.5·sprints + 1.5·duels won + recoveries + interceptions + 0.3·pressures, outfield only; the leader must lead the next by ≥ 10 %. Fires when the leader differs from the last announced. Cooldown 15 min, per period. Evaluated on duel, recovery, interception and pressure events | Matches the Engine room card; tracking adds km and sprints when it is there | Fire on frames: moments could not keep stable ids (triggers.md) | Agreed |
| D-07 Priority | All three "normal", after `milestone` in the order; thinned like the comparison triggers when the budget is tight | Goals and chances always win | — | Agreed |
| D-08 Visuals | New `visual.component` values `head_to_head`, `connections`, `engine_room` | Each card links to its own insight card | Reuse `stat_bars` / `pass_network`: the link lands on the wrong chart | Agreed |

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract | Change? | Agreement |
|---|---|---|---|---|
| Evidence pack | Stats → MCP, agents | `CONTRACTS.md` §5, §10.6 | Three triggers, their fact keys, the rival rule | Azeem, Arnav |
| Overlay card | Agents → web | `CONTRACTS.md` §6 | Three `visual.component` values | Arnav |

New facts (all whole numbers unless noted): `player_<m>_match` and `rival_<m>_match` for m in shots,
shots_on_target, xg (xG, 2 decimals), passes_completed, progressive_passes, key_passes, duels_won, interceptions,
recoveries; `pair_passes_last_15min`, `pair_progressive_passes_last_15min`, `pair_final_third_passes_last_15min`,
`pair_shot_moves_last_15min`; `player_distance_km` (km, 1 decimal), `player_sprints_match`, `player_pressures_match`.

## 8. File and specification map

| File or group | Action | Responsibility | Owner |
|---|---|---|---|
| `CONTRACTS.md` | Modify | §5 trigger list and rival rule, §6 visuals, §10.6 | Arnav · Azeem |
| `stats/state.py`, `stats/triggers.py`, `stats/evidence.py` | Modify | Counts, pair log, triggers, packs | Azeem's layer, agreed |
| `stats/tests/test_triggers.py`, `stats/tests/test_evidence.py` | Modify | Tests for the three triggers | — |
| `stats/specs/triggers.md`, `stats/specs/evidence-packs.md`, `stats/agents-guide.md` | Modify | Rules and facts | — |
| `mcp_server/schema.py`, `mcp_server/tests/` | Modify | Triggers, facts, rival rule, tests | Arnav |
| `agents/spotter.py`, `director.py`, `fallbacks.py`, `fact_checker.py`, `analyst.py`, `agents/prompts/*.md`, `agents/evals/recall.py`, `agents/evals/fault_injection.py`, `agents/tests/` | Modify | Every table keyed by trigger, templates, prompts, labels, tests | Arnav |
| `web/src/lib/live/live-insights.ts`, its tests | Modify | Kinds, chart labels, progressive rule | Arnav |
| `web/src/components/match/*` (MatchScreen, LiveInsights, AnalysisPanel if needed) | Modify | Chart links to the insight cards | Arnav |
| `web/src/lib/live/story.ts`, `components/match/PitchOverlay.tsx`, `components/pitch3d/scene/stage.ts`, `components/pitch3d/PitchStage.tsx`, story tests | Modify | The Connections story and its drawing | Arnav |
| `web/specs/screens.md`, `web/specs/pitch.md` | Modify | The new links and view | — |

The exact agent and web files are confirmed while building; any file outside these groups is listed in the handover.

## 9. Failure handling and recovery

A pack that fails validation is rejected exactly as today (the MCP server answers `context_mismatch`, the job falls
back). Unknown triggers still raise in the agents, so a missed table shows up in tests, not at run time.

## 10. Requirements specific to this work

- **Cost:** more moments mean more model calls; the spotter's thinning and the 15-minute cooldowns bound them. Checked
  by counting moments per generated match (target: no more than about 10 new ones a match).
- **Honesty:** every number is a fact from the pack; the rival's name is allowed only because they are in
  `context.players`.

## 11. Acceptance criteria and validation

| ID | Criterion | Method | Evidence |
|---|---|---|---|
| AC-01 | Each trigger fires on hand-made events exactly when its rule says, and not inside its cooldown | `stats` pytest | 5 new tests in `test_triggers.py`; stats 75 passed, 1 skipped |
| AC-02 | Every new pack from a generated match passes `mcp_server/schema.py` | Replay a generated match, validate each moment | 99 of 99 moments from 3 generated matches parse; the fixture's 8 insight moments are tested (`test_real_moments.py`) |
| AC-03 | The fallback template, director visual and fact-checker accept each new trigger | `agents` pytest | `tests/test_insight_moments.py`: every line id of every insight moment passes the numeric and wording checks; agents 205 passed |
| AC-04 | Moments per generated match: each new type fires, new types total ≤ about 10 | Count on 3 generated matches | Seeds 7, 11, 23: 14, 9 and 10 (head-to-head 4–5, connection 4–8, workhorse 1–2); about 11 on average, a little over the target |
| AC-05 | The web links each new card to its insight card and the 3D Connections view draws three pairs with shirt numbers | Web tests, browser check | Story tests; checked in Chromium on a generated replay: the Connections chip draws three pairs with shirt and surname labels, and a head-to-head card's link scrolls to the card and turns it to the leader's role |
| AC-06 | All existing tests in stats, MCP, agents and web still pass | Each package's test command | stats 75 · MCP 151 · agents 205 · web 565 passed; ruff and ESLint clean; typecheck and `next build` pass |

## 12. Delivery milestones

| Milestone | Outcome | Depends on | AC |
|---|---|---|---|
| M1 Contract and stats | Triggers fire with valid packs | — | AC-01, AC-02, AC-04 |
| M2 MCP and agents | Moments flow through to cards | M1 | AC-03 |
| M3 Web and 3D | Cards link; 3D view | M2 | AC-05 |
| M4 Validate | Every suite green | M3 | AC-06 |

## 13. Integration and change management

- **Branch / PR:** folded into the S8 branch `claude/gallant-noether-0jf0ql` at Arnav's request; the contract change
  is its own commit, then one commit per layer.
- **Conflict scan:** 24 Oct at `df2db05`. Open PR #95 (`infra/azure-wave2`) touches `agents/` and `mcp_server/`
  run-time files (relay, MCP fixes). Files edited here are checked against #95's file list before committing;
  overlaps are recorded in the handover.

## 14. Risks and decisions needed

| ID | Risk | Consequence | Owner | Resolution |
|---|---|---|---|---|
| R-01 | Thresholds fire too often or never | Noise, or nothing to narrate | Arnav | Tuned on generated matches (AC-04) |
| R-02 | Overlap with #95 in `agents/` / `mcp_server/` | Merge conflict | Arnav | Checked before commit |

## 15. Review, agreement, and handover

| Reviewer | Version | Finding | Outcome | Date |
|---|---|---|---|---|
| Arnav | 1.0 | Go, with Azeem's approval for `stats/` | Agreed | 24 Oct |

### Handover after implementation

- **Built:** the three triggers and their packs (`stats/`), the contract (`CONTRACTS.md` §5, §6, §10.6), the MCP
  schema, every agent table, the templates, the fact-checker's wording rules, the prompts and the evaluation labels,
  and on the web the kinds, labels, chart links, the stats engine's progressive rule and the 3D Connections view.
- **Tuning (AC-04):** the first connection rule (6 passes, 15-minute cooldown, from 10′) fired 9–12 connections a
  match; it is now 8 passes, a 20-minute cooldown and a full 15-minute window. Head-to-heads fired three at once at
  20′; they are now at least 5 minutes apart.
- **Template fix found in the browser check:** the casual head-to-head line first quoted the first number even when
  it was a tie ("4 duels won to 4"); it now quotes the number the leader leads on most.
- **Fixture decision:** `mcp_server/tests/data/SYN-1017-moments.json` is unchanged. Regenerating it would renumber
  every moment and rewrite about 80 hard-coded ids in the agents' tests, including `agents/tests/test_trigger.py`,
  which open PR #95 also edits. The eight new moments from the same replay are in
  `mcp_server/tests/data/SYN-1017-insight-moments.json`; all 21 older moments come out of the new engine identical
  apart from their ordinals.
- **Files beyond §8's groups:** `web/src/app/globals.css` (the card's ring), `web/src/lib/live/charts.ts` (pass maps
  use the shared progressive rule), `web/src/providers/MatchExperience.tsx` (a connection card drives the story),
  `agents/tests/test_insight_moments.py`, `mcp_server/tests/data/SYN-1017-insight-moments.json`.
- **Not checked:** model-written lines for the new triggers (no model calls in this session; Azure is on hold), a live
  run through the local stack, and replays without tracking beyond the event-only work score.
- **Conflict with #95:** none of the files edited here are in #95's file list.
