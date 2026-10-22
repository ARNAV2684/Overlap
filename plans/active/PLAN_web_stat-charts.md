# PLAN_web_stat-charts — show the stats engine's stat panels on the live and replay screens

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · stat charts: stat bars, momentum tide, pass network, pressing zones and touch zones, fed by the `stats` envelopes the relay and the replay route already send |
| Author / primary owner | Vedant |
| Collaborators and responsibilities | None |
| Review coordinator | Arnav |
| Affected component owners | Azeem (stats engine: producer of the stat panel, `CONTRACTS.md` §7.4, `stats/specs/publishing.md` §2). Arnav (screen relay and archiver forward and store the panels unchanged; `CONTRACTS.md`) |
| Proposal version and date | v0.1 · 2026-10-22 |
| Status | In progress · go given 22 Oct; M1–M4 merged to `main` in PR #77 (23 Oct). M5, the local-stack run (AC-07), is still to do, so it stays in `active/` until that passes |
| Plan tier and file | Full · `plans/active/PLAN_web_stat-charts.md` (full because it touches the hot file `web/src/lib/contracts.ts`) |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 329153d |
| Architecture box / work area | Layer 7 · web app (live match screen and replay screen) |
| Relevant issue, spec PR, or discussion | Panel shape agreed in `PLAN_stats_engine` M1 (Vedant's review, 20 Oct: D-01 and D-02 approved with two changes). Spec PR not opened yet |

## 1. Purpose and intended outcome

- **Problem or need:** the stats engine sends a stat panel every match second and the relay and the replay route
  forward it as a `stats` envelope, but the web app drops it (`store.ts` ignores every kind except `event`,
  `positions` and `status`), and seven of the eight chart files are comment-only placeholders. Viewers see a score
  and a timeline, not the numbers the pipeline computes.
- **Proposed outcome:** the live screen (`/match/[id]`) and the replay screen (`/replay/[id]`) show a "Match stats"
  section: stat bars for both teams (updated every match second), a momentum tide of 5-minute buckets, and one
  pitch panel with a tab for each of pass network, pressing zones and touch zones (updated every match minute and at
  each period end), for either team.
- **Benefit to viewers or teammates:** the stats engine's output becomes visible end to end; Azeem can check his
  numbers on a screen; the charts the agents' cards point to (`visual.chart`) exist for the card work that follows.
- **Success statement:** during a generator match on the local stack, `/match/<id>` shows stat bars equal to the
  latest panel's numbers and the heavy charts equal to the latest panel with `heavy`, and a late joiner sees the same
  after the snapshot; lint, typecheck, build and unit tests pass.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Chart placeholders | main · 329153d · `web/src/components/charts/{StatBars,MomentumTide,PassNetwork,PressingZones,HeatmapZones,ShotMap,KeyEvents}.tsx` | Comment-only; `LivePitch.tsx` is built |
| Store | `web/src/lib/store.ts:513` | `stats` envelopes return `"ignored"` |
| Contracts mirror | `web/src/lib/contracts.ts:305-313` | `stats` passes validation with `data` as a plain object, unchecked |
| Replay | `web/src/lib/replay-envelopes.ts:275` | The replay route already builds `stats` envelopes from archived panels, so replay needs no route change |
| Governing spec | `web/specs/charts.md` · "merged for review in #19; not yet marked agreed" | §1 shared rules answered; §2 only for `LivePitch`; the other seven charts "Not started" |
| Stat panel contract | `CONTRACTS.md` §7.2, §7.4 (agreed in `PLAN_stats_engine` M1); `stats/specs/publishing.md` §2 (agreed); `stats/specs/metrics.md` §4, §6, §7 | Light panel every second; `heavy` every whole minute and at each `PeriodEnd`; `null` plus `low_sample` for small samples |
| Producer code | `stats/publish.py` (`light_panel`), `stats/whole_match.py` (`heavy`), `stats/state.py` (grids) | Exact heavy shapes (below) |
| Snapshot | `CONTRACTS.md` §7.3; `functions/relay_store.py` | The snapshot carries **every** `stats` envelope sent so far |

**Differences between references:**
- `publishing.md` §2 says `players` is "per player, `{player_id, …}`"; the code sends an object keyed by player id
  with `{distance_km, top_speed_kmh, sprints}`. This plan reads the code's shape (and does not render `players`).
- `publishing.md` §2 gives the grids' sizes but not their index order. The code sends `pressing_grid[side][col][row]`
  (9 columns × 6 rows) and `zones[side][channel][col]` (3 channels × 6 columns), both in the team's own frame;
  `metrics.md` §4 confirms `grid[col][row]` for pressing. This plan follows the code and asks Azeem to confirm.
- Vedant's 20 Oct review of `PLAN_stats_engine` asked for `heavy.shots` (per-shot xG) and for the snapshot to keep
  only the latest panel and the latest heavy panel. Neither is on `main`. So the shot map is out of scope here, and
  a late joiner receives every panel so far (about 5,700 at full time); the store keeps only the two it needs.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| A strict `stats` payload schema in `contracts.ts`, mirroring §7.4 and the heavy block as the stats code sends it | Changing `CONTRACTS.md`, the stats engine, the relay or the replay route |
| A `stats` display slice in the store: the latest panel by `match_ms` and the latest panel with `heavy` | `ShotMap` (needs per-shot xG, not in panels) and `KeyEvents` (driven by events, not panels) |
| `StatBars`, `MomentumTide`, `PassNetwork`, `PressingZones`, `HeatmapZones`, and a "Match stats" section composing them on the live and replay screens | Overlay-driven `window` and `highlight` props (they arrive with the card work); the per-player `players` block |
| Specs: `charts.md` §2 for the five charts and §3, `realtime.md` §2 (the slice), `screens.md` (placement) | Real Azure run; snapshot trimming (relay change, Arnav) |
| Unit and component tests | Visual regression tooling |

- **Minimum complete result:** schema, store slice, `StatBars` and `MomentumTide` on both screens.
- **Optional extension:** the pitch panel (pass network, pressing zones, touch zones), in that order. Cut from the end.
- **Boundary with neighbouring components:** the web app starts at the validated `stats` envelope and ends at
  pixels. It never computes a stat: it only scales numbers for drawing and picks which panel is newest.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Stat panel shape (`CONTRACTS.md` §7.4, heavy block) | Azeem (producer) | Confirmation that the heavy shapes and index orders above are the intended contract | Light panel agreed; heavy index order pending · M2 | Build to the code's shape; strict schema makes any drift loud |
| `web/src/lib/contracts.ts` (hot) | Vedant; Azeem and Arnav told | Own small commit adding the `stats` schema | Pending · M2 | — |
| Stats on the local stack | Azeem (stats), Arnav (relay, stand-in, archiver) | Running `stats` consumer so panels reach the stand-in | Available (S2 local runs) · M5 | Unit tests on a panel built from the §7.4 example |
| Specs reviewed | Arnav | Review of the spec changes in this PR | Pending · M1 | Same as the replay and match-list plans: specs change in the same branch, review in the PR |

**My owned deliverables:** everything in §8.  
**Shared deliverables:** the `contracts.ts` commit (Vedant, telling Azeem and Arnav).

## 5. Proposed flow

```text
stats engine ──kind=stats──▶ relay ──stats envelope──▶ socket / snapshot ─┐
archiver (Cosmos stats) ──▶ replay route ──stats envelope──▶ replay player ┤
                                                                         ▼
                 parseEnvelope (statPanelSchema, strict) ─▶ store.ingest ─▶ stats slice {latest, heavy}
                                                                         │ (display slice: frozen while paused)
                                                                         ▼
          StatBars · MomentumTide ← latest + heavy.momentum_buckets      PassNetwork · PressingZones · HeatmapZones ← heavy
```

- **Input arrives through:** `stats` envelopes on `match-<id>` (live), in the snapshot (catch-up), or from the replay player.
- **Processing performed here:** validate; keep the panel with the greatest `match_ms` (envelope order can step back
  between kinds) and, separately, the greatest one with `heavy`; publish at most every 250 ms with the other slices.
- **Output goes to:** the screen only.
- **Execution relationship:** same as the other display slices: ingestion continues while paused, the charts freeze.
- **State retained:** two panel references in memory; `reset()` clears them.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Validation | Strict zod schema for the light panel and the heavy block, metric fields nullable | Same policy as every other kind (R-01 of the live plan); a drifting producer is loud | Loose schema: survives new fields silently but hides drift | Proposed · Vedant |
| Which panel to show | Newest `match_ms` for light; newest `match_ms` among panels with `heavy` for the pitch charts and tide | Heavy fields are cumulative, so the newest heavy panel is complete | Merge buckets across panels: needless, the stats engine already sends all buckets | Proposed · Vedant |
| Momentum tide current bucket | Heavy buckets, with the light panel's `momentum` replacing the bucket it names | Updates every second without waiting a minute | Heavy only: the last bucket lags up to 60 s | Proposed · Vedant |
| Pitch orientation for team-frame charts | Each team drawn attacking left to right (team frame = SVG frame through `teamToPitch(point, true)`), with an "Attacking →" label | Whole-match aggregates span both halves; one direction per chart avoids flipping | Draw in the pitch frame per half: wrong for data that spans both halves | Proposed · Vedant |
| One pitch panel with tabs and a team switch | `SegmentedControl` for chart and team | Three pitch charts × two teams side by side does not fit at 375 px | Six small multiples: unreadable on phones | Proposed · Vedant |
| `low_sample` / `null` | "Not enough data" in place of the value, no bar | `CONTRACTS.md` §7.4: never show as zero | — | Agreed (contract) |

**Assumptions:** heavy shapes and index orders follow `stats/whole_match.py` and `stats/state.py` at 329153d
(checked by a test built from those shapes, and by the M5 local run).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| `stats` envelope `data` | Stats engine → relay / replay route → web | `CONTRACTS.md` §7.2, §7.4; `publishing.md` §2 | No change. The web mirror gains a strict schema | Azeem, Arnav · told in the `contracts.ts` commit and the PR |
| Snapshot `envelopes` | Relay store → web | `CONTRACTS.md` §7.3 | No | Arnav |

- **Fields:** light panel exactly as §7.4; each team row's metrics are `number | null`; `momentum`
  `{period, bucket, home, away}`; `low_sample` a list of paths such as `teams.home.ppda_last_10min`. Heavy:
  `momentum_buckets[]`; `pass_network.{home,away}.{nodes[{player_id,x,y,passes}], links[{from,to,count}]}`;
  `pressing_grid.{home,away}` 9 × 6; `zones.{home,away}` 3 × 6; optional `players`.
- **Time and duplicates:** dedupe on envelope `seq` as today; a re-sent panel for the same second replaces the
  previous one only if its `match_ms` is not older.
- **Invalid data:** an invalid panel is rejected and counted like any other rejected envelope; the charts keep the
  last valid panel.
- **Representative input:** the §7.4 example plus a heavy block from the stats code, in `web/src/lib/__tests__/fixtures.ts`.

**Shared contract edits required:** none.  
**Source of truth:** `CONTRACTS.md` §7.4 and `stats/specs/publishing.md` §2.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_web_stat-charts.md` | Add | This plan | — | Vedant |
| `web/specs/charts.md` | Modify | §2 for the five charts (props, source, interactions, empty state); §3 details on demand; status line | Itself (not agreed) | Vedant · Arnav |
| `web/specs/realtime.md` | Modify | §2: the `stats` slice | Itself (not agreed) | Vedant · Arnav |
| `web/specs/screens.md` | Modify | Live and replay screens: the "Match stats" section | Itself (not agreed) | Vedant · Arnav |
| `web/src/lib/contracts.ts` | Modify (hot, own commit) | `statPanelSchema`, `StatPanel` types; `stats` leaves `IgnoredKind` | `CONTRACTS.md` §7.4 | Vedant · Azeem, Arnav told |
| `web/src/lib/store.ts`, `web/src/lib/store-hooks.ts` | Modify | `stats` display slice and `useStats()` | `realtime.md` §2 | Vedant |
| `web/src/lib/stat-charts.ts` | Add | Pure helpers: bar rows, tide series, grid scaling, network geometry | `charts.md` §2 | Vedant |
| `web/src/components/charts/{StatBars,MomentumTide,PassNetwork,PressingZones,HeatmapZones}.tsx` | Modify (placeholder → component) | The five charts | `charts.md` §2 | Vedant |
| `web/src/components/charts/pitch/GridCells.tsx` | Add | Shaded cells over the pitch, shared by pressing and touch zones | `charts.md` §2 | Vedant |
| `web/src/components/charts/pitch/TeamPitch.tsx` | Add | The pitch frame the three team-frame charts share: surface, markings, label, empty message, "Attacking →" caption | `charts.md` §2 | Vedant |
| `web/src/components/live/MatchStatsSection.tsx` | Add | The section: bars, tide, pitch panel with tabs; a `View` for the fallback | `screens.md` | Vedant |
| `web/src/components/live/LiveMatchView.tsx`, `web/src/components/replay/ReplayMatchView.tsx` | Modify | Place the section (and its empty view in the fallback) | `screens.md` | Vedant |
| `web/src/lib/__tests__/{stat-charts,stat-charts-view}.test.ts` | Add | Helper and component tests | — | Vedant |
| `web/src/lib/__tests__/{contracts,store,fixtures}.ts` | Modify | Panel fixtures; schema and slice tests | — | Vedant |
| `web/src/lib/__tests__/replay-fixtures.ts`, `replay-player.test.ts` | Modify | Their stat panels become complete panels, so the strict schema accepts them in the replay tests | — | Vedant |
| `web/src/lib/__tests__/{live-match-view,replay-view}.test.ts` | Modify | Only if they assert the screen's sections | — | Vedant |
| `web/README.md` | Modify | One line: the charts need the stats consumer running | — | Vedant |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| No stats consumer running | Section shows "Waiting for the first stat panel" | Appears when panels start | None | Component test |
| Before the first heavy panel (first minute) | Bars live; pitch charts and tide say "First update at the end of the first minute" | Next whole minute | None | Component test |
| `null` metric | "Not enough data" for that row, no bar | Next panel | None | Component test |
| Invalid panel | Rejected, counted, logged once (existing path); last valid panel stays | Next valid panel | Inspector's rejected count goes up | Contract test |
| Older panel after a newer one | Ignored for display | — | None | Store test |
| Reconnect | `reset()` clears panels; snapshot refills them | Snapshot | None | Store test |

## 10. Requirements specific to this work

- **Performance and load:** about 1 panel per wall second at 1×, 20 at 20×; a late joiner ingests up to ~5,700 panels
  once. Target (unmeasured): no long task over 50 ms from stats while live at 20×. Charts are memoised on panel identity.
- **Observability:** not applicable — browser only; rejected panels use the existing count and console line.
- **Azure resources and access:** not applicable — no new resource.
- **Cost:** not applicable.
- **Security and data:** strict validation of inbound JSON; nothing rendered as HTML.
- **AI behavior:** not applicable.
- **Frontend experience:** empty, waiting and low-sample states above; every chart an SVG with `role="img"` and an
  `aria-label` giving the numbers; club colour always paired with the club name; tabs keyboard-operable; one column
  below 1000 px; 375, 768 and 1440 px checked.
- **Synthetic data or calculations:** none computed; only scaling for drawing.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given the §7.4 example with a heavy block, `parseEnvelope` accepts it; a missing field, a wrong grid size or an extra field is rejected with a path | `contracts.test.ts` | Panel fixture | Test output |
| AC-02 | Given panels out of order, the slice holds the newest light and newest heavy; paused freezes it; `reset()` clears it | `store.test.ts` | Panel fixture | Test output |
| AC-03 | Stat bars show each team's numbers from the latest panel, "Not enough data" for `null`, and an accessible label with the numbers | Component test | Panel fixture | Test output |
| AC-04 | The tide shows every heavy bucket, with the light panel's bucket replacing its own | `stat-charts.test.ts` | Panel fixture | Test output |
| AC-05 | Pass network, pressing and touch zones draw the selected team's heavy data attacking left to right; empty states before the first heavy panel | Component tests | Panel fixture | Test output |
| AC-06 | Lint, typecheck, build and all unit tests pass | `npm run lint`, `npx tsc --noEmit`, `npm test`, `npm run build` | — | Output |
| AC-07 | **Real connection:** on the local stack with a generator match and the stats consumer, `/match/<id>` shows the section updating every second and the pitch charts every minute; a reload (snapshot) shows the same numbers; `/replay/<id>` of an archived match shows them too | Manual run | Docker, local stack (`infra/local`) | Screenshots at 375 and 1440 px |

**Validation limits:** real Azure is not tested; performance at 20× is checked by eye unless a trace is recorded.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Specs | `charts.md`, `realtime.md`, `screens.md` answered for this scope | Vedant | None | Spec diff in the PR | 22 Oct |
| M2 — Data | Schema and store slice, tested | Vedant | M1 | AC-01, AC-02 | 22 Oct |
| M3 — Bars and tide | `StatBars`, `MomentumTide` and the section on both screens | Vedant | M2 | AC-03, AC-04, AC-06 | 23 Oct |
| M4 — Pitch charts | Pass network, pressing and touch zones in the pitch panel | Vedant | M3 | AC-05, AC-06 | 23 Oct |
| M5 — End to end | Local stack run, screenshots, handover | Vedant | M4; stack running | AC-07 | 23–24 Oct |

- **Project calendar check:** fits "every required feature by 24 Oct".
- **First integration checkpoint:** M5, real (generator → stats → relay → stand-in → browser).
- **Parallel work:** independent of the card work and of the negotiate and snapshot routes.
- **Dependency-bound work:** AC-07 needs the local stack with the stats consumer.
- **Scope reduction if time runs short:** cut M4's charts from the end (touch zones, then pressing, then pass network).

## 13. Integration and change management

- **Proposed branch / PR boundaries:** one PR from `web/stat-charts`: the `contracts.ts` commit on its own, then specs,
  data, charts.
- **Shared-file coordination:** `contracts.ts` in its own commit; tell Azeem and Arnav in the PR.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `web/src/lib/contracts.ts` (hot) | None open | Vedant; Azeem, Arnav told | Own commit | Pending (tell at PR) |
| `CONTRACTS.md` §7.4 | `PLAN_stats_engine` (defines it; no open change) | Azeem | Read only | Agreed (no change) |
| `web/specs/*`, `LiveMatchView.tsx`, `ReplayMatchView.tsx`, `store.ts` | `PLAN_web_live-match-viewer`, `PLAN_web_replay`, `PLAN_web_match-list` (same author; their work on these files is merged) | Vedant | Same owner; merge `main` before the PR | Agreed (same owner) |
| Snapshot `stats` trimming | Vedant's review in `PLAN_stats_engine` (relay change, not started) | Arnav | Independent: the store works with or without it | Agreed (no dependency) |

  **Scanned at `329153d` on 2026-10-22. Sources checked: plans ✓ · PRs not checked (`gh` not logged in here) ·
  branches ✓ (102 local and remote refs; none changes these files relative to `main`) · hot files ✓.** No unresolved
  overlap. Other sessions of the same author may be working in other worktrees; none had committed changes to these
  files at scan time.
- **Integration procedure:** start the local stack with the stats consumer (`infra/specs/local-development.md`), run
  a generator match, `npm run dev`, open `/match/<id>`.
- **Configuration or setup changes:** none.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** the three web specs and `web/README.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Heavy index order or shape differs from what the code sends today, or changes | Charts drawn transposed, or every heavy panel rejected | Azeem | Confirm at PR; the strict schema rejects loudly, the light panel keeps working only if heavy is checked separately (see D2) | M4 |
| R-02 | Spec gate: `charts.md` is not agreed | CI warns; review may ask for changes | Arnav | Specs change in this PR, as for replay and match list | None |
| R-03 | ~5,700 panels in a full-time snapshot | Slow first load for a late joiner | Arnav (relay) | Store keeps two; trimming is the relay follow-up already requested | None |

**Decisions by Vedant (author), 22 Oct:**

1. **Scope:** five charts now; `ShotMap` and `KeyEvents` later (no per-shot xG in panels; key events are not panel
   data). **Agreed** (Vedant).
2. **Invalid heavy block:** reject the whole envelope, like every other kind. **Agreed** (Vedant).
3. **Placement:** a "Match stats" section between the counters and the timeline workspace. **Agreed** (Vedant).

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
| Azeem | v0.1 (heavy shapes, R-01) | — | Pending | — |

**Implementation readiness:** go given by Vedant on 22 Oct, with decisions 1–3.  
**Relevant specification agreement:** pending (specs change in this PR).  
**Next action and owner:** implement M1–M4, then the M5 local run · Vedant.

### Handover after implementation

**Partial (22 Oct): M1–M4 built and committed on `web/stat-charts` (not pushed, no PR yet); M5 not run.**

- **Implementation PR and commit:** none yet. 13 commits on `web/stat-charts` from main · 329153d, `contracts.ts` alone
  in "Validate stat panels in the contracts mirror".
- **Acceptance results** (local, Windows):

| AC | Result | Evidence |
|---|---|---|
| AC-01 | Passed | `contracts.test.ts` "stat panels": light and heavy panels accepted; null metrics, missing and unknown fields, grid sizes, negative counts and player keys checked |
| AC-02 | Passed | `store.test.ts` "stat panels": newest by `match_ms`, late and re-sent panels, history, pause and resume, reset, broken heavy rejected whole |
| AC-03 | Passed | `stat-charts-view.test.ts` (StatBars) and `stat-charts.test.ts` (statRows) |
| AC-04 | Passed | `stat-charts.test.ts` (tideSeries, bucketLabel) |
| AC-05 | Passed | `stat-charts-view.test.ts` (pitch charts, section, fallback) |
| AC-06 | Passed | `npm run lint` clean; `tsc --noEmit` clean; `npm test` 31 files, 498 passed, 2 opt-in skipped; `npm run build` succeeded |
| AC-07 | **Partly** (23 Oct) | Real chain with the stats consumer, `SYN-4402` at 20× (`PLAN_web_e2e-stats-run`): 6,125 panels (104 heavy) sent, every one accepted by the strict schema (0 rejected live, in the snapshot and in replay); a mid-match and a full-time reload through the snapshot gave the same stats as the live client; the replay's final panel equals the live full-time one. **Not yet done:** watching it in the browser and the 375 and 1440 px screenshots (Run 1 checklist in that plan) |

- **Setup and integration instructions:** `web/README.md` (the match stats need the stats consumer on the local stack).
- **Differences from the agreed plan:** `replay-player.test.ts` and `charts/pitch/TeamPitch.tsx` were added to the file
  map during the work (recorded above). Before the first heavy panel the tide shows the current spell from the light
  panel instead of a waiting note (specs updated in the same commit).
- **Known limitations and follow-up owner:** AC-07 browser check and screenshots (Vedant). Azeem to confirm the heavy
  index order (R-01): the real panels of `SYN-4402` passed the strict schema, so the shapes match, but whether the
  charts are transposed is only visible on screen. Arnav and Azeem to be told about `contracts.ts` in the PR. Shot map and key events not started.
