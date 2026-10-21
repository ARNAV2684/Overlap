# PLAN_web_replay — replay an archived match in the web app, specs first

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · replay: play a finished, archived match at 1×, 5× and 20× on the live screen's panels, read from the archiver's storage |
| Author / primary owner | Vedant |
| Collaborators and responsibilities | None yet |
| Review coordinator | Arnav |
| Affected component owners | Arnav (archiver: producer of the stored match, `CONTRACTS.md` §4.1, `archiver/specs/storage.md`; Azure resources and roles, A3 / S4; Pranav helping). Azeem (stats engine: its panels are archived and replayed unchanged). Docs and scripts: unassigned (Arnav decides) |
| Proposal version and date | v0.2 · 2026-10-20 (v0.1 same day; see the change note in §12) |
| Status | In progress · Phase 1 (specs) pushed, spec PR not opened yet; Phases 2–4 done, AC-02 passed against a real local archive (22 Oct); Phase 5 (browser checks, docs, handover) next |
| Plan tier and file | Full · `plans/active/PLAN_web_replay.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 36f5d00 |
| Architecture box / work area | Layer 7 · web app (replay route and replay page); reads layer 4 storage written by the archiver (layer 2) |
| Relevant issue, spec PR, or discussion | Archive flow A1 (#33) and A2 merged; stored format `CONTRACTS.md` §4.1; Vedant's approval of the stored format recorded in `PLAN_archiver_archive-flow.md` (20 Oct); knowledge note request ARCH-01 (`docs/knowledge/archiver.md`) |

## 1. Purpose and intended outcome

- **Problem or need:** Event Hubs forgets matches, and the live screen only shows a match while it is streaming. The
  archiver now keeps every match permanently (setup, events, tracking, stat panels), but nothing shows an archived
  match. Judges and the demo video need to watch a finished match on demand.
- **Proposed outcome:** `/replay/<id>` plays a finished archived match at 1×, 5× or 20×, with pause and resume, on the
  same scoreboard, counters, timeline, live pitch and inspector as the live screen. A server route,
  `/api/replay/<id>`, reads the archive and serves it as §7 envelopes, a minute at a time.
- **Benefit to viewers or teammates:** a match can be shown at any time without running the generator, Event Hubs and
  the relay. The archive's round trip gets a visible consumer. Later stats charts and insight cards plug into the same
  store, so replay gets them without extra work.
- **Success statement:** a match archived from a generator run on the local stack plays at 20× on `/replay/<id>` to
  full time with the score equal to the archived `result`, every envelope passes contract validation, and lint,
  typecheck, build and unit tests pass.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Placeholder files | main · 36f5d00 · `web/src/app/api/replay/[id]/route.ts`, `web/src/app/replay/[id]/page.tsx` | Build-safe stubs: the route returns `501`, the page renders nothing. Both headers say "write and agree the spec first" |
| Governing specs | `web/specs/realtime.md` §5 (replay), `web/specs/screens.md` §1 (replay page) | **Not started** on `main`. Spec gate not met: M1 writes them |
| Stored match | `CONTRACTS.md` §4.1; `archiver/specs/storage.md` §1–§3 (agreed, `339b14a`) | Cosmos `live` / `matches`, `events`, `stats`, partition `/match_id`; Blob `tracking/<match_id>/p<period>/m<MMM>.ndjson.gz`; read order; repeated frames possible |
| Archiver reader | `archiver/reader.py`, `event_store.py`, `tracking_chunks.py` | Python reader for the read-back check. Its docstring says the web app's replay route turns the stored match into §7 envelopes. Settings: `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_KEY` (emulator only), `OVERLAP_COSMOS_DATABASE`, `OVERLAP_ARCHIVE_STORAGE` (local), `OVERLAP_ARCHIVE_BLOB_ENDPOINT` (Azure) |
| Envelope and status rules | `CONTRACTS.md` §7, §7.2; `functions/screen_relay.py` | How `status` envelopes follow `PeriodStart`, goal `Shot` and `PeriodEnd`; `positions` bundles of 1–5 frames from one period |
| Live screen | `web/src/lib/store.ts`, `store-hooks.ts`, `contracts.ts`; `web/src/components/live/*` | The store is independent of the socket (`MatchStoreContext`), so a different provider can feed it. `LiveMatchFrame` hard-codes the intro's source card ("Mock WebSocket"), and `Workspace` is not exported |
| Local stack | `infra/specs/local-development.md`; `infra/local/env.example` | Cosmos emulator on `http://localhost:8081`, Azurite, archiver runner `archiver/main.py` |

**Differences between references:**
- The route placeholder says it returns "archived envelopes and stored overlays". Overlays aren't produced or stored
  yet (`CONTRACTS.md` §10 is a proposal), so this plan replays envelopes only.
- `archiver/specs/storage.md` read "draft for review" when this plan was written; it was marked agreed on `main` in
  `339b14a` (R-04 resolved).

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Specs: `realtime.md` §5 (replay route, chunks, envelope building, playback) and `screens.md` §1 (replay page) | Overlays and insight cards in replay (no stored overlays yet); recap page |
| `GET /api/replay/<id>`: a manifest, and one minute of §7 envelopes per request, read from Cosmos and Blob | Replaying a match that is still live; the live screen covers that |
| Server-side storage settings, validated, never sent to the browser | Writing to storage; any change in `archiver/` |
| Replay player: playhead in `match_ms`, 1×/5×/20×, pause and resume, prefetch | Stats charts (`kind: stats` is carried and ignored until the charts plan) |
| `/replay/<id>` page on the live screen's panels, with replay controls | Azure resources, identities and roles (Arnav, A3 / S4) |
| Unit tests; an opt-in test against the local archive | Real Azure run (waits for A3 / S4) |

- **Minimum complete result:** M1–M3. A finished archived match plays from kickoff to full time at 1×, 5× and 20×.
- **Optional extension (cut first):** a jump-to-minute control; a `/replay` list of archived matches and a link to it
  from the match picker.
- **Boundary with neighbouring components:** the web app starts at the stored match as `CONTRACTS.md` §4.1 defines it
  and ends at pixels. It only reads storage and never computes stats numbers.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Web specs agreed | Arnav (reviewer) | Review and merge of the M1 spec PR | Pending · M1 | Not applicable; code waits for it |
| Stored match format | Arnav (archiver) | `CONTRACTS.md` §4.1 and `storage.md` unchanged | Agreed: `storage.md` marked agreed on `main` (`339b14a`), after Vedant's approval on 20 Oct | Build to §4.1 |
| Local archive with a finished match | Arnav (archiver runner), Azeem (generator) | `archiver/main.py` beside the local stack while `generator/cli.py live` plays a match | Available · M2 | Unit tests with hand-made stored data |
| Read access on Azure | Arnav (A3 / S4); web app hosting: unassigned (Arnav decides) | An identity for the web app with read-only data roles on Cosmos `matches`, `events`, `stats` and Blob `tracking`; the two endpoints as settings | Not started · after M3 | Local emulators only; the Azure path stays unproven |
| Lockfile policy | Arnav (R-03 of the live screen plan) | Three new dependencies in `web/package.json` | Unresolved; lockfile still gitignored | Follow the current policy |

**My owned deliverables:** everything under `web/` in §8, and this plan.
**Shared deliverables:** the ARCH-01 status and the frontend note in `docs/knowledge/` (docs: unassigned, Arnav
decides; Pranav maintains the notes).

## 5. Proposed flow

```text
Cosmos matches / events / stats ─┐
Blob tracking/<id>/p<P>/m<MMM> ──┴─▶ GET /api/replay/<id>            (server, Node runtime)
                                       ├─ no chunk: manifest {setup, result, chunks[]}
                                       └─ ?chunk=n: one minute as §7 envelopes, checked with parseEnvelope
                                                     │
                                                     ▼
            replay player (browser): playhead in match_ms × speed ─▶ store.ingest ─▶ same panels as live
                                       prefetches the next 2 chunks
```

- **Input arrives through:** one manifest request, then one request per minute of play, both to the web app's own
  route. The route reads storage with server-side settings.
- **Processing performed here:**
  - **Route:** reads the minute's events, its tracking file and its stat panels. It drops repeated frames, bundles
    frames into `positions` envelopes of up to 5 from one period, and adds `status` envelopes after `PeriodStart`,
    goal `Shot` and `PeriodEnd` events, as the relay does (§7.2). It assigns `seq` and validates every envelope.
  - **Player:** advances a playhead in `match_ms` at the chosen speed and ingests every envelope at or before it.
- **Output goes to:** the screen only.
- **Execution relationship:** the route is stateless per request; finished matches don't change, so it may cache the
  manifest in memory. The player fetches ahead of the playhead, so ingest never waits on the network in normal
  conditions.
- **State retained:** none on the server beyond an in-memory cache; in the browser, the store and playhead for one
  page session.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Where the stored match is read | The Next.js route reads Cosmos and Blob with `@azure/cosmos`, `@azure/storage-blob` and `@azure/identity` (server only) | `storage.md` §3 and `CONTRACTS.md` §4.1 already say the replay route builds envelopes from the stored format; one deployable; no change in `archiver/` | A Python service around `archiver/reader.py`: reuses its code but adds a process to run and host, in another owner's folder | Proposed · Vedant; Arnav told |
| Response shape | A manifest, then one minute per request (`?chunk=<n>`) | A whole match is about 28,500 frames (about 16 MB compressed on Blob, much more as JSON); a minute is about 300 frames | Whole match in one response: slow first paint, high memory. Server streaming: more complex, little gain | Proposed |
| Chunk list | From the match's `PeriodStart` and `PeriodEnd` events: minutes `0 … ⌊period_ms ÷ 60000⌋` of each period, matching the tracking file names | Doesn't depend on listing Blob; a missing tracking file is visible as a chunk without frames | List tracking files: misses minutes with events but no frames | Proposed |
| Which matches | Finished only (`status: "finished"`); a live match returns `409 not_finished` | Live matches have the live screen; the chunk list needs `PeriodEnd` | Replay a live match up to now: more edge cases for no viewer need | Proposed |
| `seq` | `(chunk index + 1) × 100000 + position in chunk`; strictly increasing across the match | Replay is not a Web PubSub group, so §7.1's sender rule doesn't apply. The store still dedupes by `seq`, and a refetched chunk gets the same numbers | A running counter across the match: the route would need every earlier chunk to number one | Proposed · documented in `realtime.md` §5 |
| Order inside a chunk | By `match_ms`, then event, status, stats, positions | A status follows the event that caused it; the timeline orders by `match_ms` anyway | — | Proposed |
| Status envelopes | Built by the route from events, with the running score from earlier goal shots (cached per match); the first chunk starts with a `pre_match` status that carries the setup | The same §7 shapes as live, so the browser has one code path (§7) | Browser derives status: a second, different code path | Proposed |
| Validation | The route runs `parseEnvelope` on everything it builds and reports `rejected: {count, samples}` like the snapshot (§7.3); the browser validates again | Contract drift in stored data fails loudly | Trust storage: silent drift | Proposed |
| Playback | A player outside React: playhead `match_ms` = start + elapsed wall time × speed; ingests in order; prefetches 2 chunks; at the end, status "Match finished" | Same store, same panels; speed changes don't refetch | Re-timing envelopes on the server: couples the route to speed | Proposed |
| Pause | Replay pause stops the playhead. The live screen's "pause feed" (freeze display) stays as it is | Viewers expect video-like pause in replay | Reuse "pause feed": the playhead would race ahead | Proposed |
| Stale badge | The player never calls `store.tick`, so a paused replay never shows "no recent data" | Silence is expected in replay | A replay status in the store: more change to tested code | Proposed |
| Screen frame | `LiveMatchFrame` gets an optional `intro` (default unchanged), and `Workspace` is exported; the replay view composes the same panels with a replay header and controls | Reuse without copying the layout | Copy the frame: two layouts to keep in step | Proposed |
| Settings | Server-only variables with the archiver's names. Missing settings make the route return `503 replay_unavailable`; the rest of the app still starts | Same names everywhere; replay is optional for running the live screen | Fail at startup: breaks the live screen for anyone without storage | Proposed |
| Azure auth | Key only for the local emulator (`OVERLAP_COSMOS_KEY`); otherwise `DefaultAzureCredential` (managed identity), as the archiver does | No secrets in Azure settings | Keys in app settings: against the project rule | Proposed · roles from Arnav |

**Assumptions** (checked in M2):
- Node's gzip reader accepts the multi-member tracking files (`storage.md` §2).
- Cosmos query `ORDER BY c.seq` works with the default indexing in the emulator.
- A minute of positions, gzip-compressed by Next.js, is small enough to fetch ahead at 20× (one minute = 3 s of wall
  time). Measured in AC-07.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Stored match (Cosmos `matches`, `events`, `stats`; Blob `tracking`) | Archiver → replay route | `CONTRACTS.md` §4.1; `archiver/specs/storage.md` §1–§3 | No (read-only consumer) | Arnav · agreed: approved by Vedant 20 Oct, `storage.md` marked agreed (`339b14a`) |
| Stat panel inside stored `stats` documents | Stats engine → archiver → replay route | `CONTRACTS.md` §7.4 | No; forwarded unchanged without the Cosmos `id` and system fields | Azeem, Arnav · no change |
| Envelopes to the browser | Replay route → replay page | `CONTRACTS.md` §7, §7.2 | No; replay uses the same shape (§4.1 says so) | Vedant (both sides) |
| Replay manifest and chunk responses | Replay route → replay page | `web/specs/realtime.md` §5 (M1) | New, web-internal (the web app's own route) | Vedant |

- Envelopes: `seq` per the rule in §6; `match_ms` and `clock` copied from the event, the last frame of a bundle, or the
  panel; `positions` holds 1–5 frames from one period; `status` per §7.2.
- Repeated frames (same `match_ms`) keep the first, as §4.1 says. Events are read in `seq` order; a gap is reported
  in the manifest, not filled.
- Stored documents carry Cosmos fields (`id`, `_rid`, `_ts` and others). The route removes them before validating,
  because the browser's schemas reject unknown fields.
- Representative input and expected output: a match archived from a recorded generator run on the local stack. No
  fixture is committed (`fixtures/` is a hot folder); unit tests use small hand-made stored matches.

**Shared contract edits required:** None.
**Source of truth:** `CONTRACTS.md` §4.1 and §7 for the shared shapes; `web/specs/realtime.md` §5 for the replay
route's own responses.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `plans/active/PLAN_web_replay.md` | Add (M1) | This plan | — | Vedant |
| `web/specs/realtime.md` | Modify (M1) | Answer §5: route, manifest and chunk shapes, `seq` rule, ordering, status building, playback, errors; update the status line | Itself · §5 not started | Vedant / Arnav |
| `web/specs/screens.md` | Modify (M1) | Answer §1 for the replay page: layout, controls, states; update the status line | Itself · replay not started | Vedant / Arnav |
| `web/package.json` | Modify (M2) | Add `@azure/cosmos`, `@azure/storage-blob`, `@azure/identity` | `realtime.md` §5 | Vedant |
| `web/.env.example` | Modify (M2) | Server-only variable names with local defaults (no key value) | `realtime.md` §5 | Vedant |
| `web/src/lib/server/archive-env.ts` | Add (M2) | Read and check the storage settings; never exported to the browser | `realtime.md` §5 | Vedant |
| `web/src/lib/server/archive-store.ts` | Add (M2) | Read the match document, a minute's events and panels, and a tracking file | `realtime.md` §5; `CONTRACTS.md` §4.1 | Vedant |
| `web/src/lib/replay-envelopes.ts` | Add (M2) | Pure: stored pieces → ordered, numbered, validated §7 envelopes; manifest and chunk list | `realtime.md` §5; `CONTRACTS.md` §7.2 | Vedant |
| `web/src/app/api/replay/[id]/route.ts` | Modify (M2) | Manifest and chunk handler, error codes | `realtime.md` §5 | Vedant |
| `web/src/lib/replay-client.ts` | Add (M3) | Browser fetch of manifest and chunks, with timeouts and retries | `realtime.md` §5 | Vedant |
| `web/src/lib/replay-player.ts` | Add (M3) | Playhead, speed, pause, prefetch, end of match | `realtime.md` §5 | Vedant |
| `web/src/components/replay/{ReplayProvider,ReplayMatchView,ReplayControls,ReplayIntro}.tsx` | Add (M3) | Store and player lifetime; screen composition; play/pause, speed and progress; replay intro and source card | `screens.md` §1 | Vedant |
| `web/src/components/live/LiveMatchView.tsx` | Modify (M3) | Optional `intro` on `LiveMatchFrame`; export `Workspace`; optional `header`/`notice`/`intro`/`lead` on `LiveMatchFallback` for the replay fallback. Live screen unchanged | `screens.md` §1 | Vedant |
| `web/src/components/layout/AppHeader.tsx` | Modify (M3) | Optional `section` text on `AppHeaderView` (default "Live stream"), for "/ Replay". Live screen unchanged | `screens.md` §1 | Vedant |
| `web/src/lib/stream-source.ts`, `web/src/components/timeline/cells/ArrivalCell.tsx` | Add / modify (M3) | A stream-source context (default live) so replay rows read "Replay · archive" instead of "Live WebSocket". Live screen unchanged | `realtime.md` §5.2 | Vedant |
| `web/src/app/replay/[id]/page.tsx` | Modify (M3) | Route: id check, not-found, render the replay view | `screens.md` §1 | Vedant |
| `web/src/lib/__tests__/{archive-env,archive-store,replay-envelopes,replay-route,replay-client,replay-player,replay-view}.test.ts`, `replay.qa.test.ts`, `replay-fixtures.ts` | Add (M2, M3) | Unit tests; the `qa` test is opt-in and reads the local archive | `realtime.md` §6 | Vedant |
| `web/README.md` | Modify (M3) | How to archive a match locally and open its replay | — | Vedant |
| `docs/knowledge/frontend.md`, `docs/knowledge/archiver.md` (ARCH-01 status only) | Modify (M3, own commit) | Record the replay boundary and the ARCH-01 result | Knowledge-sharing spec | Docs: unassigned (Arnav decides); Pranav told |
| Optional (M4): `web/src/app/api/replay/route.ts`, `web/src/app/replay/page.tsx`, the match picker's link | Add / modify | List finished archived matches | `screens.md` §1 (to be added in M1 if kept) | Vedant |
| `archiver/**`, `CONTRACTS.md`, `functions/**`, `infra/**` | Use unchanged | Read-only references | — | — |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Bad id (not `SYN-NNNN`) | Page: not-found. Route: `400 bad_match_id` | — | None | Route and page tests |
| Unknown match / no setup yet / still live | `404 not_found` / `503 not_ready` / `409 not_finished`; the page says which in words | User picks another match | None | Route tests (AC-04) |
| Storage settings missing | `503 replay_unavailable`; one server log naming the missing variables (names only) | Copy `web/.env.example` settings | Live screen unaffected | `archive-env` test |
| Storage unreachable or times out (10 s) | `502 storage_error`; no settings or keys in the body or logs | Player retries the chunk 3 times (1 s, 2 s, 4 s), then pauses with "Replay data unavailable" and a Retry button | Viewer sees the notice | Player test with a failing fetch (AC-05) |
| A minute has no tracking file | Chunk carries events and panels only; the pitch keeps the last frame | — | Pitch still for that minute | Builder test |
| Repeated frames or several gzip members | First frame per `match_ms` kept | — | None | Builder test |
| Stored document fails validation | Left out, counted in `rejected`; the inspector footer shows the count | Report as contract drift | Missing rows | Builder test (AC-03) |
| Event `seq` gap in storage | Manifest reports `gaps`; replay continues | Report to the archiver owner | Missing rows | Builder test |
| Viewer leaves or switches match | Player stops, fetches abort, store destroyed | — | None | View test |

## 10. Requirements specific to this work

- **Performance and load:** one match ≈ 2,000 events, ≈ 28,500 frames, ≈ 95 chunks. At 20× the player ingests about
  100 frames per second, the same as live. Targets (**unmeasured until AC-07**): first frame on screen within 3 s of
  opening the page locally; no long task over 50 ms during 20× playback; the next chunk already loaded when the
  playhead reaches it.
- **Observability:** server logs per request: match id, chunk, counts (events, frames, panels, rejected), duration;
  never settings values. The inspector's rejected count; the notice line for fetch failures.
- **Azure resources and access:** none created here. On Azure the web app needs an identity with read-only data roles
  on Cosmos `matches`, `events`, `stats` and Blob `tracking`, and two endpoint settings (Arnav, A3 / S4; hosting
  unassigned, Arnav decides). Variables: `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_DATABASE`,
  `OVERLAP_COSMOS_KEY` (local emulator only), `OVERLAP_ARCHIVE_STORAGE` (local), `OVERLAP_ARCHIVE_BLOB_ENDPOINT`
  (Azure).
- **Cost:** reads only. About 95 chunk requests per full replay, each a small Cosmos query and one Blob read, against
  the shared free-tier throughput (`storage.md` §1). Not measured; a cache per finished match keeps repeat views
  cheap.
- **Security and data:** the id is validated before any query; queries are parameterised and scoped to the match's
  partition; storage settings are server-only (no `NEXT_PUBLIC_` prefix); every envelope is validated before it is
  sent and again in the browser.
- **AI behavior:** not applicable. Replay shows stored numbers only.
- **Frontend experience:** loading skeletons (the live screen's fallback); not found, not finished, unavailable and
  finished states; play/pause and speed as real buttons with visible focus and accessible names ("Play", "Pause",
  "Speed 5×", pressed state); the goal announcement fires as in live; reduced motion honoured; no horizontal scroll
  at 375, 768 and 1440 px.
- **Synthetic data or calculations:** synthetic matches only; replay recomputes nothing except the running score from
  goal shots, the same rule as the relay.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given the M1 PR, when it merges, then `realtime.md` §5 and the replay part of `screens.md` §1 answer every question the code relies on, with honest status lines | Review of the spec PR | — | Merged PR link |
| AC-02 | Given a match archived on the local stack from a generator run, when the manifest and every chunk are fetched, then 0 envelopes are rejected, `seq` strictly increases, the event count equals `result.events`, the frame count equals the archive's after dropping repeats, and the last status's score equals `result.score` | Opt-in `replay.qa.test.ts` against the local emulators (**real archiver data**) | Local stack, `archiver/main.py`, a finished generator match | Test output with the match id |
| AC-03 | Given hand-made stored data, then the builder emits status after `PeriodStart`, goal `Shot` and `PeriodEnd` with the right score and phase; bundles of at most 5 frames from one period; repeats dropped; ties ordered event, status, stats, positions; Cosmos fields stripped; a broken document rejected with a reason | Unit tests | None | Test output |
| AC-04 | Given a bad id, an unknown match, a match without setup, a live match, missing settings and a storage failure, then the route returns 400, 404, 503, 409, 503 and 502 with `{error}` bodies and no setting values | Route tests with a fake store | None | Test output |
| AC-05 | Given a manifest, when playing at 1×, 5× and 20×, then the playhead advances at that rate, only envelopes at or before it are ingested, 2 chunks are prefetched, pause stops it, the end shows "Match finished"; a failing chunk is retried 3 times and then shows the notice and Retry | Player tests with fake timers and a fake client | None | Test output |
| AC-06 | Given the archived match of AC-02, when `/replay/<id>` plays at 20×, then it reaches full time with the archived score, the timeline, counters and pitch move, and the controls work by keyboard | Manual run in Chrome | Local stack | Screenshots at 375 and 1440 px; notes |
| AC-07 | Given the same run, then no long task over 50 ms during playback, and the next chunk is loaded before the playhead reaches it | Chrome Performance panel | Local stack | Trace screenshot |
| AC-08 | Given the live screen's tests, then they still pass with the `LiveMatchFrame` and `Workspace` changes | `npm test`, lint, typecheck, build | None | Command output |

**Validation limits:** everything runs against the local Cosmos emulator and Azurite. The Azure path (managed
identity, roles, network) stays unproven until A3 / S4 exist. Replays of stat panels are carried but not shown until
the charts work lands. CI does not run `npm test` (R-06 of the live screen plan).

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Replay specs agreed | Spec PR with `realtime.md` §5 and the replay page in `screens.md` §1, plus this plan | Vedant | Arnav's review | AC-01 | ½ day · 21 Oct (estimate) |
| M2 — Replay route | `/api/replay/<id>` serves a manifest and chunks from the local archive | Vedant | M1; a match archived locally | AC-02, AC-03, AC-04 | 1 day · 22 Oct (estimate) |
| M3 — Replay page | `/replay/<id>` plays a finished match at 1×, 5×, 20× | Vedant | M2 | AC-05, AC-06, AC-07, AC-08 | 1 day · 23 Oct (estimate) |
| M4 — Optional: find and jump | `/replay` lists finished matches; jump to a minute | Vedant | M3 | Its own tests (added to §11 if kept) | ½ day · 24 Oct, only if M1–M3 are done |

**Implementation phases** (v0.2, at Vedant's request: the milestones above split into five phases; ticked as each task
is done):

**Phase 1 — Specs (M1)**
- [x] Split the plan into five phases; plan v0.2, status In progress (20 Oct)
- [x] `realtime.md` §5 written: route, manifest and chunk shapes, chunk contents, order and `seq`, validation, errors,
      caching, settings (§5.1); player, playhead, speed, pause, prefetch, retries, badge, row source (§5.2); status
      line updated (20 Oct)
- [x] `screens.md` §1 replay screen written: header, intro, controls, notices, error states, accessibility; status
      line updated (20 Oct)
- [x] File map updated for three small additive changes found while writing the specs: `AppHeader.tsx` (`section`
      text), `ArrivalCell.tsx` with a new `stream-source.ts` (row source), and `ReplayIntro.tsx` (20 Oct)
- [x] Specs committed and pushed to `web/replay-spec` (`4edc684`, 21 Oct)
- [ ] Spec PR opened from `web/replay-spec` (no open PR at 21 Oct; the branch's earlier PR #57, the plan, is closed)
- [ ] Spec PR reviewed and merged (AC-01) · Arnav. Code in phases 2–5 can be written meanwhile, but not merged before it

**Phase 2 — Server read path (M2, first half)** · branch `web/replay-route`, stacked on `web/replay-spec`
- [x] `web/package.json`: `@azure/cosmos` 4.10.1, `@azure/storage-blob` 12.34.0, `@azure/identity` 4.13.3, pinned
      exactly (identity 4.14.0 was under two weeks old). `npm audit --omit=dev`: 0 vulnerabilities (21 Oct)
- [x] `web/.env.example`: server-only names with local defaults; the key left empty, pointing to
      `infra/local/env.example` (21 Oct)
- [x] `src/lib/server/archive-env.ts` and `archive-env.test.ts`: settings read, every problem listed by name, values
      never printed, Blob endpoint wins over the connection string as in the archiver (21 Oct)
- [x] `src/lib/server/archive-store.ts` and `archive-store.test.ts`: match document, period markers, goals, event
      `seq`s, a minute's events and panels, a tracking file (404 → none); partition-scoped parameterised queries;
      10 s timeout; failures become `ArchiveStoreError` naming the operation only (21 Oct)
- [x] Multi-member gzip checked: Node's `gunzipSync` reads every member, including a file written by Python's `gzip`
      as the archiver does (21 Oct)
- [x] Checked against the local emulators in Phase 3's AC-02 run: `ORDER BY c.seq` and range queries, the Cosmos
      emulator over `http` with endpoint discovery off, and 103 real tracking files from Azurite (22 Oct)
- [x] Lint, typecheck, all tests (392 passed, 1 opt-in skipped) and build pass (21 Oct). The build doesn't yet load
      the Azure SDKs: no route imports `archive-store.ts` until Phase 3

**Phase 3 — Envelope builder and route (M2, second half)** · branch `web/replay-route`
- [x] `src/lib/replay-envelopes.ts`: manifest and chunk list from the period markers; status after `PeriodStart`,
      goal `Shot` and `PeriodEnd` with the score carried across chunks; frames checked, first kept per `match_ms`,
      bundled by 5; order event (with its status), stats, positions; `seq` `(index + 1) × 100000 + position`;
      Cosmos fields stripped; every envelope checked with `parseEnvelope`, failures counted with up to 5 samples.
      Pure: the same stored match always gives the same envelopes (22 Oct)
- [x] `replay-envelopes.test.ts`, 12 tests on a hand-made stored match (AC-03), with the shared
      `replay-fixtures.ts` (22 Oct)
- [x] `src/app/api/replay/[id]/route.ts`: manifest and `?chunk=`, every error code, index cached per match (20,
      least recently used out), `Cache-Control`, one log line per request, settings never logged (22 Oct)
- [x] `replay-route.test.ts`, 10 tests with a fake store and stubbed Azure SDKs: manifest, chunk, caching, and 400,
      404, 503, 409, 500, 503, 502 and 500 answers without settings in a body or log (AC-04) (22 Oct)
- [x] Spec updated in the same change: `realtime.md` §5.1 gains `archive_invalid` and `internal_error`, and says
      replay covers halves only, as the relay does (22 Oct)
- [x] `replay.qa.test.ts` written: opt-in (`QA_REPLAY=1`, `QA_REPLAY_MATCH`), reads the `OVERLAP_*` settings from
      the shell or `.env.local`. Wiring checked against a closed port: the real route and SDKs answer
      `502 storage_error`, logging the operation only (22 Oct)
- [x] **AC-02 passed against a real local archive** (22 Oct). Local stack in Docker (Event Hubs, Azurite, Cosmos
      emulators), `archiver/main.py` and `stats/main.py live`, then `generator/cli.py live --hubs emulator --speed 20
      --record --first-match 501`: `SYN-0501` CAL v DTN, 6–0, 32,983 messages. The archiver stored 2,363 events,
      30,619 frames and 6,125 panels, 0 invalid. `replay.qa.test.ts`: **103 chunks, 2,363 events, 30,619 frames,
      6,125 panels, 0 rejected, no gaps, `seq` rising, ends `full_time` 6–0**, as archived
- [x] **Fixed, found by that run:** the first run replayed 6,123 of 6,125 panels. The stats engine stamps each
      `PeriodEnd` panel with the next whole second (2,907,000 and 6,124,000 after whistles at 2,906,400 and
      6,123,600), past the chunk's range, so the half-time and full-time panels were dropped; and the player, which
      stops at `duration_ms`, would never have reached the full-time one. Now `panelRange()` runs a period's last
      chunk 999 ms past the whistle, and the player ingests what is left in a chunk once the playhead reaches its end.
      `realtime.md` §5.1 and §5.2 say so; new tests in `replay-envelopes`, `replay-route` and `replay-player`; the
      opt-in test now also checks the panel count against the archive (22 Oct)
- [x] Lint, typecheck, all tests (414 passed, 2 opt-in skipped) and build pass; the build now bundles the Azure
      SDKs into `/api/replay/[id]` (dynamic). Smoke run with `next start`: a bad id → 400 `bad_match_id`, a bad chunk
      → 400 `bad_chunk`, an unreachable archive → 502 `storage_error`, all `no-store`, with one server log line naming
      the operation only (22 Oct)

**Phase 4 — Player and page (M3, first half)** · branch `web/replay-page`, stacked on `web/replay-route`
- [x] `src/lib/replay-client.ts`: same-origin manifest and chunk requests, 10 s timeout, network / timeout /
      aborted / http (with the route's code) / invalid-response errors, every envelope checked again in the browser;
      `replay-client.test.ts`, 7 tests (22 Oct)
- [x] `src/lib/replay-player.ts`: playhead in `match_ms` at 1×/5×/20× (default 20×) on a 100 ms timer; chunks
      ingested in index order; 2 chunks loaded ahead; waits at an unloaded chunk ("Buffering…"); retries a failed
      chunk after 1, 2 and 4 s, then pauses with "Replay data unavailable." until Retry; pause, resume, speed change,
      replay again; never calls `tick()`; generation guard. `replay-player.test.ts`, 11 tests with fake timers
      (AC-05) (22 Oct)
- [x] `stream-source.ts` and `ArrivalCell.tsx` ("Replay · archive"); `AppHeaderView` `section`; `LiveMatchFrame`
      `intro`, exported `Workspace`, and optional `header`/`notice`/`intro`/`lead` on `LiveMatchFallback` so the
      replay fallback reuses it. The live screen's output is unchanged (22 Oct)
- [x] `components/replay/{ReplayProvider,ReplayMatchView,ReplayControls,ReplayIntro}.tsx` and
      `src/app/replay/[id]/page.tsx`: header "/ Replay" with the badge, intro with the final score, toolbar, failure
      cards, Suspense fallback that matches the first render. `replay-view.test.ts`, 10 tests (22 Oct)
- [x] Specs updated in the same change: the playing and can't-be-shown notices (`realtime.md` §5.2,
      `screens.md` §1) (22 Oct)
- [x] Lint, typecheck, build and every test pass, the live screen's included: 442 passed, 2 opt-in skipped (AC-08)
      (22 Oct)
- [x] Smoke run of the built app: `/replay/SYN-0042` serves the replay shell (intro, loading notice, toolbar) with the
      tab title "Overlap · Replay"; a bad id gets the not-found page with `noindex`, as `/match/` does; with no storage
      settings `/api/replay` answers 503 and logs the missing names. Playback in a browser waits for Phase 5 (needs
      an archived match) (22 Oct)

**Phase 5 — End-to-end checks and handover (M3, second half; M4 only if time allows)**
- [ ] Manual 20× replay of an archived match to full time; screenshots at 375 and 1440 px; keyboard pass (AC-06)
- [ ] Chrome Performance trace during 20× playback (AC-07)
- [ ] `web/README.md` replay section; `docs/knowledge/frontend.md` and ARCH-01 in its own commit (Pranav told)
- [ ] Validation report and the handover in §15
- [ ] Optional M4: list of archived matches and jump to a minute

**Change note v0.1 → v0.2 (20 Oct):** added the five phases above. Writing the specs found that the live screen's
header text and the timeline's arrival label are hard-coded, so the file map gains `AppHeader.tsx`, `ArrivalCell.tsx`,
a new `stream-source.ts` and `ReplayIntro.tsx`; all are additive, and the live screen keeps its current text. Every
other decision is unchanged.

- **Project calendar check:** M1–M3 end on 23 Oct, before "every required feature by 24 Oct". This competes with the
  stat charts and insight cards, which still need their own plans (R-05 of the live screen plan). If those come
  first, M3 slips to 24 Oct with no room left for M4.
- **First integration checkpoint:** M2's AC-02, against the **real** archiver writing to the local emulators.
  Not Azure.
- **Parallel work:** `replay-envelopes.ts` and the player are pure and can be written against hand-made data while M1
  is in review, but not merged before it.
- **Dependency-bound work:** AC-02 and AC-06 need a match archived on the local stack; the Azure run needs A3 / S4.
- **Scope reduction if time runs short:** cut M4 first, then the prefetch (fetch one chunk at a time), then speeds
  other than 20×. The minimum stays: a finished match plays to full time.

## 13. Integration and change management

- **Proposed branch / PR boundaries:**

| PR | Milestone | Branch |
|---|---|---|
| 1 | M1 specs and this plan | `web/replay-spec` |
| 2 | M2 route | `web/replay-route` |
| 3 | M3 page (docs notes in their own commit) | `web/replay-page` |

  Each branches from a fresh `main`, after the previous one merges.
- **Shared-file coordination:** no hot file is changed. `docs/knowledge/` edits go in their own commit, and Pranav is
  told. Arnav is told before M2 that the web app reads the archive directly.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| Archived match storage (`CONTRACTS.md` §4.1, `archiver/`) | `PLAN_archiver_archive-flow.md` (A3 next) | Arnav | Read-only consumer; no edit. A3's roles should include read access for the web app on Azure (R-02) | Pending (needs Arnav) |
| `CONTRACTS.md` §7 / §7.4 | `PLAN_stats_engine_S2.md` (#53 merged), `PLAN_functions_screen-relay.md` | Azeem, Arnav | Not edited; replay forwards panels unchanged | Agreed (no shared edit) |
| `web/src/components/live/LiveMatchView.tsx` | `PLAN_web_live-match-viewer.md` (same author; its code is merged) | Vedant | Additive change only; live screen tests rerun (AC-08) | Agreed (same owner) |
| `web/README.md`, `web/.env.example`, `web/package.json` | Branches `fork/vedant/web-app` (17 Oct) and `fork/web/live-match-ui-setup` (16 Oct) | Vedant | Old branches superseded by the merged live screen work; not merged again | Agreed (same owner) |
| `docs/knowledge/frontend.md`, `archiver.md` | `PLAN_docs_knowledge-sharing.md`, `PLAN_docs_graphify-knowledge-map.md` | Docs: unassigned (Arnav decides); Pranav | Own small commit in PR 3, as the knowledge-sharing spec asks | Pending (Pranav told at PR 3) |
| `web/package-lock.json` | — | Arnav (policy, R-03) | Not committed; regenerated, never hand-merged | Agreed (current policy) |

  **Scanned at `36f5d00` on 2026-10-20. Sources checked: plans ✓ · PRs ✓ (GitHub's public API listed no open PRs;
  `gh` is installed but not logged in) · branches ✓ (only the two old fork branches above touch `web/`; none touch
  `archiver/` or `CONTRACTS.md`) · hot files ✓ (none changed).** No unresolved overlap on a file this plan changes.
- **Integration procedure:** start the local stack (`infra/specs/local-development.md`), run `archiver/main.py`, play a
  match with `generator/cli.py live`, wait for full time, set the storage variables in `web/.env.local`, run
  `npm run dev`, open `/replay/<id>`.
- **Configuration or setup changes:** server-only variables `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_DATABASE`,
  `OVERLAP_COSMOS_KEY` (emulator only), `OVERLAP_ARCHIVE_STORAGE`, `OVERLAP_ARCHIVE_BLOB_ENDPOINT`. Names only.
- **Deployment or data changes, if applicable:** not applicable; nothing is deployed and nothing is written.
- **Documentation updates:** `web/specs/realtime.md`, `web/specs/screens.md`, `web/README.md`,
  `docs/knowledge/frontend.md`, ARCH-01 in `docs/knowledge/archiver.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | The web app reads the archiver's containers directly instead of going through an archiver service | Two readers of one format to keep in step (`reader.py` and the route) | Arnav | Accept: §4.1 is the contract both follow; AC-02 compares against the archive | M2 |
| R-02 | No Azure identity, roles or hosting for the web app yet | Replay works locally only for the demo | Arnav (A3 / S4); hosting unassigned (Arnav decides) | Add read roles for the web app to A3; until then, local replay | Azure run only |
| R-03 | A minute of positions is too large to fetch ahead at 20× | Stutter at minute boundaries | Vedant | Measure in AC-07; if needed, a smaller chunk (30 s) or fewer frames per bundle, in a spec update | M3 |
| R-04 | `storage.md` still says "draft for review" | The format could still change under the route | Arnav | **Resolved:** marked agreed on `main` (`339b14a`) | None |
| R-05 | Calendar: replay competes with stat charts and insight cards for 21–24 Oct | One of them slips past 24 Oct | Vedant, Arnav | Agree the order; cut list in §12 | Calendar |

**Decisions requested from Arnav or affected owners:**

1. **R-01:** the replay route reads Cosmos and Blob directly (recommended), rather than a Python service around
   `reader.py`. It keeps one deployable and needs no change in `archiver/`.
2. **R-02:** include read-only roles for the web app (`matches`, `events`, `stats`, `tracking`) in A3, and decide
   where the web app is hosted on Azure.
3. ~~**R-04:** set `archiver/specs/storage.md` to agreed.~~ Done (`339b14a`).
4. **R-05:** the order of replay, stat charts and insight cards before 24 Oct. Recommendation: replay M1–M3 first,
   because its only dependency (the local archive) exists today.

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

**Implementation readiness:** go given by Vedant on 20 Oct. Phase 1 specs written; code merges wait for the spec PR.
**Relevant specification agreement:** pending (the M1 spec PR, not opened yet).
**Next action and owner:** commit and open the spec PR on `web/replay-spec` · Vedant; review · Arnav.

### Handover after implementation

**Pending implementation.**
