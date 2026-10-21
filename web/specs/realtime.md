# Real-time data spec

> **Status: merged for review in #19 (16 Oct); not yet marked agreed.** Answers §1 (connection), §2 (store), §3
> (catch-up) and adds §6 (testing and checks) for the live match screen. §4 (overlay scheduler) is **not started**.
> §5 (replay) is **written for review** (20 Oct) for [`PLAN_web_replay`](../../plans/active/PLAN_web_replay.md); no
> replay code exists yet. The live screen's code is on `main` (#43, #48). Plan:
> [`PLAN_web_live-match-viewer`](../../plans/active/PLAN_web_live-match-viewer.md). The `status` and `positions`
> payloads and the snapshot shape are now in `CONTRACTS.md` §7.2–§7.3; the match-list and negotiate responses are still
> **provisional**, defined by the mock (`mock/README.md`).

Decides how messages reach the screen and stay in order.

## 1. Connection

- Negotiate flow, groups joined per preference, reconnects.

_Answer:_

- **Transport:** the Azure Web PubSub client protocol `json.webpubsub.azure.v1`. The local mock speaks it too, so
  moving to Azure changes only what `negotiate()` returns. Messages handled: `{type:"system", event:"connected"}` (start
  catch-up), `{type:"ack", ackId, success}` (reply to our `joinGroup`) and `{type:"message", from:"group",
  dataType:"json", data}` (an envelope, `CONTRACTS.md` §7). Anything else is ignored.
- **Negotiate:** `GET <NEXT_PUBLIC_STREAM_BASE_URL>/negotiate?groups=match-<id>` returns `{ baseUrl, url, token }`; the
  browser opens `url` with the subprotocol above. For the mock this is called directly from the browser. For Azure it
  must go through this app's own `src/app/api/negotiate/route.ts` using managed identity, so the access key never
  reaches the browser; `negotiate()` in `src/lib/api.ts` is the single place to switch. The token is never logged or
  rendered. **Not implemented yet:** the route is a build-safe stub that answers `501`.
- **Groups joined:** `match-<id>` only (events, positions, status). Audience groups (`match-<id>-<mode>-<lang>`) and
  player groups are **not joined**: this screen shows no overlays. After the connection is ready the client sends
  `{type:"joinGroup", group, ackId}` and waits up to 3 s for the ack before asking for the snapshot anyway.
- **Request headers:** none added by us. The mock allows any origin but answers no CORS preflight, so a custom header (for
  example `Cache-Control`) would block the call from a browser. If real Azure needs `no-store`, the app's own route sets
  it on the response.
- **Generation guard:** each connection attempt is one generation. Every callback checks its generation is still the
  current one, so a replaced or stopped connection can never write to the store. This also makes React StrictMode's
  double start in development harmless.
- **Lifecycle:** `MatchStreamProvider` (client component) creates the store for a match id, starts the socket in an
  effect and stops it on unmount (closes the socket, clears every timer). `stop()` is safe before `start()` and when
  called twice.
- **Reconnect:** when the socket closes and the phase is not `full_time`, retry after 3 s, then 6 s, 12 s, never more
  than 15 s, plus up to 20 % random jitter; the attempt counter resets once a connection is ready. At `full_time` the
  status becomes `finished` and nothing retries. Each reconnect runs the catch-up of §3 again.
- **Connection status** (shown as a badge with text and icon): `connecting`, `live`, `stale` (connected but silent
  for 10 s), `reconnecting`, `finished`.
- **Accepted kinds:** `event`, `positions`, `status`. The other kinds in `CONTRACTS.md` §7 (`stats`, `overlay`,
  `player_tag`, `recap`) pass the outer envelope check and are ignored, not rejected. An envelope for another
  `match_id` is dropped.

## 2. Store

- Store shape and how each envelope kind updates it; seq dedupe.

_Answer:_

- **A plain TypeScript store outside React** (`src/lib/store.ts`), read through `useSyncExternalStore` with selector
  hooks (`src/lib/store-hooks.ts`). Ingesting is cheap and constant; React is told **at most once every 250 ms**, so a
  20× feed does not re-render per message. Each published slice keeps the same object until its content changes, so a
  component re-renders only when its own data did.
- **Validation first:** every raw message goes through `parseEnvelope` (strict zod schemas in `src/lib/contracts.ts`
  that mirror `CONTRACTS.md` §2–§4 and §7). Unknown fields are rejected. A failing message is **counted** and the first
  five per session are logged to the console (kind, `seq`, first issue); it is never thrown and never stops the stream.
  The rejected count is shown on the screen so contract drift is loud.
- **Dedupe:** the key is `seq` alone (unique per match across kinds). An applied `seq` is dropped. Delivery is
  at-least-once, so duplicates are expected. Dedupe lasts one *session*: `reset()` starts a new session, which a reconnect
  needs because a restarted server counts `seq` from 1 again. A snapshot's `seq` is not contiguous, so nothing assumes
  +1.
- **Time:** ordering and the clock use `match_ms` and arrival order, never the `clock` string. The scoreboard's clock
  only moves forward (it follows the newest `match_ms` seen). `period` is read from the data, never inferred from the
  minute.
- **State:**

  | Slice | Kind | Holds |
  |---|---|---|
  | `connection` | live | status and rejected-message count |
  | `scoreboard` | live | match id, setup, phase, period, score, display clock, `match_ms` |
  | `controls` | live | active filter (`events`, `tracking`, `all`) and `paused` |
  | `notice` | live | one line of text and a tone (`info` or `warning`) |
  | `players` | live | player id to name, shirt, team and side, from the setup |
  | `counters` | display | live messages, events, frames, last-received time, messages in the last 10 s |
  | `timeline` | display | the newest 120 rows for the active filter, newest first |
  | `latestFrame` | display | the newest tracking frame by `match_ms` |
  | `inspector` | display | the selected row, or the newest event while following |

- **Applying a kind:** `status` sets the setup (if present), phase, period and score, and adds a "Match state" row;
  `event` adds a row described by `describeEvent` (readable title, detail, emphasis for goal, cards and substitutions);
  `positions` adds one "Position frame" row per frame in `data.frames` and updates `latestFrame`. A setup that arrives
  after some events re-describes those rows with names. Setup is identified by match id and seed, so the second copy
  (snapshot, then first status) is a no-op.
- **Rows:** two ring buffers of 600 rows (events and status; tracking). History rows (from the snapshot) have
  `received = null`; they are shown dimmed, labelled "History", and **excluded from counters**.
- **Pause:** `live` slices always update. `display` slices freeze while paused (rows that arrive after the pause are
  hidden by a cutoff) and catch up on resume. Pausing publishes everything received so far, then freezes. The notice
  is not overwritten while paused.
- **Selection:** selecting a row freezes the inspector on it; `followLatest()` returns it to the newest event.
- **Stale:** a 1 s timer calls `tick()`; with status `live` and no message for 10 s the status becomes `stale` and the
  notice says how long it has been quiet; the next message returns it to `live`. The "messages in the last 10 seconds"
  count falls as time passes even with no traffic.
- **Constants:** 600 rows per category, 120 shown, 250 ms publish interval, 10 s stale window, 10 s recent window.
- **Notices** (single lines, spoken through the throttled live region in `design-system.md` §5): connecting, loading
  history, connected, history unavailable, cannot reach the server, connection lost, finished, paused, resumed, stale.

## 3. Catch-up

- Snapshot on join, then live; stale-connection fallback to the snapshot API.

_Answer:_

- **On a new connection** (first connect or reconnect): publish status `live` and the "loading history" notice, `reset()`
  the store (a new session), join the match group, then read the snapshot while holding back live messages in a buffer.
  Joining first means anything published after the join is buffered and anything before it is in the snapshot.
- **Snapshot:** `GET /api/match/<id>/snapshot` with a 7 s timeout. The response is
  `{ match_id, setup, status, envelopes, rejected: { count, samples } }`. Each envelope is validated; one bad envelope is
  counted and skipped instead of discarding the whole catch-up.
- **Merge:** snapshot entries (`received = null`) and buffered live entries are merged by `seq`; where a `seq` is in both,
  the live copy wins. They are then ingested in ascending `seq`. After the merge the buffer is released and later
  messages are ingested directly.
- **If the snapshot fails** (error, timeout, invalid response): log it, continue with live messages only, and show
  "Earlier history is unavailable. New live messages will still appear." A new snapshot is merged again on the next
  reconnect; the `seq` dedupe makes that safe.
- **If the stream is unreachable** on first load: "Cannot reach the stream server. Is it running?", then the retry
  schedule in §1.
- **Stale-connection fallback to the snapshot API** (the spec's original wording) is **not decided**: today a stale
  connection only shows the stale badge and notice, and the snapshot is re-read on reconnect. Open question for review.
- **Errors from `api.ts`** are typed: `network`, `timeout`, `aborted` (not shown), `http` (with status) and
  `invalid-response` (contract drift).
- **Findings from the mock:** the snapshot omits old `positions` envelopes, so its `seq` is not contiguous (one run: 635
  envelopes spanning `seq` 1 to 2212). The store must sort and dedupe, never assume +1.

## 4. Overlay scheduler

- Timing by `show_at_ms`, priority and how pile-ups are avoided.

_Answer:_

Not started. Out of scope for the live match screen (the mock sends no overlays).

## 5. Replay

- How replay files drive the same store at 1×, 5× and 20×.

_Answer:_

Plan: [`PLAN_web_replay`](../../plans/active/PLAN_web_replay.md). Replay plays a **finished** match from the archiver's
storage (`CONTRACTS.md` §4.1, `archiver/specs/storage.md` §3) through the same store and panels as the live screen.
The web app's own route reads storage on the server and sends §7 envelopes, a minute at a time; a player in the
browser releases them at the chosen speed.

### 5.1 Route `GET /api/replay/<id>`

- **Runtime:** a Node.js route handler, always dynamic. It only reads storage. Settings are server-only (no
  `NEXT_PUBLIC_` prefix) and never appear in a response or a log line.
- **Manifest** (no `chunk` parameter):

  ```json
  { "match_id": "SYN-0505", "status": "finished", "setup": { },
    "result": { "score": { "home": 2, "away": 1 }, "events": 2171 },
    "periods": [ { "period": 1, "start_ms": 0, "end_ms": 2820000, "end_period_ms": 2820000 },
                 { "period": 2, "start_ms": 2820000, "end_ms": 5700000, "end_period_ms": 2880000 } ],
    "chunks": [ { "index": 0, "period": 1, "minute": 0, "from_ms": 0, "to_ms": 60000 } ],
    "duration_ms": 5700000,
    "gaps": [] }
  ```

  - `setup` is the stored §2 setup and `result` the stored result, both unchanged.
  - `periods` comes from the match's `PeriodStart` and `PeriodEnd` events: `start_ms` and `end_ms` are their
    `match_ms`, `end_period_ms` the `PeriodEnd`'s `period_ms`.
  - `chunks`: one per minute of each period, `minute` from 0 to `⌊end_period_ms ÷ 60000⌋`, the same numbering as
    the tracking files (`p<period>/m<MMM>`). `from_ms` and `to_ms` are the chunk's `match_ms` range, `to_ms`
    exclusive; the last chunk of a period ends at `end_ms + 1`. `index` counts chunks from 0 in play order.
  - `duration_ms` is the last period's `end_ms`.
  - `gaps` lists event `seq` values missing from storage. Replay continues without them.
- **Chunk** (`?chunk=<index>`): `{ "match_id", "chunk": <index>, "envelopes": [ … ], "rejected": { "count", "samples" } }`,
  the same `rejected` shape as the snapshot (`CONTRACTS.md` §7.3).
- **What a chunk holds** (period `p`, minute `m`, so `period_ms` from `m × 60000` up to `(m + 1) × 60000`):
  - **events** of period `p` in that range, in `seq` order, each as an `event` envelope with the §3 event unchanged;
  - a **`status`** envelope right after each `PeriodStart` (`live`), goal `Shot` (score + 1 for that side) and
    `PeriodEnd` (`half_time` after period 1, `full_time` after period 2), with `{ phase, period, score }` as in
    `CONTRACTS.md` §7.2. The score counts goal shots from kick-off, including earlier chunks;
  - **frames** from the tracking file `p<p>/m<MMM>`, the first frame kept for each `match_ms`, in `match_ms` order,
    bundled into `positions` envelopes of at most 5 consecutive frames. The envelope's `match_ms` is the last frame's,
    and its `clock` comes from that frame's period and `period_ms`, as the relay does. A minute without a file has no
    frames;
  - **stat panels** of period `p` whose `match_ms − start_ms` falls in the range, each as a `stats` envelope with the
    §7.4 panel unchanged.
  - **Chunk 0 starts with** a `pre_match` status carrying the setup, at `match_ms` 0 and clock `0:00`, as the relay's
    first status does.
- **Cosmos fields** (`id`, and every field that starts with `_`) are removed from stored documents before anything
  else; the browser's schemas reject unknown fields.
- **Order and `seq`:** envelopes are sorted by `match_ms`, then event, status, stats, positions (events with the same
  `match_ms` keep `seq` order, and a status stays right after the event that caused it). `seq` is
  `(index + 1) × 100000 + position in the chunk`, so it rises across the whole match and a refetched chunk gets the
  same numbers. Replay is not a Web PubSub group, so `CONTRACTS.md` §7.1's sender rule does not apply.
- **Validation:** every envelope the route builds goes through `parseEnvelope`. One that fails is left out, counted in
  `rejected`, and described in `samples` (at most 5). The browser validates again on ingest.
- **Errors** (body `{ "error": "<code>" }`):

  | Status | Code | When |
  |---|---|---|
  | 400 | `bad_match_id` | The id does not look like `SYN-NNNN` |
  | 400 | `bad_chunk` | `chunk` is not a whole number within `chunks` |
  | 404 | `not_found` | No `matches` document for the id |
  | 503 | `not_ready` | The match document has no setup yet |
  | 409 | `not_finished` | `status` is not `finished` |
  | 503 | `replay_unavailable` | A storage setting is missing; one server log line names the missing variables |
  | 502 | `storage_error` | Cosmos or Blob failed or took longer than 10 s |
  | 500 | `archive_invalid` | The stored setup or result fails its contract, a half has no `PeriodStart` and `PeriodEnd`, or the match has periods other than 1 and 2; the log line gives the reason |
  | 500 | `internal_error` | Anything else; the log line names only the error's type |

- **Halves only:** periods 1 and 2, as the screen relay supports (`functions/screen_relay.py`). Extra time waits
  until the relay and the clock handle it.

- **Caching:** a finished match never changes, so the route keeps each match's periods and goals in memory (at most
  20 matches) and answers with `Cache-Control: private, max-age=3600`.
- **Settings** (server-only, the archiver's names, values never written down): `OVERLAP_COSMOS_ENDPOINT`,
  `OVERLAP_COSMOS_DATABASE` (default `live`), `OVERLAP_COSMOS_KEY` (local emulator only; without it the route uses
  `DefaultAzureCredential`), and for Blob either `OVERLAP_ARCHIVE_STORAGE` (a connection string, local) or
  `OVERLAP_ARCHIVE_BLOB_ENDPOINT` (Azure, with `DefaultAzureCredential`). Without them the route answers
  `replay_unavailable`, and the rest of the app still runs.
- **Logs:** one line per request with the match id, chunk, counts (events, frames, panels, rejected) and duration.

### 5.2 Player

- **`src/lib/replay-player.ts`**, outside React like the store. `ReplayProvider` creates one store and one player per
  match id, and on unmount stops the player (timers cleared, fetches aborted) and destroys the store.
- **Start:** status `connecting` and the notice "Loading the replay…"; read the manifest; ingest chunk 0's `pre_match`
  status; then play.
- **Playhead** in `match_ms`. A 100 ms timer advances it by the wall time elapsed × speed and ingests, in order, every
  envelope at or before it, with `receivedAt` set to the browser's time, so rows count and the goal flash and
  announcement work as they do live. The playhead never passes data that hasn't loaded: it waits, with the notice
  "Buffering…", and goes on when the chunk arrives. Half-time is not part of `match_ms`, so period 2 follows straight
  on.
- **Speed:** 1×, 5× or 20×, default 20×. Changing speed doesn't refetch.
- **Pause** stops the playhead, and resume continues from it. This is not the timeline's "pause feed" button, which
  keeps working as it does live (it freezes the display while the scoreboard follows the playhead).
- **Prefetch:** the chunk under the playhead and the next 2 are kept loaded. A chunk is dropped once its envelopes are
  ingested.
- **Fetches:** 10 s timeout. A failed chunk is retried 3 times, after 1 s, 2 s and 4 s; then the player pauses and
  shows "Replay data unavailable." with a Retry button. A failed manifest shows the error state of `screens.md` §1.
- **Status and badge:** the player sets `connecting`, `live` while playing or paused, and `finished` after the last
  envelope (notice "Replay finished."). It never calls `tick()`, so a paused replay never turns `stale`.
- **Replay again:** after the end, `reset()` the store and start from `match_ms` 0.
- **Rows** say where they came from: the timeline's arrival cell reads "Replay · archive" (and "Replay · bundled
  frame" for tracking) instead of "Live WebSocket", through a stream-source setting that defaults to live.
- **Jump to a minute** is optional (plan M4) and not specified here; it will be added to this section if it is built.

## 6. Testing and checks

- How is the code under `src/lib` and the live screen checked, and what runs where?

_Answer:_

- **Scripts** (`web/package.json`, run from `web/`):

  | Command | What it does |
  |---|---|
  | `npm run lint` | ESLint |
  | `npm run typecheck` | `tsc --noEmit` |
  | `npm run build` | Next.js production build (also type-checks routes) |
  | `npm test` | `vitest run`: every unit test once |
  | `npm run test:watch` | `vitest` in watch mode |

- **Setup for tests:** Node 22 or newer (CI uses 22), `npm install`, and `web/.env.local` copied from `web/.env.example`
  with `NEXT_PUBLIC_STREAM_BASE_URL` and `NEXT_PUBLIC_DEFAULT_MATCH_ID` set (URLs and ids only, never secrets).
  `vitest.config.mts` reads those variables from `.env.local` (or the shell, which wins) and stops with a clear message
  if either is missing. The `@/` import alias matches `tsconfig.json`.
- **Where tests live:** `src/lib/__tests__/*.test.ts` (Vitest, Node environment, no browser). A fake stream server and a
  fake WebSocket are used; no test needs the mock to be running.
- **What is covered today** (16 test files, 330 tests, last run on the branch on 2026-10-16: all pass):
  `api`, `announcer`, `cn`, `contracts`, `coordinates`, `describe-event`, `env`, `format`, `layout`,
  `live-match-view`, `match-stream-provider`, `ring-buffer`, `socket`, `store`, `store-hooks`, `team-colours`.
  Highlights: unknown and missing fields are rejected and every `CONTRACTS.md` §3 event rule is exercised; duplicate
  `seq` is ignored; history rows are excluded from counters; the ring buffer caps at 600; pause freezes the display
  slices and resume catches up; reconnect backoff and the generation guard; the throttled announcer; coordinate
  conversion including the `CONTRACTS.md` §4 worked example (home in period 2, team-frame (76, 10) is pitch-frame
  (24, 90)); every one of the 18 event types is described.
- **Checks outside the test suite** (manual, recorded in the PR): a run of `SYN-9001` against the mock at 20× for the
  scoreboard, timeline and pitch behaviour; stopping and restarting the mock for reconnect; keyboard-only use; and
  screenshots at 375 px and 1440 px.
- **CI today** (`.github/workflows/web.yml`): lint, typecheck and build, only when `web/` changed and
  `web/package.json` exists. It sets the two public variables at job level. **CI does not run `npm test`**; adding that
  step is Arnav's decision (he owns `.github/`). Until then, run `npm test` locally and say so in the PR.
- **Not covered:** the real Azure Web PubSub and screen relay (only the mock's stand-in exists); a repeatable run over
  recorded mock matches (no recorded sample is committed to `fixtures/`); performance at 20× in a browser (Chrome
  Performance and React Profiler checks are still to do).
- **Contract drift rule:** if a message from the mock fails validation, that is drift to report, not a reason to loosen
  a schema silently. The fix is in `CONTRACTS.md` or the mock, in the same PR, with the producer and consumer owners
  agreeing.
