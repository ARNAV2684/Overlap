# Screen relay spec

> **Status: agreed.** Approved by Arnav (PR #29, 17 Oct); details settled while building the relay are marked
> *(S3)*. Plan: [`PLAN_functions_screen-relay`](../../plans/active/PLAN_functions_screen-relay.md).
> Message shapes: [`CONTRACTS.md`](../../CONTRACTS.md) §1.4 (hubs) and §7 (envelopes).

The screen relay is the fast lane: it reads raw messages from Event Hubs and sends `event`, `positions`, `status` and
`stats` envelopes to Web PubSub group `match-<id>`, saving each one so browsers can catch up. The same code runs
locally (emulators and a Web PubSub stand-in, see [`infra/specs/local-development.md`](../../infra/specs/local-development.md))
and on Azure; only settings change.

## 1. Input

- Which hubs and consumer group, and what batch size?

_Answer:_

| Hub | Consumer group | Messages (`kind` property) |
|---|---|---|
| `match-events` | `relay` | `setup` (first), `event`, `stats` (stat panels from the stats engine) |
| `match-tracking` | `relay` | `tracking` (one 5 Hz frame each) |

- **Ordering:** partition key `match_id`, so each match's messages arrive in order **within one hub**. The two hubs are
  independent: a frame can arrive before an event of the same instant. Nothing assumes order across hubs.
- **Batches:** the Event Hubs trigger delivers up to 300 messages per call (`maxEventBatchSize: 300` in `host.json`;
  100 left the relay's tracking reader 80 s behind a 20× match on Azure, 24 Oct, because one match is one partition and
  its batches run one after another); the local runner reads 100 at a time. Each batch is processed in order, then the state is saved, then the checkpoint
  moves.
- **Validation (strict, per `CONTRACTS.md`):** the body must be valid JSON matching §2, §3 or §4 exactly (unknown fields
  rejected); `kind` and `match_id` properties must agree with the body. An invalid message is **logged** (hub,
  partition, offset, reason), **counted**, and **skipped**; the match keeps going.
- **Setup first:** frames or events for a match whose setup hasn't arrived are held (up to 2,000 messages, 1.2 MB or
  10 s, whichever first; the held messages live in the state document, which Cosmos limits to 2 MB *(S3)*). If the
  setup still hasn't arrived, the held messages are logged as invalid and dropped.
- **Duplicates** (Event Hubs delivers at least once):

  | Message | Identity | Same content again | Different content, same identity |
  |---|---|---|---|
  | Setup | `match_id` | Ignored | Logged as a conflict, first one kept |
  | Event | `match_id` + `seq` | Ignored | Logged as a conflict, first one kept (detected for the last 300 events) |
  | Frame | `match_id` + `match_ms` | Ignored | Not detectable: a frame at or before the newest applied `match_ms` is dropped |
  | Stat panel | `match_id` + `match_ms` | Ignored | Not detectable (same rule as frames) |

  *(S3)* Within one hub a match's messages arrive in order, so frames and stat panels use a "newest `match_ms` so far"
  mark instead of a list of every key; this keeps the state small. A gap in event `seq` is logged and counted.

## 2. Trimming

- Which event fields are kept for the browser?

_Answer:_ **None are removed.** `event.data` is the complete §3 event and every frame in `positions.data.frames` is the
complete §4 frame, so the browser validates them with the same contract. Event coordinates stay in the team frame,
frames in the pitch frame (`CONTRACTS.md` §1.1). The relay calculates only score and phase (§4 below): no xG, no
statistics, no text.

## 3. Bundling

- How are 5 Hz tracking frames bundled to about one message per second?

_Answer:_

- Up to **5 consecutive frames of one period** per `positions` envelope: about one second of **match** time. At 20×
  that is about 20 `positions` envelopes per wall-clock second, not one.
- A shorter bundle is sent when no new frame arrives for 250 ms, when the period changes, and on shutdown. Frames are
  never dropped or thinned.
- The envelope's `match_ms` and `clock` are the last frame's; each frame keeps its own times.
- The open bundle is part of the saved state, so a restart doesn't lose frames.

## 4. Delivery

- Which Web PubSub group, and in which envelope (CONTRACTS.md §7)?

_Answer:_

- **Group** `match-<id>` on hub `live`, envelope shape `CONTRACTS.md` §7. The relay is the only sender on this group.
- **Numbering:** one `seq` counter per match, starting at 1, +1 per envelope across all kinds, saved with the state, so it
  continues after a restart.
- **Status:** the first envelope of a match is `status` with `phase: "pre_match"`, `period: 0`, score 0–0 and the setup.
  After that, a status follows (never precedes) the event that causes it:

  | Event | Status sent after it |
  |---|---|
  | `PeriodStart` | `live`, that period |
  | `Shot` with `shot_outcome: "goal"` | same phase, score + 1 for the scoring side |
  | `PeriodEnd`, period 1 | `half_time` |
  | `PeriodEnd`, period 2 | `full_time` |

  Only periods 1 and 2 are supported now; a period 3–5 event is logged and skipped until the generator plays extra
  time.
- **Stats:** a `kind=stats` message on `match-events` is forwarded as a `stats` envelope with the panel unchanged.
- **Send:** through the Web PubSub service API (`send_to_group`, JSON). Locally the same call goes to the stand-in.
  Each send is one HTTP call, and one at a time held the relay well below 20× on Azure (24 Oct: about 30 frames/s
  against the 113 a 20× match makes). So the Functions app sends `positions` and `stats` envelopes side by side
  (8 at once; the browser keeps the newest of those by `match_ms`, `web/specs/realtime.md` §2), while `event` and
  `status` envelopes still leave one by one in `seq` order. A commit's sends all finish before the match's lock is
  released, so one commit never overtakes another. The local runner and the tests send one at a time.
- **Save first, then send:** each envelope is written to the store before it is sent. If sending fails it is retried
  (3 attempts, 0.5 s → 1 s → 2 s); if it still fails, it is logged and the browser gets it from the snapshot on its next
  reconnect.
- **Saving** *(S3)*: the envelopes and the state of one batch are written in one Cosmos transactional batch, with an
  ETag condition on the state, so they are saved together or not at all. Batches are split into chunks of 40 messages
  to stay under Cosmos's 100 operations per transactional batch.
- **Store** (Cosmos container `screen`, partition key `match_id`):

  | Document | `id` | Holds |
  |---|---|---|
  | Envelope | `env-<seq>` (8 digits) | `{ "type": "envelope", "envelope": <one event, status or stats envelope> }` |
  | Latest positions | `positions-latest` | `{ "type": "positions", "envelope": <newest positions envelope> }` (overwritten) |
  | State | `state` | `seq` counter, phase, period, score, setup, open frame bundle, held messages, duplicate marks, counts, `open_work` |

- **Snapshot:** built from the store exactly as `CONTRACTS.md` §7.3 says (all envelope documents in `seq` order, plus
  `positions-latest`). Locally the stand-in serves `GET /api/match/<id>/snapshot`; on Azure the web app's route
  (`web/src/app/api/match/[id]/snapshot/route.ts`, Vedant) reads the same container.
- **Negotiate:** locally the stand-in's `/negotiate?groups=match-<id>`; on Azure the web app's `/api/negotiate`, which
  issues a client token allowed to join only that group.

## 5. Scaling

- Plan, warm instances, and how ordering is kept per match.

_Answer:_

- **Hosting:** Azure Functions, **Flex Consumption**, Python, one **always-ready** instance so the fast lane never
  waits for a cold start. Event Hubs trigger on both hubs, consumer group `relay`. Locally: `func start` if the
  Functions host can use the Event Hubs emulator; otherwise `relay_runner.py`, which feeds the same core with the Event
  Hubs SDK. *(S3)* Functions Core Tools isn't installed on the development laptop, so the local run uses
  `relay_runner.py`; the Function itself is first run on Azure (S4).
- **Timer:** a timer trigger every second (every 250 ms in the local runner) flushes a frame bundle idle for 250 ms and
  drops messages held too long for a setup, for every match whose state has `open_work`.
- **Ordering per match:** one partition carries one match, and the Functions host processes one partition's batches one
  at a time, so a match is never processed in parallel. The two hubs can be handled by different calls; their state
  updates for the same match are serialised through the store (read state → apply → write with an ETag check; retry on
  conflict).
- **Restarts and scale-out:** state lives in the store, not in memory, so any instance can continue a match. The
  checkpoint moves only after the batch's state and envelopes are saved; anything redelivered is caught as a duplicate.
- **Load:** one match at 20× is about 100 frames/s (≈ 20 `positions` envelopes/s) plus a few events/s. Targets (to
  measure in S3/S4): event arrival on the hub → browser under 1 s at 1×; no backlog growth at 20×.
- **Identity on Azure (no keys):** the Function's managed identity has Event Hubs Data Receiver on both hubs, Web PubSub
  Service Owner on hub `live`, and data-contributor access to the `screen` container.
- **What it counts and logs per match:** received, duplicates, conflicts, invalid, held for setup, envelopes saved and
  sent, send failures, last `seq`, lag behind the hub.

## 6. Checks

| Check | How |
|---|---|
| A full 20× match from `generator/cli.py live` arrives complete | Compare every event and frame with the recorded match; `seq` 1..N with no gaps live |
| Score and phase | Final status matches the recorded score; phases in order |
| Duplicates, conflicts, invalid messages, frames before setup | Unit tests with injected messages |
| Restart mid-match | Numbering continues, no duplicate rows after a browser refresh |
| Store down, Web PubSub down | Batch retried / snapshot catch-up, as above |
| Same run on Azure | Settings change only |
