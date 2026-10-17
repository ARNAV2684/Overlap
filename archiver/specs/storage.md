# Storage spec

> **Status: draft for review.** Plan: [`PLAN_archiver_archive-flow`](../../plans/active/PLAN_archiver_archive-flow.md).
> Stored format: [`CONTRACTS.md`](../../CONTRACTS.md) §4.1. Set this line to `> **Status: agreed.**` in the PR that
> approves it.

Decides how every event and tracking frame is kept for replays. The archiver reads both hubs as consumer group
`archiver`, independently of the screen relay, so live delivery never waits for storage. The same code runs locally
(Cosmos emulator, Azurite) and on Azure (Cosmos, Blob Storage, managed identity); only settings change.

| Hub | Consumer group | Messages (`kind`) | Stored in |
|---|---|---|---|
| `match-events` | `archiver` | `setup` | Cosmos `matches` |
| `match-events` | `archiver` | `event` | Cosmos `events` |
| `match-events` | `archiver` | `stats` (stat panels) | Cosmos `stats` |
| `match-tracking` | `archiver` | `tracking` | Blob `tracking` |

Each message's identifying fields are checked (`match_id`, and `event_id`/`seq`, `period`/`match_ms` as relevant);
the screen relay does the full contract check. An invalid message is logged, counted and skipped.

## 1. Events

- Where are events stored (Cosmos `events`), with which partition key and id?

_Answer:_

- **Account and database:** one Cosmos account on the **free tier**, database `live` with **shared database
  throughput** (1,000 RU/s shared by all containers). Every container uses partition key `/match_id`.
- **`events`:** each §3 event unchanged, plus `id` = `event_id`. Written with **upsert**, so a redelivered event
  overwrites itself and nothing is duplicated.
- **`matches`:** one document per match, `id` = `match_id`: `status` (`live`, then `finished`) and the full `setup`.
  Written with upsert when the setup arrives. At the `PeriodEnd` of period 2 the archiver adds `result`: the score
  (counted from the stored `Shot` events with `shot_outcome: "goal"`, so it is correct even after redelivery) and the
  number of stored events. Tracking minutes are not listed: the tracking hub can still be catching up at full time, so
  readers list the files instead.
- **`stats`:** each stat panel unchanged, plus `id` = `stats-<match_ms, 9 digits>`, upserted.
- **Events before their setup:** stored anyway (they don't need the setup); a `matches` document without a setup means
  the setup hasn't arrived yet.

## 2. Tracking

- What is the per-minute chunk format and compression, and where in Blob Storage does it live?

_Answer:_

- **Container** `tracking`. **One file per minute of play:** `<match_id>/p<period>/m<MMM>.ndjson.gz`, where `MMM` is
  `period_ms ÷ 60000`, three digits. About 95 files of ~170 KB per match.
- **Content:** UTF-8, one §4 frame per line in ascending `match_ms`, gzip-compressed.
- **Written without losing frames on a crash:** each batch's frames for a minute are compressed into their own gzip
  member and **staged as a block** of that minute's blob (block id from the first and last `match_ms`, so restaging the
  same batch replaces it). Then the blob is **committed** with all its blocks, committed and staged, in `match_ms`
  order. This happens after every batch, so there is no open state to lose: a crash between staging and committing
  is repaired by the next commit of that minute, and the Event Hubs checkpoint moves only after the commit. Joined
  gzip members are a valid gzip file.
- **Repeats:** a redelivered batch can overlap a staged block, so a file may contain a frame twice; readers keep the
  first frame per `match_ms`.

## 3. Replay files

- What does the replay API read, and in what order?

_Answer:_

`archiver/reader.py` rebuilds a stored match; Vedant's replay route builds §7 envelopes from it.

1. `matches/<match_id>`: status and setup (404 if missing, "not ready" if there is no setup).
2. `events` for the match, ordered by `seq`.
3. Tracking files listed under `<match_id>/`, ordered by period then minute; frames read in order, repeats dropped.
4. `stats` for the match, ordered by `match_ms`.

A match still `live` can be read too: it returns what is stored so far.

## 4. Retention

- How long is data kept, and how is it cleaned up after judging?

_Answer:_ until **10 Nov + 7 days** (judging ends 10 Nov). Then the whole resource group is deleted, which removes the
Cosmos account and the Storage account. Locally, `docker compose down` clears everything.

## 5. Running it

- **Azure:** two Event Hubs triggers in the relay's Functions app (`archive_events`, `archive_tracking`), consumer group
  `archiver`. No timer is needed: every batch commits its minutes. Managed identity: Cosmos data contributor on `matches`,
  `events`, `stats`; Storage Blob Data Contributor on `tracking`.
- **Locally:** `archiver/main.py` reads both hubs with the Event Hubs SDK, checkpoints in Azurite after each stored batch.
- **Load:** at 20× about 100 frames/s and 8 events/s per match. Must keep up without a growing backlog (measured in A2).
- **Counted and logged per match:** events, panels and frames stored, minutes committed, duplicates, invalid, lag.

## 6. Checks

| Check | How |
|---|---|
| Round trip | A full 20× `generator/cli.py live --record` match archived and read back identical: setup, every event, every frame, score |
| Crash mid-match | Kill and restart the archiver; read-back still identical |
| With the relay | Relay end-to-end check passes while the archive fills |
| Unit | Routing, upserts, minute boundaries, period change, staging and commit, repeats, invalid messages |
