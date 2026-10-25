# Real-time data spec

> **Status: merged for review in #19 (16 Oct); not yet marked agreed.** Answers §1 (connection), §2 (store), §3
> (catch-up) and adds §6 (testing and checks) for the live match screen. §4 (overlay scheduler) is **not started**.
> `stats` envelopes and the store's `stats` slice (§1, §2) are **written for review** (22 Oct) for
> [`PLAN_web_stat-charts`](../../vedant-frontend/plans/active/PLAN_web_stat-charts.md).
> §4 (insights) is **built** (24 Oct) for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md).
> §5 (replay) is **written for review** (20 Oct) for [`PLAN_web_replay`](../../vedant-frontend/plans/active/PLAN_web_replay.md); no
> replay code exists yet. The live screen's code is on `main` (#43, #48). Plan:
> [`PLAN_web_live-match-viewer`](../../vedant-frontend/plans/active/PLAN_web_live-match-viewer.md). The `status` and `positions`
> payloads and the snapshot shape are now in `CONTRACTS.md` §7.2–§7.3. The app's own negotiate and snapshot routes
> (§1.1, §3.1) replace the stream server's and end the mock dependency: **written for review** (23 Oct, approach agreed
> in person) for [`PLAN_web_realtime-routes`](../../vedant-frontend/plans/active/PLAN_web_realtime-routes.md). §5.3 (the match list, this app's own route, replacing the
> mock's) is **written for review** (22 Oct) for [`PLAN_web_match-list`](../../vedant-frontend/plans/active/PLAN_web_match-list.md).

Decides how messages reach the screen and stay in order.

## 1. Connection

- Negotiate flow, groups joined per preference, reconnects.

_Answer:_

- **Transport:** the Azure Web PubSub client protocol `json.webpubsub.azure.v1`. The local Web PubSub stand-in
  (`infra/local/webpubsub_standin`) speaks it too, so moving to Azure changes only the server's settings. Messages handled: `{type:"system", event:"connected"}` (start
  catch-up), `{type:"ack", ackId, success}` (reply to our `joinGroup`) and `{type:"message", from:"group",
  dataType:"json", data}` (an envelope, `CONTRACTS.md` §7). Anything else is ignored.
- **Negotiate:** `GET /api/negotiate?groups=match-<id>` on this app's own origin (§1.1) returns
  `{ baseUrl, url, token }`; the browser opens `url` with the subprotocol above. The token is signed on the server, so
  no key reaches the browser, and it is never logged or rendered.
- **Groups joined:** `match-<id>` only (events, positions, status). Audience groups (`match-<id>-<mode>-<lang>`) and
  player groups are **not joined**: this screen shows no overlays. After the connection is ready the client sends
  `{type:"joinGroup", group, ackId}` and waits up to 3 s for a successful ack. A refused or missing ack closes this attempt and retries with backoff; it never reports a working live subscription.
- **Request headers:** none added by us. Every HTTP call goes to this app's own routes (same origin); the routes set
  `Cache-Control: no-store` on their responses.
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
- **Accepted kinds:** `event`, `positions`, `status` and `stats` (all on `match-<id>`). `stats` is checked strictly
  against the stat panel of `CONTRACTS.md` §7.4, heavy block included; a panel that fails is rejected as a whole. The
  other kinds in `CONTRACTS.md` §7 (`overlay`, `player_tag`, `recap`) pass the outer envelope check and are ignored,
  not rejected. An envelope for another `match_id` is dropped.

### 1.1 Route `GET /api/negotiate`

- **Runtime:** a Node.js route handler, always dynamic (it reads the request). Settings are server-only.
- **Request:** `?groups=` with 1 to 4 comma-separated groups, each `match-<id>` with a valid match id
  (`CONTRACTS.md` §1.3) or one of that match's insight audience groups (§4; `CONTRACTS.md` §10.6:
  `match-<id>-casual|analyst-<lang>`, `match-<id>-club-<teamId>-<lang>`, `match-<id>-player-<playerId>-<lang>`, with
  `lang` one of `en es hi fr`). Anything else is `400 bad_groups`.
- **Token:** made with the Web PubSub server SDK (`@azure/web-pubsub`) for hub `OVERLAP_WEBPUBSUB_HUB` (default
  `live`): role `webpubsub.joinLeaveGroup.<group>` and an initial join for each requested group, **no send role**, no
  user id, valid for 10 minutes. A connection is checked when it opens, and `socket.ts` negotiates again on every
  reconnect, so the short lifetime never cuts a running connection.
- **Credential:** an endpoint on `localhost` or `127.0.0.1` is the local stand-in, which accepts any token, so the
  token is signed with a fixed, documented non-secret local key (the same rule as `functions/relay_store.py`). Any
  other endpoint uses `DefaultAzureCredential` (managed identity on Azure; not run yet).
- **Response** (200, `Cache-Control: no-store`): `{ "baseUrl": "ws://localhost:8787/client/hubs/live", "url":
  "<baseUrl>?access_token=…", "token": "…" }`.
- **Errors** (body `{ "error": "<code>" }`, `Cache-Control: no-store`):

  | Status | Code | When |
  |---|---|---|
  | 400 | `bad_groups` | `groups` missing, more than 4, or one is not `match-<id>` |
  | 503 | `negotiate_unavailable` | `OVERLAP_WEBPUBSUB_ENDPOINT` missing or malformed; one log line names the problem |
  | 502 | `pubsub_error` | The service could not make a token, or took longer than 10 s |
  | 500 | `internal_error` | Anything else; the log line names only the error's type |

- **Logs:** failures only. Never the token, the URL or a setting's value.

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
  | `stats` | display | `latest`: the stat panel with the greatest `match_ms`; `heavy`: the greatest one with a `heavy` block |
  | `inspector` | display | the selected row, or the newest event while following |

- **Applying a kind:** `status` sets the setup (if present), phase, period and score, and adds a "Match state" row;
  `event` adds a row described by `describeEvent` (readable title, detail, emphasis for goal, cards and substitutions);
  `positions` adds one "Position frame" row per frame in `data.frames` and updates `latestFrame`; `stats` replaces
  `stats.latest` (and `stats.heavy` when it has a block) unless it is older by `match_ms` (a re-sent panel for the same
  second replaces it). `stats` adds no timeline row and is not counted as an event or frame; the snapshot carries
  every panel so far, and only these two are kept. A setup that arrives
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
- **Snapshot:** `GET /api/match/<id>/snapshot` on this app's own origin (§3.1) with a 7 s timeout. The response is
  `{ match_id, setup, status, envelopes, rejected: { count, samples } }`. Each envelope is validated; one bad envelope is
  counted and skipped instead of discarding the whole catch-up.
- **Merge:** snapshot entries (`received = null`) and buffered live entries are merged by `seq`; where a `seq` is in both,
  the live copy wins. They are then ingested in ascending `seq`. After the merge the buffer is released and later
  messages are ingested directly.
- **If the snapshot fails** (error, timeout, invalid response): log it, close the attempt and retry with backoff. Do not present live tracking indefinitely without
  its setup and earlier score/events. A new snapshot is merged on reconnect; the `seq` dedupe makes that safe.
- **If the stream is unreachable** on first load: "Cannot reach the stream server. Is it running?", then the retry
  schedule in §1.
- **Stale-connection fallback to the snapshot API** (the spec's original wording) is **not decided**: today a stale
  connection only shows the stale badge and notice, and the snapshot is re-read on reconnect. Open question for review.
- **Errors from `api.ts`** are typed: `network`, `timeout`, `aborted` (not shown), `http` (with status) and
  `invalid-response` (contract drift).
- **Findings from the mock:** the snapshot omits old `positions` envelopes, so its `seq` is not contiguous (one run: 635
  envelopes spanning `seq` 1 to 2212). The store must sort and dedupe, never assume +1.

### 3.1 Route `GET /api/match/<id>/snapshot`

- **Runtime:** a Node.js route handler, always dynamic, read-only. It reads the screen relay's Cosmos container
  (`functions/specs/screen-relay.md` §4: `env-<seq>` envelope documents, `positions-latest` and `state`, partition key
  `match_id`). One partition per request; nothing is cached.
- **Settings** (server-only): `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_DATABASE` (default `live`),
  `OVERLAP_COSMOS_KEY` (local emulator only; without it, `DefaultAzureCredential`) and `OVERLAP_COSMOS_CONTAINER`
  (default `screen`): the relay's names. The archive's Blob setting is not needed.
- **What it holds** (`CONTRACTS.md` §7.3): the setup from the relay's `state`; every `event` and `status` envelope;
  the latest `positions` envelope; and of the `stats` envelopes only **the newest panel and the newest panel with a
  `heavy` block**, by `match_ms`. Panels are cumulative and the store keeps only those two (§2), so a full-time
  snapshot carries 2 panels instead of about 5,700. Envelopes are in `seq` order and `status` is the last status
  envelope, so `seq` has gaps.
- **Reads:** three queries in the match's partition: every `state`, `positions` and non-`stats` envelope document
  (projected to `id`, `type`, `envelope`, `setup`); the newest `stats` envelope; the newest `stats` envelope with
  `heavy`. Each gives up after 10 s.
- **Validation:** each envelope must have exactly `seq`, `kind`, `match_id`, `match_ms`, `clock` and `data`, a known
  kind, this match's id and a whole `seq` ≥ 1 (the stand-in's check). One that fails is left out and counted in
  `rejected`, with at most 5 samples `"<document id>: <problem>"`. The browser validates every envelope again.
- **Response:** 200 with the §7.3 body, `Cache-Control: no-store`. One log line per request: match id, envelopes,
  rejected, milliseconds.
- **Errors** (body `{ "error": "<code>" }`, `Cache-Control: no-store`; the first three as the stand-in answers them):

  | Status | Code | When |
  |---|---|---|
  | 400 | `bad_match_id` | The id does not look like `SYN-NNNN` |
  | 404 | `unknown_match` | The partition has no documents |
  | 503 | `setup_pending` | No setup in `state` yet, or no status envelope yet |
  | 503 | `snapshot_unavailable` | `OVERLAP_COSMOS_ENDPOINT` missing or malformed; one log line names the problem |
  | 502 | `storage_error` | Cosmos failed or took longer than 10 s |
  | 500 | `internal_error` | Anything else; the log line names only the error's type |

## 4. Insights: audience groups, catch-up and the scheduler

Written 24 Oct for [`PLAN_web_live-home`](../../plans/active/PLAN_web_live-home.md). Built in `src/lib/live/insights.ts`,
`src/providers/MatchExperience.tsx` and the two insights routes below. Contract: `CONTRACTS.md` §6, §10.4 and §10.6.

**Groups.** The viewer's preferences pick one audience group (`src/lib/preferences.ts` `audienceGroup()`):
`match-<id>-casual-<lang>`, `match-<id>-analyst-<lang>`, `match-<id>-club-<teamId>-<lang>` or
`match-<id>-player-<playerId>-<lang>`. Club and player modes need a club or player of this match, otherwise the screen
reads the casual group and says so. A second socket (`createGroupSocket`) joins only that group, receive-only, through
`/api/negotiate`, which now accepts these audience groups as well as `match-<id>` (§1.1; at most 4 groups). The relay
stays the only sender on `match-<id>`; the insights publisher the only sender on audience groups.

**Envelopes.** `kind` `overlay` (data: the §6 overlay with `period`, `mode`, `lang`), `player_tag` (data:
`{player_id, name, metric, value, unit, threshold}`) and `recap` (data: `{lines: [{text, …}], …}`). Parsed loosely
(`parseInsight`): unknown extra fields are kept; a card with no text for the viewer's language falls back to English.

**Catch-up (live).** After the group is joined, `GET /api/match/<id>/insights/snapshot?mode=&lang=(&club=|&player=)`
returns the two newest live cards and the group cursor. Locally the route forwards to the Web PubSub stand-in, which
serves this endpoint from Cosmos `overlays`; on Azure the route reads `overlays` and `match_state` itself
(`lib/server/insights-snapshot.ts`) with the same rule and answer (24 Oct). Errors: `400 bad_match_id | bad_audience`,
`404 unknown_match`, `503 insights_unavailable | playhead_unknown`, `502 storage_error`.

**History (replay).** `GET /api/match/<id>/insights/history?group=<audience group>` returns every envelope the
publisher numbered for that group (`overlays`, `kind = audience_delivery`, in seq order; deliveries that expired
unnumbered have no envelope and are left out). A replay shows each card when the replay playhead reaches its
`show_at_ms`, and the recap at full time. Errors: `400 bad_match_id | bad_group`, `503`, `502 storage_error`.

**Scheduler** (`createInsightFeed`). Cards dedupe by `overlay_id`, so a reconnect, the snapshot and the live stream
never show one card twice. A card goes on screen when the playhead (§2 of `pitch.md`: the smooth motion playhead) is at
or past `show_at_ms` in the same period, and is dropped if the playhead is more than 300,000 match ms past it
(`CONTRACTS.md` §10.6 expiry). One card at a time, for `duration_ms` of wall time (6 s by default, at most 12 s); at
most two wait, high priority first, then the newest moment. Every card received stays in the feed, newest first; in
a replay only those whose moment has been reached are listed.

## 5. Replay

- How replay files drive the same store at 1×, 5× and 20×.

_Answer:_

Plan: [`PLAN_web_replay`](../../vedant-frontend/plans/active/PLAN_web_replay.md). Replay plays a **finished** match from the archiver's
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
    §7.4 panel unchanged. A period's **last** chunk also takes the panel sent for its `PeriodEnd`: the stats engine
    stamps it with the next whole second, up to 999 ms after the whistle, so its range ends at `to_ms + 999`. That
    panel carries the half-time or full-time totals. (Found on the first run against a real archive: `SYN-0501`'s
    panels at 2,907,000 and 6,124,000 came after whistles at 2,906,400 and 6,123,600.)
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
  20 matches). Tracking and stats may still be arriving after the events stream reaches full time, so a match is
  served with `Cache-Control: no-store` until its archive has **settled**: its match document unchanged for 10
  minutes (`SETTLED_MS`; the archiver runs seconds behind). Settled matches never change again and are served with
  `Cache-Control: private, max-age=3600`, so a judge replaying or scrubbing a finished match is not re-reading the
  archive each time. A match whose document time is unknown stays `no-store`. This does not establish an
  archive-completion signal or automatically refresh chunks already loaded by the player.
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
  on. When the playhead reaches a chunk's end (`to_ms − 1`), whatever is left in that chunk is ingested too: the
  `PeriodEnd` panel can be stamped after the whistle, and at full time the playhead stops at `duration_ms`.
- **Speed:** 1×, 5× or 20×, default 20×. Changing speed doesn't refetch.
- **Pause** stops the playhead, and resume continues from it. This is not the timeline's "pause feed" button, which
  keeps working as it does live (it freezes the display while the scoreboard follows the playhead).
- **Prefetch:** the chunk under the playhead and the next 2 are kept loaded. A chunk is dropped once its envelopes are
  ingested.
- **Fetches:** 10 s timeout. A failed chunk is retried 3 times, after 1 s, 2 s and 4 s; then the player pauses and
  shows "Replay data unavailable." with a Retry button. A failed manifest shows the error state of `screens.md` §1.
- **Status and badge:** the player sets `connecting`, `live` while playing or paused, and `finished` after the last
  envelope (notice "Replay finished."). It never calls `tick()`, so a paused replay never turns `stale`. While playing
  the notice is "Replaying from the match archive."; if the manifest fails it is "This replay can't be shown.".
- **Replay again:** after the end, `reset()` the store and start from `match_ms` 0.
- **Rows** say where they came from: the timeline's arrival cell reads "Replay · archive" (and "Replay · bundled
  frame" for tracking) instead of "Live WebSocket", through a stream-source setting that defaults to live.
- **Jump to a minute** is optional (plan M4) and not specified here; it will be added to this section if it is built.

### 5.3 Match list `GET /api/matches`

Plan: [`PLAN_web_match-list`](../../vedant-frontend/plans/active/PLAN_web_match-list.md). The list behind the match picker
(`screens.md` §1), read from the same archive as replay. It replaced the mock's provisional `GET /mock/matches`, so the
picker works the same with the local stand-in (which has no list) and on Azure.

- **Runtime and settings:** a Node.js route handler, always dynamic, read-only, with the settings of §5.1. Only Cosmos
  is read, but the Blob setting is still required, so one set of settings switches the archive on or off for both
  routes.
- **Sources:**
  - Cosmos `matches` (`CONTRACTS.md` §4.1), across partitions: the 50 most recently written documents
    (`TOP 50 … ORDER BY c._ts DESC`), projected to the id, status, both teams' ids and names, and the result. The full
    setup is never read here.
  - For each `live` match, its `match_state` document (`CONTRACTS.md` §4.2, id `state`): phase, clock and score. One
    point read per live match.
- **Response** (200, `Cache-Control: no-store`):

  ```json
  { "matches": [
      { "match_id": "SYN-0505", "status": "live",
        "home": { "team_id": "NBR", "name": "Northbridge FC" },
        "away": { "team_id": "HBA", "name": "Harbour Athletic" },
        "phase": "live", "score": { "home": 1, "away": 0 }, "clock": "62:14" } ] }
  ```

  - `status` is the `matches` document's (`live` or `finished`).
  - **Live:** `phase`, `score` and `clock` come from `match_state`. All three are `null` when there is no `match_state`
    yet (the stats engine isn't running, or hasn't reached its first write), when it fails its check, or when its read
    fails; the match is still listed.
  - **Finished:** `phase` is `full_time`, `score` is the stored `result.score`, `clock` is `null`. `match_state` is not
    read.
  - **Order:** live matches first, then finished ones; inside each, the most recently written first.
- **Left out:** a `matches` document without a setup, with another status, or finished without a valid result. The
  route logs one line with how many it left out and their ids.
- **Errors** (body `{ "error": "<code>" }`, `Cache-Control: no-store`):

  | Status | Code | When |
  |---|---|---|
  | 503 | `matches_unavailable` | The archive settings are missing or malformed; one log line names them (names only) |
  | 502 | `storage_error` | The `matches` query failed or took longer than 10 s |
  | 500 | `internal_error` | Anything else; the log line names only the error's type |

- **Logs:** failures and left-out documents only. The picker asks every 5 s, so a line per request would drown the log.
- **Cost:** one cross-partition query and one point read per live match, each time an open picker refreshes.
- **Not handled yet:** a match whose generator stopped before full time stays `live` in the archive, so it is listed as
  live with nothing streaming. Locally every run starts clean; Azure needs a rule later.

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
  with `NEXT_PUBLIC_DEFAULT_MATCH_ID` set (an id, never a secret). `vitest.config.mts` reads it from `.env.local` (or
  the shell, which wins) and stops with a clear message if it is missing. The `@/` import alias matches `tsconfig.json`.
- **Where tests live:** `src/lib/__tests__/*.test.ts` (Vitest, Node environment, no browser). A fake stream server and a
  fake WebSocket are used; no test needs the stream to be running.
- **What is covered today** (16 test files, 330 tests, last run on the branch on 2026-10-16: all pass):
  `api`, `announcer`, `cn`, `contracts`, `coordinates`, `describe-event`, `env`, `format`, `layout`,
  `live-match-view`, `match-stream-provider`, `ring-buffer`, `socket`, `store`, `store-hooks`, `team-colours`.
  Highlights: unknown and missing fields are rejected and every `CONTRACTS.md` §3 event rule is exercised; duplicate
  `seq` is ignored; history rows are excluded from counters; the ring buffer caps at 600; pause freezes the display
  slices and resume catches up; reconnect backoff and the generation guard; the throttled announcer; coordinate
  conversion including the `CONTRACTS.md` §4 worked example (home in period 2, team-frame (76, 10) is pitch-frame
  (24, 90)); every one of the 18 event types is described.
- **Checks outside the test suite** (manual, recorded in the PR): a generator match on the local stack
  (`infra/specs/local-development.md`) at 20× for the scoreboard, timeline and pitch behaviour; stopping and restarting
  the stand-in for reconnect; keyboard-only use; and
  screenshots at 375 px and 1440 px.
- **CI today** (`.github/workflows/web.yml`): lint, typecheck and build, only when `web/` changed and
  `web/package.json` exists. It sets the public variables at job level, including `NEXT_PUBLIC_STREAM_BASE_URL`, which
  the app no longer reads (Arnav owns `.github/`). **CI does not run `npm test`**; adding that
  step is Arnav's decision (he owns `.github/`). Until then, run `npm test` locally and say so in the PR.
- **Not covered:** the real Azure Web PubSub and the managed-identity paths of §1.1 and §3.1 (only the local stand-in,
  which accepts any token, has been run); a repeatable run over
  recorded mock matches (no recorded sample is committed to `fixtures/`); performance at 20× in a browser (Chrome
  Performance and React Profiler checks are still to do).
- **Contract drift rule:** if a message from the stream fails validation, that is drift to report, not a reason to
  loosen a schema silently. The fix is in `CONTRACTS.md` or its producer, in the same PR, with the producer and consumer owners
  agreeing.

## 7. Season routes

- How do the league, club and player pages get their numbers?

_Answer:_

From the season document the stats engine builds ([`CONTRACTS.md`](../../CONTRACTS.md) §11,
[`stats/specs/season.md`](../../stats/specs/season.md)). It is a committed file, `web/data/season/season-<id>.json`,
rebuilt with `python main.py season` in `stats/` whenever the season run or the world changes. The server reads it
from `OVERLAP_SEASON_DIR` (default `web/data/season`), checks it against `seasonDocumentSchema` once, and keeps it
until the file changes (`src/lib/server/season-store.ts`). No database is involved, so it works the same on Azure.

| Route | Answers | Shape (`src/lib/season.ts`) |
|---|---|---|
| `GET /api/season/<id>` | The league: table with expected points, title race lines, each club's season values and style, every result, a row per player | `LeagueView` |
| `GET /api/season/<id>/team/<teamId>` | One club: everything above for it, plus its shots for and against, pressing grid, zones, goal timing, its results and squad, and every club's season values for comparison | `TeamView` |
| `GET /api/season/<id>/player/<playerId>` | One player: attributes, role, totals, per 90, rates, percentiles, shots, touch and defensive zones; their peers and the group median of each radar value | `PlayerView` |

- **Answers:** `200` with `Cache-Control: public, max-age=300` (a finished season doesn't change).
- **Errors:** `{ error }` with `Cache-Control: no-store`.

  | Error | Status | When |
  |---|---|---|
  | `bad_season_id` | 400 | The id isn't `S<n>` |
  | `bad_team_id` | 400 | The team id isn't three capitals |
  | `bad_player_id` | 400 | The player id isn't `AAA-00` |
  | `not_found` | 404 | No such club or player, or a reference club or its players (`season.md` §6) |
  | `season_unavailable` | 503 | No document for that season |
  | `season_invalid` | 500 | The file fails the schema; the server logs the first issue's path |

- **No new numbers:** the views only pick, sort and join. The group median, a summary of values already in the
  document, is the one figure they work out themselves.
- **Tests:** `src/lib/__tests__/season.test.ts`.

## 8. Start a match `POST /api/start-match`

Built 24 Oct (`app/api/start-match/route.ts`, `lib/server/start-match.ts`, `components/home/StartMatchButton.tsx`).
On Azure it starts one execution of the generator's Container Apps job, which plays `SYN-<n>` at 20×; the home page
switches to it when its first frames arrive. `n` is one past the highest archived match id, never below 3000 (local
runs stay below). The request body is never read and nothing from the request reaches the job. A start with an
override replaces the job's whole container, so the route reads the job's own container first and adds only
`OVERLAP_FIRST_MATCH` (the web identity may read and start that one job and read its executions, nothing more).

| Answer | When |
|---|---|
| `202 { match_id }` | Started |
| `429 rate_limited` | More than 3 starts from one address in an hour (per web replica, in memory) |
| `429 match_running` | An execution of the job is still running: one match at a time across the site |
| `503 start_unavailable` | No job setting (`OVERLAP_GENERATOR_JOB_ID`) or archive settings; locally |
| `502 start_failed` | The archive or Azure call failed |

The web app's identity holds a custom role that can only read and start that job (`infra/specs/security.md` §3).

## Local release fix to §8: durable admission and availability
`OVERLAP_LIVE_ENABLED=true` AND a valid job ID are required. Missing/false disables POST even with a stale job ID.
GET /api/start-match is uncached, read-only and returns `{available: boolean}` after checking job and control
container existence. It returns unavailable on failures; it does not promise every downstream service is healthy.
The button stays hidden until true, polls every 30 seconds and hides again on unavailable.

POST rejects a cross-site Origin/Sec-Fetch-Site before admission. A 60-second Blob lease on
`match-control/starts.json` serializes all web replicas. The durable document contains a version, monotonic last
number, rolling attempt timestamps with hashed network visitor identifiers, and a pending execution reservation.
The web identity has Blob Data Contributor only on this new container, not on archived tracking.

Within the lease: reconcile any pending named execution (only Succeeded/Failed/Stopped releases it), check
running executions, enforce at most 3 admitted attempts per visitor/hour and 6 globally/hour, allocate an unused
number above persisted and archived IDs, SAVE the reservation, then invoke ARM once. Store the execution name
when returned. Timeouts/lost responses or save failures retain the reservation: no automatic retry. HTTP 409
`start_pending` means the reservation is not yet confirmed (see below); 409 `match_running` includes competing lease holders;
429 `rate_limited`; 503 `start_unavailable` on missing state/permissions/invalid control data. Responses are uncached.
The network identifier is not user authentication; rotating/spoofing it still cannot bypass the global cap.
Admitted failed/unknown starts consume quota. Historical entries expire logically after one hour and are pruned
on later admission; no raw IP is stored. Do not delete/reset the coordination blob as routine recovery.

A pending unnamed execution (or a named one whose status cannot be read) is fail-closed while it could still be
playing. It is cleared under the lease only when **both** hold: the reservation is older than 35 minutes
(`PENDING_RECOVERY_MS`; the generator job stops every execution after 1,800 s, `replicaTimeout`) **and** the job
has no running execution. Then no execution from it can still be playing, and the worst case of a lost ARM
response is one extra synthetic match. Without this, one failed start would lock the button for the rest of a
judging window. Elapsed time alone never unlocks; lastNumber and attempts are preserved, so numbering and quotas
are unchanged. An operator may still reconcile sooner by recording the execution name.

### Live-list freshness (§5.3)
GET /api/matches excludes live candidates whose match_state `_ts` (or initial matches `_ts` when absent) is older
than 180 wall seconds, more than 60 seconds in the future, or already full_time without an archived final result.
Finished results remain unchanged. This is a conservative display filter, not archive mutation or a claim a game
finished. Genuine long pauses can temporarily disappear; a fresh snapshot makes them eligible again. The home
screen clears its quiet exclusion when a match's clock advances, so a resumed stream can be selected again.

## Viewer recovery acceptance (24 October 2026)

A socket must receive its initial Web PubSub connected message within 10 seconds. A constructor failure, silent
handshake, failed join or closed connection invalidates that generation before retrying. Stop cancels handshake,
join and retry timers. The status remains connecting/reconnecting through subscription and snapshot catch-up;
only the completed catch-up is marked live (or finished if full time). A failed snapshot invalidates the attempt and reconnects with backoff; it must not leave a live screen without setup/history.

`viewer-acceptance.qa.test.ts` is opt-in and loopback-only: two real socket/store clients, late join, forced
disconnect, fresh snapshot at full time, and replay chunks compared with the independently recorded generator
setup/events/tracking/result. Local transport evidence is separate from browser rendering and Azure behavior.
See ../../docs/viewer-replay-acceptance.md for the checklist and recorded results.
