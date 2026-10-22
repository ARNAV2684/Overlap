# PLAN_web_e2e-stats-run — one real local run with the stats engine that closes the web plans' manual checks

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · real end-to-end run on the local stack with the stats consumer: live stats, reload, replay, screenshots, reconnect, keyboard and 20× performance |
| Author / primary owner | Vedant (layer 7, `web/`) |
| Collaborators and responsibilities | None editing. Services run unchanged: Azeem (stats engine `stats/`, generator `generator/`); Arnav, Pranav helping (screen relay and archiver in `functions/` and `archiver/`, Web PubSub stand-in and emulators in `infra/local/`) |
| Review coordinator | Arnav |
| Affected component owners | Azeem (told the result: his panels on screen, and whether the heavy shapes passed the web's strict schema, `PLAN_web_stat-charts` R-01); Arnav (told the result for the relay, archiver and stand-in) |
| Proposal version and date | v0.2 · 23 Oct 2026 (v0.1 → v0.2: Vedant's decisions D-2, D-4, D-7 and go) |
| Status | In progress · go given 23 Oct |
| Plan tier and file | Full · `plans/active/PLAN_web_e2e-stats-run.md` (full because the run spans layers 1–7, though only `web/` and plan files change) |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | `main` · `3353483`. Branch `web/e2e-stats-run` created from `web/realtime-routes` · `e0f12a1` (unmerged, PR not opened), on Vedant's instruction, because the run needs its negotiate and snapshot routes |
| Architecture box / work area | Whole local chain: generator → Event Hubs emulator → stats engine + screen relay + archiver → Cosmos emulator + stand-in → web app |
| Relevant issue, spec PR, or discussion | Open checks in `PLAN_web_stat-charts` AC-07, `PLAN_web_realtime-routes` handover ("the live run did not include the stats engine"), `PLAN_web_live-match-viewer` AC-05, AC-08, AC-11 |

## 1. Purpose and intended outcome

- **Problem or need:** neither the realtime-routes run nor the stat-charts work has run with the stats engine.
  Realtime-routes checked stat panels only from stored data (`SYN-0501`). Stat-charts AC-07 is "Not checked". The live
  screen still has three manual checks open: reconnect after a restart (AC-05), keyboard (AC-08) and performance at
  20× (AC-11).
- **Proposed outcome:** one session on the local Docker stack, with the stats consumer and the archiver running and a
  generator match, gives recorded evidence that:
  1. the match stats on `/match/<id>` update live;
  2. a reload mid-match, and again at full time, brings back the same numbers;
  3. `/replay/<id>` of the same match shows the same full-time numbers;
  4. screenshots at 375 and 1440 px exist for the live and replay screens;
  5. the screen recovers when the stream server is restarted mid-match, is usable from the keyboard, and meets (or
     honestly misses) its 20× performance target.
- **Benefit to viewers or teammates:** the stats engine's output is shown working end to end for the first time. Azeem
  sees his numbers on screen, and three web plans can close their open checks.
- **Success statement:** for one generator match with the stats consumer running, the live stats, the reloaded stats
  and the replay stats agree, the extended `stream.qa.test.ts` passes, and each open check above has a result
  (pass, fail or not checked) recorded with evidence in its own plan.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Web app on this branch | `web/realtime-routes` · `e0f12a1` | Same-origin negotiate and snapshot routes; snapshot keeps every event and status, the latest positions and only the newest and newest-heavy `stats` panels (D-9 B, `CONTRACTS.md` §7.3 sentence waiting for Arnav); stat charts merged from `main` (#77) |
| `web/src/lib/__tests__/stream.qa.test.ts` | `e0f12a1` | Opt-in run against the app's routes until full time; checks events, goals, badge and final score. **Does not check stats** |
| `web/src/lib/__tests__/replay.qa.test.ts` | `e0f12a1` | Opt-in; already counts replayed `stats` panels against the stored ones |
| `web/src/lib/store.ts` | `e0f12a1` | `stats` slice `{ latest, heavy }`, frozen while paused, cleared by `reset()` |
| Stats engine | `stats/main.py live`, `stats/consumer.py`, `stats/publish.py` | Reads both hubs as consumer group `stats`; sends panels to `match-events` as kind `stats`, so the relay forwards them with no extra wiring |
| Screen relay | `functions/screen_relay.py:453` | Saves to Cosmos before sending; a failed send is logged and the browser recovers from the snapshot, so stopping the stand-in mid-match is safe |
| Local run order | `infra/specs/local-development.md` §5 (draft for review) | Stack, stand-in, relay + archiver, stats engine (step 5), generator `live --hubs emulator --speed <n>` |
| Open checks | `PLAN_web_stat-charts` §11 AC-07; `PLAN_web_live-match-viewer` §11 AC-05, AC-08, AC-11; `PLAN_web_realtime-routes` §15 known limitations | What this run must close |

**Differences between references:**
- `local-development.md` §4 still lists the stand-in's `/negotiate` as "used by the browser"; on this branch the
  browser uses the app's `/api/negotiate`. Already on realtime-routes' list to tell Arnav; nothing changes here.
- `PLAN_web_live-match-viewer` AC-05 was written for the mock. The mock is no longer used by `web/`, so the restart is
  done with the stand-in, which plays the same role.
- `stats/pyproject.toml` requires uv ≥ 0.13.4; this laptop has 0.13.1 (same as the realtime-routes run). See D-4.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Running the local chain with the stats consumer and archiver; two generator matches (D-1) | Changing any service: `stats/`, `functions/`, `archiver/`, `generator/`, `infra/` |
| Stats checks added to `stream.qa.test.ts` (D-2) | Fixing anything the run finds: each fix gets its own quick plan, owned by the file's owner |
| Manual checks in Chrome: live stats, reload, replay, screenshots, restart, keyboard, Performance trace | Azure (decision 3 of `PLAN_web_realtime-routes`) |
| Recording results in this plan and in the three plans' handovers | Insights flow and cards (`local-development.md` §5 step 6); live viewer AC-06 side-by-side with the mock demo |
| | Lighthouse audit and 768 px screenshots (live viewer AC-12): optional extension only |

- **Minimum complete result:** one match with the stats consumer, live stats seen updating, the same numbers after a
  reload and on replay at full time, screenshots at 375 and 1440 px, results recorded in `PLAN_web_stat-charts`.
- **Optional extension:** in order: reconnect after restart (AC-05), keyboard (AC-06), 20× trace (AC-07), the
  `stream.qa.test.ts` stats checks (AC-08), Lighthouse and 768 px.
- **Boundary with neighbouring components:** this plan only starts other layers' programs as their READMEs and
  `local-development.md` describe. If one of them misbehaves, the result is written down and its owner told; their
  code is not edited.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| `web/realtime-routes` (base of this branch) | Vedant | Its routes; its PR merges first (§13) | Built, PR not opened · M1 | Run on this branch; merge it in again if it changes |
| Docker emulators, stand-in (`infra/local/`) | Arnav | Run as documented | Exists; ran 23 Oct · M1 | — |
| Screen relay and archiver (`functions/`, `archiver/`) | Arnav | Run as documented | Exist; relay ran 23 Oct; archiver used for replay runs · M1 | — |
| Stats engine (`stats/main.py live`) | Azeem | Run as documented | Exists (S1–S3 merged) · M1 | None: it is the point of this plan |
| Generator live mode (`generator/cli.py live`) | Azeem | One match at 5×, one at 20× | Exists; ran 23 Oct · M2, M3 | — |
| Chrome with DevTools and React Developer Tools; Windows Narrator | Vedant | Screenshots, keyboard, Performance trace | Assumption: available on this laptop · M2, M3 | Record "not checked" for any tool missing |
| `CONTRACTS.md` §7.3 sentence (D-9 B) | Arnav | Agreement on the trimmed snapshot | Pending · not blocking | If Arnav rejects it, AC-02 is re-run once the route sends every panel again |

**My owned deliverables:** everything in §8.  
**Shared deliverables:** none. Results are told to Azeem and Arnav.

Steps that need a person at the browser (screenshots, keyboard, Narrator, Performance trace, reload by eye) are
Vedant's. Starting the stack, running the generator and the QA tests can be done from the terminal.

## 5. Proposed flow

```text
generator live ─▶ Event Hubs emulator ─┬─▶ stats engine (group stats) ──kind=stats──▶ match-events ─┐
                                       ├─▶ screen relay (group relay) ◀───────────────────────────────┘
                                       │      ├─▶ Cosmos `screen` ─▶ /api/match/<id>/snapshot ─┐
                                       │      └─▶ stand-in :8787 ─────────── WebSocket ────────┤
                                       └─▶ archiver (group archiver) ─▶ Cosmos `matches/events/stats` + Azurite
                                                                     └─▶ /api/replay/<id> ──────┤
                                                                                                ▼
                                       Chrome: /match/<id> (live, reload, restart) · /replay/<id> · stream.qa / replay.qa
```

- **Input arrives through:** a generator match on the Event Hubs emulator.
- **Processing performed here:** none new. The web app shows what the chain sends; the QA test compares envelopes.
- **Output goes to:** screenshots, notes, test output, a Performance trace, and the plans' handover sections.
- **Execution relationship:** every service started before the generator; the stats engine before the match so it
  sees kickoff.
- **State retained:** the emulators keep data until `docker compose down`; one clean stack per session.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| D-1 Speeds | Run 1 at 5× (≈ 19 min) for watching, reloads, restart, keyboard and screenshots; Run 2 at 20× (≈ 5 min) for the trace, the QA test and replay | 5× leaves time for manual steps mid-match; AC-11 is defined at 20× | One 20× run: too short for the manual steps | Proposed · Vedant |
| D-2 Proving "same numbers after a reload" | Automated: `stream.qa.test.ts` joins a second client mid-match through the snapshot and checks its `stats` envelopes equal the live client's at the same `seq`, and that both stores end with equal `stats` slices at full time. Run **only in Run 2 (20×)**, together with the replay check, by a separate background agent so other work continues. Manual: two windows side by side, one open since kickoff and one reloaded, plus a reload at full time | Live numbers move every match second, so a screenshot alone can't prove equality mid-match | Screenshots only: weak evidence | **Agreed** · Vedant, 23 Oct |
| D-3 Restart target | Stop and restart the stand-in (the stream server) mid-match in Run 1; restarting `npm run dev` is optional | The stand-in is what the mock was in AC-05; the relay already tolerates it being down | Restart the Cosmos emulator: breaks the relay too | Proposed · Vedant |
| D-4 uv version | Use the existing virtual environments (`.venv`) as on 23 Oct, without `uv sync` | No tooling change on the laptop; the environments ran the same programs yesterday | `uv self update` to ≥ 0.13.4: cleaner, changes the machine | **Agreed** · Vedant, 23 Oct |
| D-5 Where evidence lives | Screenshots and the trace outside the repo, attached to the PR; text results in the plans | The repo tracks no images | Commit images: bloats history | Proposed · Vedant |
| D-7 Where the results land | Merge this branch into `web/realtime-routes` before its PR is opened, so the evidence ships in that PR | One PR with the routes and their real run; no second review | Own PR after realtime-routes merges: smaller PR, later evidence | **Agreed** · Vedant, 23 Oct |
| D-6 When a check fails | Record the failure with evidence and stop that check; any fix becomes a separate plan | Keeps this branch to evidence and one test file | Fix inline: breaks the scope guard and mixes owners | Proposed · Vedant |

**Assumptions:** the heavy panels the stats engine sends today pass the web's strict schema (checked by AC-01: the
inspector's rejected count stays at 0); Chrome and Narrator are available on this laptop.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| `stats` envelope (light + heavy) | Stats engine → relay / archiver → web | `CONTRACTS.md` §7.2, §7.4; `stats/specs/publishing.md` §2 | No (exercised for real for the first time) | Azeem, Arnav · told the result |
| Snapshot (§7.3, trimmed per D-9 B) | Web snapshot route → browser | `CONTRACTS.md` §7.3 on `web/realtime-routes` | No | Arnav · sentence pending in realtime-routes |
| Replay chunks | Archive → replay route → browser | `web/specs/realtime.md` §5 | No | Arnav · none needed |

**Shared contract edits required:** none.  
**Source of truth:** `CONTRACTS.md` §7.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_web_e2e-stats-run.md` | Add | This plan and its results | — | Vedant |
| `web/src/lib/__tests__/stream.qa.test.ts` | Modify | Stats checks (D-2): stats and heavy panels applied, none rejected; a mid-match late joiner's snapshot `stats` envelopes equal the live ones of the same `seq`; equal `stats` slices at full time. Still opt-in (`QA_STREAM=1`) | `web/specs/realtime.md` §6 | Vedant |
| `plans/active/PLAN_web_stat-charts.md` | Modify | AC-07 result and handover; status line | — | Vedant |
| `plans/active/PLAN_web_live-match-viewer.md` | Modify | AC-05, AC-08, AC-11 results (and AC-12 if the optional widths are checked) | — | Vedant |
| `plans/active/PLAN_web_realtime-routes.md` | Modify | Close the "live run did not include the stats engine" limitation; add the browser screenshot for AC-07 | — | Vedant |
| `stats/`, `functions/`, `archiver/`, `generator/`, `infra/local/` | Use unchanged | Run only | Their own specs | Azeem, Arnav |

**Not touched:** `web/AGENTS.md` (untracked, written by `next dev`, not part of this plan), every other `web/` file,
`CONTRACTS.md`, `web/src/lib/contracts.ts`.

## 9. Failure handling and recovery

| Failure or edge case | Expected behaviour | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Stats panels rejected by the strict schema | Inspector's rejected count rises; console names the path | Record the path; tell Azeem (stat-charts R-01); fix in a separate plan | Bars or pitch charts stay empty | AC-01 |
| Stats engine started after kickoff | It misses the opening events or panels | Start it before the generator; if missed, restart the whole run | Wrong or missing early numbers | Run order in M1 |
| Stand-in stopped mid-match | Badge reconnecting; relay logs send failures and keeps saving | Restart the stand-in; the snapshot fills the gap | Notice, then catch-up | AC-05 |
| Archiver not running | `/replay/<id>` has no match or no panels | Start it before the generator; replay checks wait for the next run | Replay check not possible | AC-03, `replay.qa.test.ts` |
| Snapshot over the client's 7 s timeout | "Earlier history is unavailable" | Record the duration; realtime-routes measured 1.3–1.6 s at full time | Reload loses history | AC-02 |
| A tool missing (Narrator, React DevTools) | That check is "not checked" | — | — | Recorded honestly |

## 10. Requirements specific to this work

- **Performance and load:** target from `PLAN_web_live-match-viewer` AC-11 and `PLAN_web_stat-charts` §10: no long
  task over 50 ms during ingest at 20×, at most one timeline commit per 250 ms. Measured with Chrome's Performance
  panel (about 60 s mid-match, CPU throttling off, production build `next start`) and the React Profiler. Unmeasured
  until AC-07.
- **Observability:** the inspector's rejected count, the snapshot route's log line (`N envelopes, R rejected, D ms`),
  relay and stats engine console output.
- **Azure resources and access:** not applicable — local Docker stack only.
- **Cost:** not applicable — no Azure spend.
- **Security and data:** emulator keys referred to by setting name only; screenshots show synthetic clubs only.
- **AI behavior:** not applicable — the insights flow is not started.
- **Frontend experience:** this plan checks it: states while waiting for the first panel, reconnect notices, keyboard
  use, 375 and 1440 px.
- **Synthetic data or calculations:** generator matches only; no numbers computed here.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given Run 1 with the stats consumer, when `/match/<id>` is open from kickoff, then the stat bars change as match seconds pass, the tide and pitch charts change at each whole minute, and the rejected count stays 0 | Watch in Chrome; note match clock and rejected count | Local stack, Run 1 | Screenshots at 375 and 1440 px mid-match; notes |
| AC-02 | Given Run 1 mid-match, when a second window is reloaded, then within the snapshot load it shows the same stat bar numbers as the window open since kickoff; and a reload at full time shows the same final numbers | Two windows side by side; reload at full time | AC-01 | Side-by-side screenshot; full-time screenshots before and after reload; snapshot log line |
| AC-03 | Given the Run 2 match archived, when `/replay/<id>` is played to full time, then its stats equal the live full-time stats; and `replay.qa.test.ts` passes for that match | Manual + `QA_REPLAY=1 QA_REPLAY_MATCH=<id>` | Archiver running | Screenshots at 375 and 1440 px; test output |
| AC-04 | Given 375 and 1440 px, then the live and replay screens show the match stats section with no horizontal scroll | Chrome device toolbar | AC-01, AC-03 | The screenshots above |
| AC-05 | Given Run 1 mid-match, when the stand-in is stopped for about 10 s and restarted, then the badge goes reconnecting → live, the timeline has no duplicate rows, and the stats return to the live numbers | Manual, with timestamps | Run 1 | Notes with times; screenshot after recovery |
| AC-06 | Given the live screen, when used with the keyboard only, then every control is reachable with visible focus, the timeline listbox works with arrows, Home/End and Enter/Space, the chart and team switches work from the keyboard, and Narrator reads a timeline row and a chart's numbers | Keyboard and Narrator pass | Run 1 | Checklist result |
| AC-07 | Given Run 2 at 20× on `next start`, then no long task over 50 ms during ingest and at most one timeline commit per 250 ms | Chrome Performance panel and React Profiler, about 60 s mid-match | Run 2 | Trace screenshots; numbers |
| AC-08 | Given Run 2, when `QA_STREAM=1 QA_MATCHES=<id> npx vitest run src/lib/__tests__/stream.qa.test.ts` runs, then the existing checks and the new stats checks (D-2) pass; and `npm run lint`, `npm run typecheck`, `npm test` still pass | Local run | Run 2 | Command output |
| AC-09 | Each check's result (pass, fail with evidence, or not checked) is written in `PLAN_web_stat-charts` (AC-07), `PLAN_web_live-match-viewer` (AC-05, AC-08, AC-11) and `PLAN_web_realtime-routes` (known limitations) | Review of the diff | AC-01–AC-08 | Plan diffs |

**Validation limits:** local emulators only, not Azure. One laptop and one browser. The trace is one sample. Narrator
is the only screen reader checked. The snapshot rule is the trimmed one (D-9 B) pending Arnav.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Stats checks in the QA test | `stream.qa.test.ts` gains the D-2 checks; lint, typecheck and `npm test` pass (the QA test itself skips without `QA_STREAM`) | Vedant | None | AC-08 (unit side) | 1 h · 23 Oct |
| M2 — Run 1 at 5× | Stack up (`check_stack.py`), stand-in, relay, archiver, stats engine, `next start`, generator 5×; live stats, two-window reload, restart, keyboard, screenshots | Vedant | M1 not required | AC-01, AC-02, AC-04 (live), AC-05, AC-06 | 1½ h · 23–24 Oct |
| M3 — Run 2 at 20× | QA test with stats, Performance trace, full-time reload, replay and `replay.qa.test.ts` | Vedant | M1, M2's stack | AC-03, AC-04 (replay), AC-07, AC-08 | 1 h · 24 Oct |
| M4 — Record and hand over | Results in the four plans; tell Azeem and Arnav; PR after realtime-routes merges | Vedant | M2, M3 | AC-09 | ½ h · 24 Oct |

- **Project calendar check:** fits "every required feature by 24 Oct". Nothing here is a new feature, so it can also
  run during the 25–26 Oct freeze if needed, since it adds checks and records, not product code.
- **First integration checkpoint:** M2, real: every layer from generator to browser, no mock.
- **Parallel work:** M1 can be written while the stack starts.
- **Dependency-bound work:** the PR waits for `web/realtime-routes` to merge (§13).
- **Scope reduction if time runs short:** cut from the end of the optional list: Lighthouse and 768 px, then the QA
  test stats checks (AC-08), then the 20× trace (AC-07), then keyboard (AC-06), then restart (AC-05). Never cut
  AC-01–AC-04: they are stat-charts AC-07.

### Run 1 browser checklist (5×, Vedant at Chrome)

Start the stack as in §13 (or reuse the one Run 2 leaves running), then send one match:
`generator/cli.py live --hubs emulator --speed 5 --first-match <n>` and open `/match/SYN-<n>` before kickoff.

| Step | Do | Record | AC |
|---|---|---|---|
| 1 | Watch the first two match minutes: stat bars move, the tide and pitch charts change at 1:00 and 2:00; inspector rejected count | Clock times, rejected count | AC-01 |
| 2 | DevTools device toolbar at 375 px, then 1440 px, mid-match | Two screenshots, no horizontal scroll | AC-01, AC-04 |
| 3 | Open a second window on the same match, reload it, put both side by side | One screenshot with equal stat bars | AC-02 |
| 4 | Ctrl+C the stand-in, wait about 10 s, start it again | Times of reconnecting and live; no duplicate timeline rows; stats back to live | AC-05 |
| 5 | Keyboard only: Tab through the page; timeline arrows, Home/End, Enter/Space; chart and team switches; then Narrator on one timeline row and one chart | Checklist result, focus always visible | AC-06 |
| 6 | At full time: screenshot, reload, screenshot | Same final numbers | AC-02 |
| 7 | Optional, on a 20× match with `next start`: Performance panel about 60 s mid-match, React Profiler on the timeline | Longest task, commits per 250 ms | AC-07 |

Keep screenshots and the trace outside the repo (D-5); paste the results into §15.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** `web/e2e-stats-run` from `web/realtime-routes` · `e0f12a1`, in about 12 small
  commits (Vedant, 23 Oct): the plan, the QA test step by step, then one commit per plan whose results change. The
  branch is merged into `web/realtime-routes` before that PR is opened (D-7), so there is no separate PR.
- **Shared-file coordination:** no hot file touched.
- **Conflict scan result** (23 Oct, `main` · `3353483`; `git fetch --all`, every local, `origin` and `fork` branch
  diffed against `main` for this file map, active plans read, worktrees checked):

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `web/src/lib/__tests__/stream.qa.test.ts`, `PLAN_web_realtime-routes.md`, `PLAN_web_stat-charts.md` | `web/realtime-routes` (this branch's base; unmerged, no PR) | Vedant | **Merge into it** (D-7) before its PR opens. If realtime-routes changes these files first, merge it into this branch, then merge back | Agreed (same owner) |
| `PLAN_web_live-match-viewer.md` | No other branch or plan changes it | Vedant | — | Clear |
| `stats/`, `functions/`, `archiver/`, `generator/`, `infra/local/` (run, not edited) | `PLAN_stats_engine`, `PLAN_functions_screen-relay`, `PLAN_archiver_archive-flow`, `PLAN_generator_match-engine` | Azeem, Arnav | Read and run only; tell owners the results | Clear |
| `CONTRACTS.md` §7.3 (relied on, not edited) | `PLAN_web_realtime-routes` M4 | Arnav | No edit here; AC-02 re-run if the sentence changes | Pending · Arnav |
| `web/README.md` (not in this file map) | `vedant/web-app`, `fork/vedant/web-app`, `fork/web/live-match-ui-setup` (stale) | Vedant | Not touched | Clear |
| Worktrees `.claude/worktrees/web-stat-charts` (`web/stat-charts` · `9f289e5`), `../overlap-replay-fix` (`web/replay-page` · `119e0aa`) | Both merged into `main` | Vedant | No new work there | Clear |

  **Scanned at `3353483` on 2026-10-23 (base `e0f12a1`). Sources checked: plans ✓ · PRs not checked (`gh` is not
  signed in on this machine; re-check on GitHub before opening the PR) · branches ✓ · hot files ✓.** No unresolved
  overlap.
- **Integration procedure:** `infra/specs/local-development.md` §5 steps 1–3, 5 and 7 (skip step 6, insights), with
  `web/.env.local` from `web/.env.example`, `npm run build && npm start`, open `/match/<id>`.
- **Configuration or setup changes:** none.
- **Deployment or data changes, if applicable:** not applicable.
- **Documentation updates:** the four plans only.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Heavy panel shapes differ from the web schema (`PLAN_web_stat-charts` R-01, unconfirmed by Azeem) | Every heavy panel rejected; pitch charts and tide empty | Azeem | Record the path; separate fix plan (D-6) | AC-01–AC-03 pitch charts |
| R-02 | Branch built on unmerged `web/realtime-routes` | Two branches drift apart | Vedant | Merge into it before its PR (D-7) | M4 |
| R-03 | 20× target missed | AC-11 of the live viewer fails | Vedant | Record numbers; separate performance plan | None |
| R-04 | Arnav rejects the trimmed snapshot (§7.3) | Reload behaviour changes | Arnav | Re-run AC-02 after the change | None now |
| R-05 | Existing `.venv` out of date with a lockfile | A service fails to start | Vedant | Then `uv self update` and `uv sync` (D-4 fallback) | M2 |

**Decisions by Vedant, 23 Oct:**

1. **D-7:** merge into `web/realtime-routes` before its PR is opened. **Agreed.**
2. **D-2:** keep the QA stats checks, run only in the 20× run with replay, by a separate background agent. **Agreed.**
3. **D-4:** existing virtual environments. **Agreed.**

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
| Vedant | v0.1 → v0.2 | Merge into realtime-routes; QA stats checks only at 20× with replay, in a background agent; existing venvs; about 12 short commits | Go given | 23 Oct · this conversation |

**Implementation readiness:** go given 23 Oct with D-2, D-4, D-7.  
**Relevant specification agreement:** no spec changes; relies on `web/specs/realtime.md` §6 as on `web/realtime-routes`.  
**Next action and owner:** M1, then Run 2 in the background, then Run 1 at the browser · Vedant.

### Handover after implementation

Pending implementation.
