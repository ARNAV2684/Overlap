# PLAN_stats_engine_S2 — live numbers on screen

| Field | Complete this |
|---|---|
| Sprint | S2 — windows, whole-match charts, stat panels once a match second through the relay to browsers and the archive, and `match_state` (work map ST3 + ST4) |
| Parent plan | [`PLAN_stats_engine.md`](PLAN_stats_engine.md) · v0.1 |
| Milestone in parent plan | S2 · AC-05, AC-06 (panels part) |
| Author / owner | Azeem |
| Status | Done, in review (go from Azeem, 2026-10-20) |
| Reviewed branch and commit | main · 0edfc15 (after #51, S1, merged) |
| Planned branch | `stats/live-panels`, from main |

## 1. Outcome

- **What will work at the end of this sprint:** `uv run python main.py live` runs beside the local stack. For a match
  streamed by the generator at 20×:
  - it sends one stat panel per match second on `match-events` (`CONTRACTS.md` §7.4), which the relay forwards to a
    browser socket and the archiver keeps in Cosmos `stats`;
  - it keeps Cosmos `match_state` (§4.2) up to date.

  `main.py replay --panels` writes the same panels for a recorded match, identically every time.
- **Not in this sprint:** triggers, evidence and moments (S3); Azure (S4); charts in the web app (Vedant).

## 2. Preconditions

| Needed before starting | Source | Ready? |
|---|---|---|
| S1 code (state, metrics, consumer, replay) | PR #51 | Yes (merged) |
| Agreed specs: `windows.md`, `metrics.md` §4–§6, `publishing.md` §1–§2; `CONTRACTS.md` §4.2, §7.4 | PR #50 | Yes |
| Relay forwards `kind=stats`; archiver keeps panels | `functions/screen_relay.py`, `archiver/consumer.py` on main | Yes (the relay drops a panel older than its newest one) |
| Local stack: Event Hubs emulator, Azurite, Cosmos emulator (Docker), Web PubSub stand-in, relay, archiver | `infra/specs/local-development.md` §5 | Yes. Docker is started only for the live check (step 7) and shut down afterwards |

## 3. Files

| File | Add / modify | What changes | Governing spec |
|---|---|---|---|
| `stats/state.py` | Modify | Keeps the per-team timelines the windows need (momentum points, shots, passes, pressures, defensive actions), pass-network counts, zones and the pressing grid | `metrics.md` §4–§6 |
| `stats/rolling.py` | Modify | 5- and 10-minute windows within a period, and the last-5-v-previous-10 comparisons | `windows.md` |
| `stats/whole_match.py` | Modify | Pass network (starting XI until the first substitution, links ≥ 3), 18 zones, 9 × 6 pressing grid, momentum buckets | `metrics.md` §5–§6 |
| `stats/publish.py` | Modify | Builds light and heavy panels at whole match seconds; sends them to the hub; writes `match_state` (upsert, every 5 s and at period edges). Senders and stores sit behind small interfaces, with fakes for tests | `publishing.md` §1–§2 |
| `stats/main.py` | Modify | `live` runs both hub readers into the pipeline and the publisher; `replay --panels` writes panels instead of totals | `publishing.md` |
| `stats/consumer.py` | Modify | A run loop for both readers (threads), as the archiver's runner does | `publishing.md` |
| `stats/specs/publishing.md` | Modify | §2: a panel is built on the first **event** at or after each whole second (frames don't trigger panels), so live and replay give the same panels; tracking-only values appear only in the heavy block | itself |
| `stats/tests/test_windows.py`, `test_publish.py` | Add | Windows across a period edge and in stoppage time; comparisons; panel shape against §7.4; one panel per whole second; heavy block every minute and at `PeriodEnd`; `low_sample` nulls; `match_state` cadence; deterministic replay panels | `windows.md`, `publishing.md` |
| `stats/tests/e2e_local.py` | Add | The live check: generator → hubs → stats → relay → stand-in socket, plus Cosmos `stats` and `match_state` (run by hand, like `functions/tests/e2e_local.py`) | `publishing.md` |
| `stats/README.md`, `docs/knowledge/stats-engine.md` | Modify | How to run live; status | — |
| `plans/active/PLAN_stats_engine.md`, this plan | Modify / add | Status, handover | — |

## 4. Steps

1. **Timelines in the state**, plus `rolling.py`, with tests: windows clipped at the period start, stoppage time
   included, a full window needed for comparisons.
2. **Whole-match charts:** pass network, zones, grid and momentum buckets, with tests on hand-made events.
3. **Panels** (`publish.py`), with tests:
   - Light panel fields exactly as `CONTRACTS.md` §7.4, nulls listed in `low_sample`.
   - A panel for every whole second up to the latest event. Seconds with no events still get a panel, built from the
     state before the next event.
   - Heavy block at whole minutes and at `PeriodEnd`.
4. **`match_state`:** upsert every 5 s of match time and at period starts and ends, behind a store interface.
5. **`main.py`:** `replay --panels` and `live` (both readers, publisher, Cosmos and Event Hubs clients from the same
   settings as the archiver). Graceful stop on Ctrl+C.
6. **Spec wording** in `publishing.md` §2 (event-triggered panels).
7. **Live check (AC-05, AC-06):** bring the local stack up and run a full 20× match through the generator, stats,
   relay, stand-in and archiver, then a kill-and-restart run.
   - Measure the event-to-panel latency.
   - Then `docker compose down` and stop everything that was started.
8. **Docs, statuses and handover.**

## 5. Contracts and shared files

- **Contract changes:** none to shapes. `CONTRACTS.md` §7.4 and §4.2 are implemented as agreed. Only the trigger
  wording in `stats/specs/publishing.md` §2 changes: still one panel per match second, now triggered by events.
- **Hot shared files touched:** none.

## 6. Conflict scan

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution | Status |
|---|---|---|---|---|
| `stats/state.py`, `whole_match.py`, `main.py`, `consumer.py`, plans | PR #51 (S1) | Azeem | Merged before this sprint started | Agreed (same owner) |
| `kind=stats` on `match-events`; Cosmos `stats` | `PLAN_functions_screen-relay.md`, `PLAN_archiver_archive-flow.md` | Arnav | Use only, as their specs say; no change on their side | Agreed (no shared edit) |
| Panel consumers | `PLAN_web_live-match-viewer.md` | Vedant | Panels follow §7.4. Tell Vedant the replay runner can write sample panels for his charts | Pending (tell Vedant) |
| `docs/knowledge/stats-engine.md` | `PLAN_docs_graphify-knowledge-map.md`, `PLAN_docs_knowledge-sharing.md` | Pranav | Updated in this PR, as the rule asks | Agreed |
| `plans/active/PLAN_stats_engine*.md` | `PLAN_agents_ai-insights-mcp_S1.md` (#53's scope report) | Pranav | That plan reads the stats plans as its producer's plan and doesn't edit them; panels don't touch the agreed moment handoff | Agreed (no shared edit) |
| `plans/active/` | `PLAN_plans_housekeeping.md` | Arnav | Its edits merged in PR #26. This PR adds a sprint plan and updates its own parent's status | Agreed (no shared edit) |

**Scanned on 2026-10-20** at main `0edfc15`. Sources checked: plans ✓ · PRs ✓ (none open) · branches ✓ (none touch
`stats/`, the relay or the archiver) · hot files ✓ (none touched).

## 7. Acceptance criteria

| ID | Given / when / then | How it is checked | Evidence (after implementation) |
|---|---|---|---|
| S2-AC-01 | Replaying the KES–ORR fixture with `--panels` gives one light panel per whole match second, and heavy blocks at every whole minute and both `PeriodEnd`s; twice gives identical bytes | `test_publish.py` (CI) | Pending implementation |
| S2-AC-02 | Every panel matches `CONTRACTS.md` §7.4: the listed fields only, `match_ms` a whole second, and `null` values listed in `low_sample` | `test_publish.py` (CI) | Pending implementation |
| S2-AC-03 | Windows: a 10-minute window early in the second half covers only the second half; comparisons wait for `period_ms ≥ 15 min` | `test_windows.py` (CI) | Pending implementation |
| AC-05 | In a full 20× match through the local stack, the browser socket receives every panel the engine sent, in `seq` order, and Cosmos `stats` holds them all | `stats/tests/e2e_local.py` | Pending implementation |
| AC-06 (panels) | Killing the engine mid-match and restarting it gives no gap in panels after the restart. Repeated panels are dropped by the relay and overwrite the same archive documents | e2e run with a restart | Pending implementation |
| S2-AC-04 | `match_state` in Cosmos holds the final numbers at full time, with `source.event_seq` = the last event's `seq` | e2e run | Pending implementation |
| S2-AC-05 | Median time from an event entering the hub to its panel leaving the engine, at 20×, is reported (target under 1 s, unmeasured until then) | e2e run | Pending implementation |

**Limits:** Azure is not used (S4). Panels aren't drawn as charts. The heavy block's tracking values (`players`)
depend on frame timing, so they are not part of the byte-identical replay check.

## 8. Risks and decisions needed

| Risk or open decision | Consequence | Who decides | Blocks |
|---|---|---|---|
| Event-triggered panels (spec wording change) | A second with no events gets its panel only when the next event arrives, about 1–3 s of match time later, which is about 0.1 s of wall time at 20× | Azeem, Arnav in review | Step 6 |
| The Cosmos emulator is slow or flaky on this laptop | AC-05 or AC-06 is hard to run | Azeem | Step 7. Fallback: run the e2e without the archiver, and check Cosmos separately |
| Time | Into S3's days | — | **Cut first:** the restart check by hand (keep the idempotency tests), then zones |

## 9. Handover

Branch `stats/live-panels`. 45 tests pass (`pytest` in `stats/`), and `ruff check` is clean. The live checks ran on the
local stack on 2026-10-20. Afterwards Docker was shut down and the emulator images were removed again.

| AC | Result |
|---|---|
| S2-AC-01 | Met. The KES–ORR fixture gives 6,018 panels, one per whole second from 0:00 to 90+6:16, with heavy blocks at every whole minute and both `PeriodEnd`s; byte-identical twice (`test_publish.py`) |
| S2-AC-02 | Met. Every panel has exactly the `CONTRACTS.md` §7.4 fields, `match_ms` is a whole second, and `low_sample` lists exactly the null fields |
| S2-AC-03 | Met. `test_windows.py`: second-half windows exclude the first half, stoppage time counts, comparisons wait for 15 minutes |
| AC-05 | Met (SYN-0505, 20×). All 5,981 panels reached a browser socket through the relay and stand-in, in `seq` order, identical to `replay --panels` of the generator's recording. All 5,981 are in Cosmos `stats` |
| AC-06 (panels) | Met (SYN-0506, engine killed 120 s in and restarted). All 6,002 panels arrived, in order, identical to the replay, with no gap. The new engine waited about 3 minutes for the dead engine's partition claims to expire, then caught up from the match's setup |
| S2-AC-04 | Met in both runs. `match_state` holds `full_time`, and `source.event_seq` = the last event's `seq` |
| S2-AC-05 | Measured: median 0.65 s from an event entering the hub to its panel leaving the engine, 95th percentile 1.7 s (SYN-0505). Target: median under 1 s |

**Found on the live stack and fixed in this PR:**

1. **Panels sent one at a time:** about 2.5 a second against the 20 a 20× match needs, so the engine fell behind.
   `publish.Background` now sends from one worker thread. Panels go in order, packed into as few batches as fit, and
   `match_state` writes are coalesced to the latest document per match.
2. **Events read one at a time:** about 2.5 a second. The consumer now reads in batches (`receive_batch`, up to
   300), as the archiver does.
3. **The emulator throttles bursts** ("server busy, wait 10 seconds"). `EventHubError` does not derive from
   `AzureError` in this SDK, so the error escaped and killed the worker. Sends now catch both and back off 1 s, then
   10 s. The worker and the readers log a failure and carry on.
4. **No way to see progress:** the engine now logs each match's `seq`, queue and sent count every 10 s, and each
   partition it claims or releases. The Azure SDKs' per-request logs are silenced.

**Differences from the plan:**
- Panels are event-triggered, now written in `publishing.md` §2.
- The relay, archiver and stand-in ran from one temporary environment, because `uv` isn't installed on this laptop.

**Not checked:** Azure (S4); charts drawing the panels (Vedant).
