# PLAN_web_live-match-viewer — live match screen in Next.js, specs first

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Web · live match screen: scoreboard, event timeline, live pitch and message inspector, fed by the shared envelope |
| Author / primary owner | Vedant |
| Collaborators and responsibilities | None yet |
| Review coordinator | Arnav |
| Affected component owners | Arnav and Pranav (mock stream the screen reads; `.github/` hot files); Azeem (generator that will replace the mock; match setup producer); stats, agents and archiver owners: unassigned (Arnav decides), they only matter once stats panels and overlays are planned |
| Proposal version and date | v0.1 · 2026-10-15 |
| Status | Draft |
| Plan tier and file | Full · `plans/active/PLAN_web_live-match-viewer.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 71ad1ef |
| Architecture box / work area | Layer 7 · web app (live match screen only) |
| Relevant issue, spec PR, or discussion | Specs not agreed yet; the spec PR is M1 of this plan. Reference implementation exists on `origin/vedant/demo-UI` (see §2) |

## 1. Purpose and intended outcome

- **Problem or need:** the web app has to show a match as it happens. Today `web/` is comment-only placeholders and the
  only viewer is the temporary single-match demo in `mock/single-match-demo/`, which is plain HTML and JavaScript, uses
  its own colours, is not keyboard-accessible and is not built on the shared contracts.
- **Proposed outcome:** a Next.js App Router + TypeScript + Tailwind CSS screen at `/match/[id]` that connects to the
  live stream, catches up from a snapshot, validates every message against `CONTRACTS.md`, and shows the scoreboard,
  four counters, an event timeline (one component per row type), a live SVG pitch and a message inspector, with the
  same behaviour as the demo (inventory in §5) and better accessibility and layout.
- **Benefit to viewers or teammates:** every layer gets a real consumer to look at. The team can see the whole
  pipeline working, and later work (overlays, stats panels, replay) plugs into one store and one envelope path.
- **Success statement:** during a full run of `SYN-9001` against the mock stream, `/match/SYN-9001` shows the right
  score, clock, events and positions, survives a server restart without duplicate rows, and passes lint, typecheck,
  build and unit tests.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Placeholder files on `main` | main · 71ad1ef · `web/**` | Comment-only placeholders with headers; no `package.json`, so CI skips the web job |
| Governing specs | `web/specs/design-system.md`, `screens.md`, `charts.md`, `realtime.md` · all `Status: not started` on `main` | Every `_Answer:_` blank is empty. **The spec gate (rule 3) is not met** |
| Existing implementation (not on `main`) | `origin/vedant/demo-UI` · e8ad181 · 81 files, about 7.9k lines added over `main` | Setup, tokens, UI primitives, `contracts.ts`, `api.ts`, store, socket, provider, layout shell and `LiveMatchView`, with 16 test files. It also fills `design-system.md` and `screens.md`. It was written before this plan and before the specs were agreed. Its own notes report passing tests and checks; **none of that has been re-run or reviewed for this plan** |
| Shared contracts | `CONTRACTS.md` v0 §1 (ids, coordinates, time), §2 setup, §3 event, §4 tracking frame, §7 envelope | What the screen validates and renders |
| Mock stream | `mock/README.md` (Arnav), `plans/active/PLAN_mock_live-feed.md` | Source of `status` and `positions` envelopes, snapshot and match-list responses. These shapes are marked **provisional** there, not in `CONTRACTS.md` |
| Demo being rebuilt | `mock/single-match-demo/` (Pranav, `plans/active/PLAN_mock_single-match-demo.md`) | The behaviour inventory in §5 (B1–B17) is read from its `app.js` |
| Generator plan | `plans/active/PLAN_generator_world-builder.md` (Azeem) | Lists the web app as a reader of the match setup only; to be confirmed with Vedant before its M2 merges |

**Differences between references:**
- `web/README.md` says the four specs are agreed before code; the code on `demo-UI` came first. This plan resolves that
  by making the spec PR the first milestone and re-landing the existing code in small PRs afterwards (§12, §13).
- `status` and `positions` envelope payloads, and the snapshot and match-list responses, are defined by the mock, not by
  `CONTRACTS.md` (§9 "Open questions" lists `kind: stats` the same way). The screen validates them strictly anyway;
  whether that is acceptable is a decision for Arnav, Pranav and Azeem (R-01).
- `CONTRACTS.md` §1.1 gives no attack direction for period 5 (shootout). The screen must not guess one.

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| Specs: `design-system.md` (identity, layout, motion, accessibility), `realtime.md` §1–§3, `screens.md` live match screen, `charts.md` `LivePitch` only | Overlays, moment cards, commentary feed, agent trace, the overlay scheduler, audience groups |
| Next.js project setup, design tokens (dark theme only), UI primitives, dev-only kitchen-sink page `/dev/ui` | Stats panels (`kind: stats`), the other seven charts, preferences, player follow |
| `src/lib`: env, contracts (zod, strict), API client, formatting, event descriptions, coordinates, team colours, ring buffer, store, socket | Replay, recap and how-it-works pages; API routes beyond build-safe stubs; real Azure negotiate route |
| Live match screen: shell, scoreboard, metric cards, event timeline, live pitch, message inspector | Light theme and any theme toggle |
| Unit tests for `src/lib` and the provider; tests for the live view | Visual regression tooling; running tests in CI (needs Arnav) |
| Optional match picker at `/` (list from the mock) | Changing `CONTRACTS.md`, the mock, or the generator |

- **Minimum complete result:** M1–M4 plus the live pitch from M5: a full match end to end in English on the live screen.
- **Optional extension:** match picker, frame tweening, copy button, "new items" pill, JSON syntax colours (cut first, §12).
- **Boundary with neighbouring components:** the web app starts at the envelope delivered over Web PubSub (or its mock
  stand-in) and the snapshot response, and ends at pixels. It never computes stats numbers.

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Web specs agreed | Arnav (reviewer) | Review and merge of the spec PR | Pending · **blocks M2–M5 code** | Spec text can be drafted from `demo-UI` |
| Mock stream and Web PubSub stand-in on port 8787 | Arnav, Pranav | Running mock (`mock/README.md`) | Available · needed from M3 | None needed |
| `status` / `positions` / snapshot / match-list shapes | Arnav, Pranav (mock); Azeem (generator, later) | Agreement that the web app may validate them strictly | Pending · M3 | Mark them PROVISIONAL in code and spec |
| Match setup (§2) | Producer: Azeem; consumer: Vedant | Supplied unchanged | Agreed v0 · M3 | Not applicable |
| `.github/workflows/web.yml` (hot, Arnav) | Arnav, told Pranav | Job-level env for the two public variables; optionally an `npm test` step | Pending · M2 | Run `npm test` locally and say so in the PR |
| `web/src/lib/contracts.ts` (hot, once it exists) | Vedant and the owner of each contract mirrored | Notice before merge | Pending · M3 | Not applicable |
| Real Azure Web PubSub and screen relay | Unassigned (Arnav decides) | Real endpoint and negotiate route | Not started · after M5 | Mock stand-in; it does not prove the real integration |

**My owned deliverables:** everything under `web/` listed in §8, and this plan.  
**Shared deliverables:** `.github/workflows/web.yml` change (coordinating owner: Arnav); `contracts.ts` mirror (coordinating owners above).

## 5. Proposed flow

```text
mock stream (:8787)  ── negotiate ──▶ socket.ts ─┐
  Web PubSub stand-in ── envelopes ──▶ (json.webpubsub.azure.v1)
  snapshot endpoint ───────────────▶ api.ts ───┤
                                               ▼
                                   parseEnvelope (zod, strict) ─▶ store.ingest ─▶ dedupe seq ─▶ state
                                                                                      │ publish ≤ 1 per 250 ms
                                                                                      ▼
                          scoreboard · metrics · timeline · live pitch · inspector (React, selector hooks)
```

- **Input arrives through:** a WebSocket on the `match-<id>` group plus one snapshot request per (re)connect.
- **Processing performed here:** validate each message, drop an already-applied `seq`, apply by `kind`, keep two ring
  buffers of 600 rows, publish to React at most every 250 ms, mark the connection stale after 10 s of silence.
- **Output goes to:** the screen only. Nothing is written back to any service.
- **Execution relationship:** the store ingests continuously; React reads through `useSyncExternalStore`. While the user
  has paused the feed, ingestion and the scoreboard continue and the timeline, counters and pitch are frozen.
- **State retained:** in memory only; a page reload starts from a snapshot.

**Behaviour inventory (what the screen must match from the demo):**

| # | Behaviour |
|---|---|
| B1 | Connect to group `match-<id>` using the Web PubSub JSON subprotocol |
| B2 | On open: reset, buffer live messages, fetch the snapshot (7 s timeout), merge by `seq`, ingest in order |
| B3 | Accept only `event`, `positions`, `status` for this `match_id` with an integer `seq`; drop an already-seen `seq` |
| B4 | The clock only moves forward by `match_ms` and displays `clock` |
| B5 | `status` sets the setup (team names, players), score and phase, and adds a "Match state" row |
| B6 | `event` becomes a timeline row with a readable description |
| B7 | `positions` becomes one row per frame; the newest frame drives the pitch |
| B8 | Two ring buffers of 600 rows; the newest 120 of the active filter are shown, newest first |
| B9 | Snapshot rows are "History" (dimmed) and excluded from counters |
| B10 | Counters: messages, live events, frames, last message time, messages in the last 10 s |
| B11 | Publish to React at most every 250 ms, only when something changed |
| B12 | Connected but silent for 10 s: "no recent data" badge and notice |
| B13 | Pause freezes timeline, counters and pitch; reception and scoreboard continue; resume catches up |
| B14 | Selecting a row freezes the inspector on it; "Follow latest" returns to the newest event |
| B15 | On close, reconnect unless the phase is `full_time` |
| B16 | Filters: match events (events and status), tracking, all data |
| B17 | On unmount: close the socket and clear timers; a generation counter ignores stale handlers |

**Intended improvements over the demo:** labels at least 11 px and running text at least 12 px; SVG pitch with
`viewBox="0 0 105 68"` instead of a stretched canvas; team colours from the setup, always with a text label; keyboard
listbox for the timeline; route `/match/[id]` instead of a hard-coded id; dedupe on `seq` alone (it is unique across
kinds); reduced-motion respected.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Framework and styling | Next.js App Router, TypeScript, Tailwind CSS v4 through PostCSS; tokens in CSS `@theme` | Matches `web/README.md` and `CONTRIBUTING.md`; no config file for tokens | Tailwind through the Turbopack loader: less setup, less documented | Proposed · Vedant |
| Theme | Dark only; components use semantic tokens, never raw scale steps or hex | Smaller contrast matrix to verify; a later light theme only adds token values | Dark and light: double the checking in the time available | Proposed · Vedant, for Arnav's review |
| Palette values and text classes | Defined in `web/specs/design-system.md` (spec PR), not repeated here | One place to review colours and contrast | Not applicable | Proposed |
| Validation | `zod` strict objects mirroring `CONTRACTS.md` §2–§4 and §7, with the §3 event rules as refinements; unknown fields rejected; failures counted and logged, never thrown | AGENTS.md rule 9; types derived from schemas cannot disagree with checks | Hand-written guards: more code, easier to drift | Proposed · owners of mirrored contracts told |
| Strictness beyond the contract text | Also checks id formats, 0–100 coordinates, ratings 1–99, style 0–1, goalkeeper first (what the mock's validator checks) | Contract drift fails loudly | Looser schema: silent drift | Unresolved · Arnav, Azeem (R-01) |
| Dedupe key | `seq` only | `seq` is unique per match across kinds (contract rule) | `seq:kind` as in the demo: unnecessary | Proposed |
| Ordering and windows | `match_ms`; `clock` display-only; never infer the half from the minute | AGENTS.md rule 8 | None | Agreed (project rule) |
| Store | Plain TypeScript store outside React, `useSyncExternalStore`, published at most every 250 ms, selector hooks that keep references stable | Cheap ingest at 20×; fewer re-renders | A state library: new dependency | Proposed |
| Transport | Negotiate, then `json.webpubsub.azure.v1`; unwrap group messages to envelopes; the mock already speaks it | Production changes only the URL | Raw socket as in the demo: a second code path | Proposed |
| Negotiate | Browser calls the mock directly now; a route handler in `src/app/api/negotiate` once real Azure is in scope | Managed identity must stay server-side later | Route handler now: extra work for no benefit | Proposed · revisit with Arnav |
| Request headers | No custom headers on browser calls to the mock | A custom header forces a CORS preflight that the mock does not answer | Header plus mock change: touches another owner's code | Proposed |
| Coordinates | Only `src/lib/coordinates.ts` flips frames; tracking (pitch frame) maps straight to SVG (`x × 1.05`, `y × 0.68`); attack direction is `null` for period 5 | AGENTS.md rule 7 | None | Agreed (project rule) |
| Pitch | SVG in metres, light grey pitch with dark markings; kit-coloured markers with a dark outline and the shirt number; motion off under reduced motion | Contrast of kit fills against the pitch is low without an outline | Canvas: no accessibility, distortion | Proposed |
| Lockfile | `web/package-lock.json` not committed (gitignored); CI falls back to `npm install` | Avoids hand-merging a generated file | Commit it: pinned installs but merge pain | Unresolved · Arnav (R-03) |
| Tests | `vitest`; `@types/node` ^22 to match CI's Node 22; env read from `.env.local` or the environment | Fast unit tests on the logic that matters | None needed | Proposed |

**Assumptions:** the mock's snapshot omits old `positions` envelopes so `seq` is not contiguous (the store must sort and
dedupe, never assume +1); the web app reads only the match setup from the generator (confirm with Azeem); Node 22 in CI.

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Envelope `{seq, kind, match_id, match_ms, clock, data}` | Mock (later screen relay) → web | `CONTRACTS.md` §7 | No | Arnav, Pranav · pending notice |
| Match setup, event, tracking frame | Mock (later generator) → web | `CONTRACTS.md` §2–§4 | No | Azeem, Arnav, Pranav · pending notice |
| `status` and `positions` payloads | Mock → web | `mock/README.md` "Provisional choices" | No (consumer only) | Arnav, Pranav, Azeem · pending (R-01) |
| Snapshot and match-list responses, negotiate response | Mock → web | `mock/README.md` | No | Arnav, Pranav · pending |
| Kinds `stats`, `overlay`, `player_tag`, `recap` | Out of scope | `CONTRACTS.md` §6–§7 | No | Accepted by the outer envelope check and ignored, not rejected |

- Required fields, ids, types, units and coordinate frames are exactly those of `CONTRACTS.md` §1–§4. Metres are
  `x × 1.05`, `y × 0.68`; the pitch frame is east right, north up.
- Time: `match_ms` for order and windows; `period` is never inferred; `clock` is display-only.
- `seq` is per match and strictly increasing; delivery is at-least-once, so every `seq` already applied is dropped.
- Unknown fields, missing fields and wrong types are rejected and counted; the inspector footer shows the count.
- Representative input and expected output: recorded mock matches `SYN-9001` to `SYN-9003`. No fixture is committed;
  adding one under `fixtures/` is a hot-folder change and is outside this plan unless the owners agree (R-04).

**Shared contract edits required:** None.  
**Source of truth:** `CONTRACTS.md` v0 for the shared shapes; `mock/README.md` for the provisional ones until
`CONTRACTS.md` defines them.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `web/specs/design-system.md` | Modify (M1) | Answer §1 identity, §3 layout, §4 motion, §5 accessibility, with the contrast table | Itself · all open on `main` | Vedant / Arnav |
| `web/specs/realtime.md` | Modify (M1) | Answer §1 connection, §2 store, §3 catch-up (§4 scheduler and §5 replay stay open) | Itself · all open | Vedant / Arnav |
| `web/specs/screens.md` | Modify (M1) | Answer §1 for the live match screen only | Itself · all open on `main` | Vedant / Arnav |
| `web/specs/charts.md` | Modify (M1) | Shared pitch rules and `LivePitch` only | Itself · all open | Vedant / Arnav |
| `web/package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `eslint.config.mjs`, `vitest.config.mts`, `.env.example`, `.gitignore` | Add (M2) | Project setup and public environment variables (names only) | `design-system.md`, `realtime.md` | Vedant |
| `web/README.md` | Modify (M2, M5) | How to run against the mock; component map | Not applicable | Vedant |
| `web/src/app/layout.tsx`, `globals.css`, `favicon.ico` | Add / modify (M2) | Fonts, tokens, base styles | `design-system.md` §1, §3 | Vedant |
| `web/src/components/ui/*.tsx`, `web/src/app/dev/ui/*` | Add (M2) | UI primitives and a dev-only kitchen-sink page | `design-system.md` §5 | Vedant |
| `web/src/lib/{env,cn,contracts,api,format,describe-event,coordinates,team-colours}.ts` | Add / modify (M2, M3) | Config, class helper, strict contracts, API client, formatting, event text, the one flip helper, kit-colour ink | `realtime.md` §1; `CONTRACTS.md` | Vedant; `contracts.ts` hot |
| `web/src/lib/{ring-buffer,store,store-hooks,socket,announcer}.ts` | Add (M3, M4) | Store, selectors, connection lifecycle, screen-reader announcements | `realtime.md` §2–§3 | Vedant |
| `web/src/lib/__tests__/*` | Add (M2–M5) | Unit tests for the logic above | — | Vedant |
| `web/src/components/live/{MatchStreamProvider,LiveMatchView,LivePositionsPanel}.tsx` | Add (M3–M5) | Provider and screen composition | `screens.md` §1 | Vedant |
| `web/src/components/layout/*.tsx`, `web/src/app/match/[id]/page.tsx`, `web/src/app/page.tsx` | Add / modify (M4) | Shell, header, intro, notice, footer, routing (redirect, later optional picker) | `screens.md` §1 | Vedant |
| `web/src/components/Scoreboard.tsx`, `scoreboard/*`, `metrics/*` | Modify / add (M4) | Scoreboard and four counters | `screens.md` §1 | Vedant |
| `web/src/components/timeline/**` | Add (M4) | Timeline panel; one component per row type and shared cells | `screens.md` §1 | Vedant |
| `web/src/components/charts/LivePitch.tsx`, `charts/pitch/*`, `inspector/*` | Modify / add (M5) | SVG pitch and message inspector | `charts.md` (`LivePitch`) | Vedant |
| `web/src/app/**/route.ts` stubs and other placeholder pages | Modify (M2) | Minimal build-safe exports under their existing headers | Not applicable | Vedant |
| `.github/workflows/web.yml` | Modify (M2, own small commit) | Job-level env for the two public variables; optional `npm test` step | `plans/active/PLAN_ci_pr-checks.md` | Arnav (hot file) |
| `plans/active/PLAN_web_live-match-viewer.md` | Add | This plan | — | Vedant |
| `CommentaryFeed`, `MomentCard`, `AgentTrace`, `ViewerControls`, other charts, `overlay-scheduler.ts`, `preferences.ts`, `visuals.ts`, recap, replay and how-it-works pages | Use unchanged | Out of scope | — | — |

`web/IMPLEMENTATION_PLAN.md` on `vedant/demo-UI` is superseded by this plan and is not added to `main`.

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| Message fails validation (unknown field, bad type) | Counted and logged with kind, `seq` and first issue; never thrown; screen keeps running | Inspector footer shows "N messages rejected" | None | AC-03 |
| Duplicate or replayed `seq` | Dropped | None needed | None | AC-04 |
| Snapshot and live overlap, or snapshot `seq` not contiguous | Merge by `seq`, sort ascending, ingest | None needed | None | AC-04 |
| Snapshot request fails or times out (7 s) | Notice "earlier history is unavailable", continue live | Retried on the next reconnect | History rows missing | AC-05 |
| Stream server stops mid-match | Status "reconnecting"; retry after 3 s, then 6 s, capped at 15 s, with jitter; no retry after `full_time` | Snapshot merged again on reconnect | Viewer sees a notice, then catches up | AC-05 |
| Connected but silent for 10 s | Badge "no recent data" and a notice | Clears on the next message | None | Store test with fake timers |
| Stream unreachable on first load | Readable notice naming how to start the mock; skeletons instead of data | User retries or restarts the mock | None | AC-05 |
| Setup not yet received | "Home team / Away team", "– : –", skeleton bars | Fills in when the setup arrives | None | Component test |
| Period 5 (shootout) | No attack direction is guessed; callers handle `null` | None | Event plotting for period 5 not drawn | Unit test |
| Required environment variable missing or malformed | One readable error listing every problem; app does not start silently | Copy `.env.example` to `.env.local` | CI sets the two public variables | AC-01 |
| Feed paused by the user | Timeline, counters and pitch freeze; scoreboard and connection keep updating | Resume catches up | None | Store test |

## 10. Requirements specific to this work

- **Performance and load:** about 14k messages in a full 20× match; each `positions` message holds 5 frames of 22 players.
  Targets (**unmeasured until tested**): at most one React commit per 250 ms for the timeline, no long task over 50 ms
  during ingest, stable memory over a full match. Measured in Chrome (Performance panel and React Profiler) at 20×.
- **Observability:** connection status badge, rejected-message counter, console warning per rejected kind and `seq`
  (never the negotiate token), counters for messages, events and frames.
- **Azure resources and access:** none created or changed. Public configuration only: `NEXT_PUBLIC_STREAM_BASE_URL` and
  `NEXT_PUBLIC_DEFAULT_MATCH_ID` (URL and id, no secrets). A server-side negotiate route using managed identity is
  deferred.
- **Cost:** not applicable. No paid services; local mock only.
- **Security and data:** every inbound message is validated before use; unknown fields rejected; no secrets in the repo;
  `.env.local` is gitignored; the negotiate token is never logged or rendered.
- **AI behavior:** not applicable. The screen shows only numbers from the stream and never computes stats.
- **Frontend experience:** loading skeletons, empty, stale, reconnecting, finished and error states; keyboard-only use of
  the timeline listbox (roving tabindex, arrows, Enter or Space); one `h1`, panel `h2`s and landmarks; visible focus;
  contrast checked against the table in `design-system.md`; reduced motion honoured; no horizontal scroll at 375, 768
  and 1440 px; touch targets about 44 px on phones.
- **Synthetic data or calculations:** invented clubs and players only (for example `NBR Northbridge FC`,
  `HBA Harbour Athletic`) in UI text, tests and screenshots; no real club, player, crest or league branding.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given a clean checkout and the two env variables, when `npm ci`, lint, typecheck, build and `npm test` run, then all pass; and with a variable missing the app reports every problem at once | Local run, and the same steps in CI | `.env.example` | Command output; CI link |
| AC-02 | Given the agreed specs, when M1 merges, then the four specs state honest `Status` lines and every question the code relies on is answered | Review of the spec PR | Spec PR | Merged PR link |
| AC-03 | Given a recorded mock match, when every envelope is parsed, then none is rejected; given a deliberately broken message (unknown field, missing field, bad id, each §3 rule), then it is rejected with a readable reason and nothing throws | Unit tests plus a one-off run over recorded `SYN-9001`–`SYN-9003` | Mock recorded files (not committed) | Test output; rejected count |
| AC-04 | Given a duplicate `seq`, a non-contiguous snapshot and live messages that overlap it, when ingested, then each `seq` is applied once and rows are in `match_ms`/`seq` order; history rows are excluded from counters | Store tests | None | Test output |
| AC-05 | Given the mock running, when it is stopped mid-match and restarted, then the badge shows reconnecting then live and history merges with no duplicate rows; given the snapshot fails, then the notice appears and live data continues | Manual run against the mock plus socket tests | Running mock (`:8787`) | Screen recording or notes with timestamps |
| AC-06 | Given `SYN-9001` at 20×, when it reaches full time, then the scoreboard, clock, phase and counters match the demo for the same run (about 2,171 events) and the badge shows match finished | Side-by-side run with `mock/single-match-demo` | Running mock | Screenshots at 375 and 1440 px |
| AC-07 | Given a goal, a yellow card and a substitution in `SYN-9001`, when they arrive live, then each row shows its emphasis; the goal flash and announcement fire once and never for snapshot history | Manual run plus component tests; red and second-yellow checked on `/dev/ui` and in a unit test | Running mock | Screenshots; test output |
| AC-08 | Given the timeline, when used with the keyboard only, then every control is reachable, focus is visible, arrows move and Enter or Space selects, and a screen reader reads each row | Keyboard and screen-reader pass | None | Checklist result |
| AC-09 | Given period 1 with home attacking east, when the home left winger (shirt 11) is shown, then the marker is near the top of the pitch; and no coordinate flip exists outside `coordinates.ts` | Unit test and a search of `src/` | None | Test output; search output |
| AC-10 | Given the feed is paused, then the timeline, counters and pitch freeze while the scoreboard continues, and resume catches up; selecting a row freezes the inspector until "Follow latest" | Store tests and manual check | Running mock | Test output; notes |
| AC-11 | Given a 20× run, then there are no long tasks over 50 ms during ingest and at most one timeline commit per 250 ms | Chrome Performance panel and React Profiler | Running mock | Trace screenshots |
| AC-12 | Given widths of 375, 768 and 1440 px, then there is no horizontal scroll and contrast and focus rules in the spec hold | Manual and automated accessibility check | None | Screenshots; audit output |

**Validation limits:** the real screen relay and Azure Web PubSub do not exist yet, so every stream check runs against
the mock's Web PubSub stand-in; this proves the screen against the mock's behaviour, not against Azure. The
provisional shapes stay unverified against any producer other than the mock. CI does not run `npm test` unless Arnav
adds the step. Performance targets are unmeasured until AC-11.

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| M1 — Web specs agreed | Spec-only PR merged with the four specs answered for the live screen | Vedant | Review by Arnav | AC-02 | ½ day · by 16 Oct (estimate) |
| M2 — Foundation | `web/` builds in CI: project setup, tokens, primitives, `/dev/ui` | Vedant | M1 (design-system) | AC-01, AC-12 (primitives) | 1 day · 17 Oct (estimate) |
| M3 — Contracts and realtime | Strict contracts, API client, store, socket, provider; a debug view shows live counters from the mock | Vedant | M1 (realtime); mock running | AC-03, AC-04, AC-05 | 1½ days · 18 Oct (estimate) |
| M4 — Live screen | `/match/SYN-9001` shows shell, scoreboard, counters and the timeline end to end | Vedant | M3, M1 (screens) | AC-06, AC-07, AC-08, AC-10 | 1½ days · 19 Oct (estimate) |
| M5 — Pitch, inspector, polish | Live pitch and inspector, responsive and accessible, README updated | Vedant | M4, M1 (charts) | AC-09, AC-11, AC-12 | 1 day · 20 Oct (estimate) |

- **Project calendar check:** the five milestones end on 20 Oct, which meets "one full match end to end in English by
  20 Oct" only with no slip. Everything beyond the live screen (overlays, moment cards, stats panels, replay, recap,
  how-it-works, audience and language switching) is outside this plan and still has to fit before 24 Oct and the
  25–26 Oct freeze. Flagged in R-05; each needs its own plan.
- **First integration checkpoint:** M3, against the mock's Web PubSub stand-in. **Mocked**, not real Azure.
- **Parallel work:** M2 primitives and `src/lib` pure functions can proceed once M1 is open for review, using the
  agreed contracts; pitch and timeline layout can be developed on `/dev/ui` with hand-written rows.
- **Dependency-bound work:** all code merges wait for the matching spec to merge (spec gate); the screen against real
  Azure waits for the screen relay and Web PubSub resources.
- **Scope reduction if time runs short:** cut first the match picker, frame tweening, copy button, "new items" pill and
  JSON syntax colours; then the inspector's follow mode. The minimum complete result in §3 stays intact.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** one spec PR, then four code PRs, each one layer and small enough to review:

| PR | Milestone | Branch |
|---|---|---|
| 1 | M1 specs only | `web/specs-live-screen` |
| 2 | M2 foundation | `web/setup-and-tokens` |
| 3 | M3 contracts and realtime | `web/realtime-store` |
| 4 | M4 live screen | `web/live-screen` |
| 5 | M5 pitch, inspector, polish | `web/live-pitch-and-polish` |

  The existing work on `vedant/demo-UI` is the source for PRs 2–4 and part of PR 5. It is split into these PRs after
  the spec PR is agreed; it is not opened as one large PR. Each code PR merges `main` in first.
- **Shared-file coordination:** `.github/workflows/web.yml` and `web/src/lib/contracts.ts` are hot files. Each goes in
  its own small commit, with Arnav and Pranav told before the first and the mirrored-contract owners told before the
  second. Lockfiles are never hand-merged; regenerate after merging `main`.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `.github/workflows/web.yml` | `plans/active/PLAN_ci_pr-checks.md` (merged in #9; plan still active) | Arnav | Own small commit in PR 2; Arnav and Pranav told first | Pending |
| `web/src/lib/contracts.ts` (hot, once it exists) | None open | Vedant, plus owners of the contracts mirrored | Own small commit in PR 3; Arnav, Pranav and Azeem told first | Pending |
| `CONTRACTS.md` §2–§4, §7 | `PLAN_generator_world-builder.md` (setup shape unchanged), `PLAN_mock_live-feed.md` | Azeem, Arnav | Read-only for this plan; no edit | Agreed (no change) |
| `mock/single-match-demo/*` | `PLAN_mock_single-match-demo.md` | Pranav | Used unchanged as the behaviour reference; no edit | Agreed (no change) |
| `web/specs/design-system.md`, `screens.md`, `README.md`, `.gitignore` | `origin/vedant/demo-UI` (same author) | Vedant | That branch's text seeds PR 1 and PR 2; the branch is not merged separately | Agreed (same owner) |
| `plans/REGISTRY.md` | None | Arnav | Not touched | Agreed (no change) |

  **Scanned at `71ad1ef` on 2026-10-15. Sources checked: plans ✓ · PRs ✓ (the GitHub API list was read through a
  fetch tool and returned no open PRs; `gh` is not installed here, so this is worth one more look in the web UI) ·
  branches ✓ (`mock/live-viewer` touches only `mock/` and its own plan; `generator/world-spec` touches only
  `generator/specs/world.md`; `vedant/demo-UI` is this plan's own source) · hot files ✓.** No unresolved overlap.
- **Integration procedure:** start the mock (`mock/README.md`), copy `web/.env.example` to `web/.env.local`, run
  `npm ci`, `npm test`, `npm run dev`, open `/match/SYN-9001`. Steps are written into `web/README.md` in M2 and M5.
- **Configuration or setup changes:** two public variables, `NEXT_PUBLIC_STREAM_BASE_URL` and
  `NEXT_PUBLIC_DEFAULT_MATCH_ID` (names only here). `@types/node` ^22.
- **Deployment or data changes, if applicable:** not applicable. Nothing is deployed and no data is stored.
- **Documentation updates:** the four web specs, `web/README.md`, and the `Status` line of each spec. No change to
  `CONTRACTS.md`.

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | The web app validates `status`, `positions`, snapshot and match-list shapes strictly, but only the mock defines them | The screen breaks when the generator or relay sends a different shape | Arnav, Pranav, Azeem | Agree the shapes in `CONTRACTS.md` (separate contract PR) or accept "provisional, may change" | M3 |
| R-02 | Spec gate: the existing code was written before the specs were agreed | PRs 2–5 cannot merge until PR 1 does | Arnav | Review PR 1 first; code PRs follow | M2–M5 |
| R-03 | Lockfile policy (not committed) leaves installs unpinned | Teammates and CI may resolve different versions | Arnav | Keep it gitignored, or commit it and regenerate on merge | M2 |
| R-04 | No committed sample of recorded mock data | Contract checks over real data are one-off, not repeatable in CI | Arnav (owner of `fixtures/`) | Add a small recorded sample to `fixtures/` after the owners agree, or keep checks local | AC-03 repeatability |
| R-05 | Schedule is tight, and overlays, stats panels, replay and recap are outside this plan | A full match works by 20 Oct but required features by 24 Oct are not planned | Vedant, Arnav | Write sprint or full plans for those features right after M3 | Calendar |
| R-06 | CI does not run `npm test` | Test failures are not caught automatically | Arnav | Add one `npm test` step to `web.yml`, or run locally and state it in each PR | None |
| R-07 | Real Azure Web PubSub and the screen relay are not available to test | Real connection unproven | Unassigned (Arnav decides) | Keep `negotiate()` as the single switch point; plan the route handler with the relay | After M5 |

**Decisions requested from Arnav or affected owners:**

1. Whether the spec PR (M1) may be reviewed first, with code PRs held until it merges. Recommendation: yes; it is the
   repository's rule and keeps each code PR small.
2. Whether the screen may validate the mock's provisional shapes strictly, and who writes them into `CONTRACTS.md`.
   Recommendation: keep strict validation and open a contract PR once the generator owner has seen the shapes.
3. `web.yml`: add the job-level environment variables, and optionally an `npm test` step. Recommendation: both, in one
   small commit owned by Arnav.
4. Lockfile policy (R-03). Recommendation: leave it uncommitted for now.

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
| Arnav | v0.1 | Not reviewed yet | Pending | — |

**Implementation readiness:** blocked until the web specs are agreed (M1) and the author says **go**.  
**Relevant specification agreement:** pending (PR 1).  
**Next action and owner:** open PR 1 (specs only) and ask Arnav to review · Vedant.

### Handover after implementation

**Pending implementation.**
