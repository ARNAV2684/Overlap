# Live mode, batch mode and realism report spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_live-mode`](../../plans/done/PLAN_generator_live-mode.md). Builds on
> [`engine.md`](engine.md), whose output (setup, events, tracking frames) this spec sends, records and summarises.

Decides how matches are played out: streamed live, or generated as a full season with a realism report. Where the
temporary `mock/` already made a choice that other layers build against, this spec keeps it, so nothing changes for
them when the generator replaces the mock.

## 1. Live mode

- Which speeds are supported (1×, 5×, 20×)?
- How are events and tracking frames sent to Event Hubs (partition key, batching)?
- What happens on a send failure?

_Answer:_

**Speeds:** 1× (real time), 5× and 20×, plus any other positive number for testing. The engine plays the whole match
in memory first ([`engine.md`](engine.md)); live mode then releases each message when the wall clock reaches its
`match_ms ÷ speed` after kickoff. Before kickoff it waits a configurable lead-in (default 30 s at 1×, shorter at higher
speeds); half-time is replayed at the same speed-up (15 minutes ÷ speed, capped at 60 s for 20×).

**Event Hubs** (namespace from configuration, by variable name only):

| Hub | Messages | Partition key | Properties |
|---|---|---|---|
| `match-events` | The setup (first, once), then every event in `seq` order | `match_id` | `kind` = `setup` / `event`, `match_id` |
| `match-tracking` | Every 5 Hz tracking frame | `match_id` | `kind` = `tracking`, `match_id` |

- Bodies are the JSON objects of [`CONTRACTS.md`](../../CONTRACTS.md) §2–§4, `content_type: application/json`.
- The partition key keeps one match on one partition, so its messages stay in order.
- Sending the setup on `match-events` with `kind=setup` is the mock's choice; `CONTRACTS.md` doesn't say where the
  setup travels yet. This spec keeps it, and asks for it to be written into `CONTRACTS.md`
  ([`PLAN_generator_live-mode`](../../plans/done/PLAN_generator_live-mode.md), decision L1).
- **Batching:** messages due within the same 200 ms are sent together in one batch per hub, so a 5 Hz stream is
  about five sends a second per hub.
- **Sign-in:** the Azure identity of whoever runs it (`DefaultAzureCredential`), or the local emulator's fixed
  connection string. No keys are stored.
- Several matches can stream at once, each on its own timer.

**Send failure:** the Event Hubs client retries with backoff. If a batch still fails, live mode keeps the messages,
retries for up to 60 s, then stops that match with an error naming the match and the last `seq` sent. Re-sending after
a reconnect may duplicate messages; consumers drop a `seq` they already applied ([`CONTRACTS.md`](../../CONTRACTS.md)
§1.3). A failure never changes the match: it was fully played before streaming began.

## 2. Recorded matches

- What file format does a recorded match use (setup + events + tracking chunks)?
- Where are recorded matches saved?

_Answer:_

One folder per match, `<match_id>/` (the mock's layout, unchanged):

| File | Contents |
|---|---|
| `setup.json` | The match setup |
| `events.ndjson` | One event per line, in `seq` order |
| `tracking.ndjson.gz` | One tracking frame per line, gzipped |
| `summary.json` | Score, shots, possession, the seed and the `world_version` used |

The browser-envelope file the mock also writes (`envelopes.ndjson.gz`) belongs to the screen relay and is not written
by the generator. **Where:** generated matches go to `data/generated/matches/` (gitignored); a few curated samples
are copied to `data/recorded/` and committed, small enough to review.

## 3. Batch mode

- How many matches per season, and how is the fixture list built?
- Where are season files stored?

_Answer:_

- **Season:** every club plays every other club home and away. With 10 clubs that is 18 matchweeks and 90 matches;
  with the two reference clubs only, a **repeat run** plays the same fixture any number of times with different
  seeds (the two-club check before the other 8 clubs are built).
- **Fixture list:** the standard round-robin (circle) method, shuffled with the season seed, second half mirroring
  the first with home and away swapped. Match ids are `SYN-NNNN` in fixture order; each match seed comes from the
  season seed and the match id.
- **Season state between matches:** suspensions only (a red card bans the next match; five yellows ban one match).
  Fatigue, form and injuries do not carry over in v0.
- **Storage:** `data/seasons/<season_id>/` (gitignored): the fixture list, one `summary.json` per match, all events,
  and the league table. Tracking is kept only when asked for (about 13 MB per match).
- **Season history for Cosmos DB** (the expanded DFD's `season` container) is read from these files by a separate
  loader; who writes to Cosmos is decided outside this spec.

## 4. Realism report

- Which metrics does it compare with CALIBRATION.md, and how are they charted?

_Answer:_

- It reads a season or a repeat run, measures every row of [`CALIBRATION.md`](../../CALIBRATION.md) that is
  `sourced` or `weak source`, and writes a Markdown report: a table of target range, measured value and pass or fail,
  plus a chart per metric (measured distribution with the target range shaded).
- For the two reference clubs it also prints their **answer key**: possession, pressing (passes allowed per
  defensive action), high regains, counter-shot share and set-piece share for each side, and each club's top scorer.
- Output goes to `data/generated/reports/<run>/report.md` with the charts beside it; the latest report is linked
  from `CALIBRATION.md`.

## 5. Command line

- Which commands and options does the CLI expose?

_Answer:_

Run from `generator/` (`uv run python cli.py …`):

| Command | Does | Main options |
|---|---|---|
| `world` | Builds and saves the world | `--season S1`, `--seed` |
| `play` | Plays one match and records it | `--home SKH --away AMH`, `--match-id`, `--seed`, `--out` |
| `live` | Plays and streams one or more matches | `--home`, `--away` (repeatable), `--speed 1|5|20`, `--hubs emulator|azure|off`, `--namespace` (from configuration), `--stdout`, `--record` |
| `season` | Plays a full season, or a repeat run with `--repeat N` | `--season`, `--seed`, `--repeat`, `--keep-tracking` |
| `report` | Writes the realism report for a season or run | `--season` or `--run` |
| `validate` | Plays matches and checks contracts, invariants and same-seed reproducibility | `--matches N`, `--seed` |

Every command exits non-zero with a clear message on error and prints the seeds it used.
