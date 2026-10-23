# Publishing spec

> **Status: agreed.** Agreed in the spec PR for [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (M1).
> Shapes are in `CONTRACTS.md`: stat panel §7.4, match state §4.2, moment document §10.2.

Decides what the stats engine writes and sends, and how often.

**Input.** The engine reads `match-events` and `match-tracking` as consumer group `stats`, with checkpoints in Blob
Storage (Azurite locally), like the archiver.
- It ignores `kind=stats` messages: its own panels come back on the same hub.
- It drops a `seq` it has already applied (`CONTRACTS.md` §1.3).
- It never processes past a gap in `seq`. Two different bodies for one `seq` stop that match with an error.

**Restart.** A match's checkpoint stays at its setup until its `PeriodEnd` of period 2 has been processed, and only
then moves past the match. After a restart the engine replays the match from the start. Every value, panel and
moment ordinal comes out the same, so everything below is written idempotently.

**Everything follows match time** (`match_ms`), not wall time. A match streamed at 20×, a replay and a slow consumer
all give the same output.

## 1. Snapshots

- What does the match-state snapshot contain, and how often is it written?

_Answer:_

**One document per match** in Cosmos `live` / `match_state`, partition `/match_id`, `id = "state"`, upserted:

- **When:** every 5 seconds of match time, and at every `PeriodStart`, at the `PeriodEnd` of each period, and when a
  moment is written.
- **What:** the latest light panel (§2), each team's whole-match totals and each player's stats (`metrics.md` §6),
  and the `source` cursor `{event_seq, match_ms}` it was computed at (`CONTRACTS.md` §4.2).

It is the place to ask "what are the numbers **now**": the MCP server's current-stats tool and a late-joining
browser's stats both read it. It is not history: older values are in the archived panels (Cosmos `stats`) and are
not kept here. The relay's `screen` container stays the log of envelopes for the live screen; the two don't overlap.

## 2. Stat panels

- What is the `stats` envelope payload shape, and is once a second right?

_Answer:_

**Once per match second, yes.** Panel `N` describes every event with `match_ms < N × 1000`. It is built when the
first **event** at or after `N × 1000` arrives, from the state before that event. A second with no events gets its
panel then too, so there is one panel for every whole second. Frames never trigger a panel: they arrive on the other
hub at their own pace, and letting them trigger panels would make panels differ between a live run and a replay.
Tracking-only values therefore appear only in the heavy block. At 20×, a second with no events gets its panel when
the next event arrives, usually 1–3 seconds of match time later, about 0.1 s of wall time. The panel at each
`PeriodEnd` describes the period including its last event. It is sent on `match-events` with partition key `match_id` and properties `kind=stats` and
`match_id`.
- The relay forwards it as a `stats` envelope with the panel unchanged.
- The archiver saves it as `stats-<match_ms, 9 digits>`. Its `match_ms` is a whole second, so a repeat after a
  restart overwrites the same document.
- At 20× this is about 20 small messages a second, the same as the relay's position bundles.

**Light panel, every second** (`CONTRACTS.md` §7.4 has the full example):

| Field | Meaning |
|---|---|
| `match_id`, `match_ms`, `clock`, `period`, `source_seq` | When it was computed, and the last event included |
| `score` | `{home, away}` from goal shots only |
| `teams.home` / `teams.away` | `team_id`; `possession_pct`; `shots`; `shots_on_target`; `xg`; `passes`; `pass_completion_pct`; `ppda_last_10min`; `pressures_per_opp_pass_last_10min`; `momentum_share_last_10min_pct`; `press_height_last_10min_m` |
| `momentum` | The current 5-minute bucket: `{period, bucket, home, away}` weighted points |
| `low_sample` | The list of fields above that are below their minimum sample (`metrics.md` §7) and sent as `null` |

**Heavy block** (field `heavy`) on the panel at every whole minute, and at each period's `PeriodEnd`:
- `momentum_buckets`: every bucket so far.
- `pass_network`: per team, nodes `{player_id, x, y, passes}` and links `{from, to, count}` with count ≥ 3.
- `pressing_grid`: per team, 9 × 6 counts.
- `zones`: per team, 18 touch counts.
- `players`: per player, `{player_id, distance_km, top_speed_kmh, sprints}` when tracking is present.
- `shots`: per team, every shot so far, oldest first: `{event_id, player_id, period, match_ms, x, y, xg, outcome,
  situation, body_part}`. Coordinates are in the shooting team's frame (`x` = 100 is the goal it attacks). `xg` is the
  engine's (`metrics.md` §1, 2 decimals) and `outcome` is the event's `shot_outcome`. About 25 shots a match, about
  2 KB. Added in `PLAN_web_football-revamp` for the xG race and shots sized by xG.

A panel is about 1 KB; with the heavy block, about 6 KB.

**Failure.** A send is retried up to 3 times. After that, that second's panel is skipped: the next one supersedes it.

## 3. Moments

- How is a moment document written so the agent workflow starts exactly once?

_Answer:_

**The document** is `CONTRACTS.md` §10.2 for every trigger type. Its `evidence` follows `evidence-packs.md`, and its
`context` adds `players` (`evidence-packs.md` §3). It goes in Cosmos `live` / `moments`, partition `/match_id`.

**Its id** is `moment_id = MO-<match number, 4 digits>-<ordinal, 4 digits>`. The ordinal counts the match's moments
from 0001, in the order their triggering events are processed. Within one event, the order follows `triggers.md` §1
(goal, red card, penalty, big chance, shot cluster, momentum swing, press change, sprint, milestone). A replay of the
same events gives the same ordinals, so the id is stable across restarts (`CONTRACTS.md` §10.1 step 5). Ordinal
9999 is the limit: the next moment fails loudly.

**Writing it once:**
1. The document is written with **create**, never upsert.
2. If a document with that id already exists and is identical (ignoring Cosmos system fields), that's a replay and
   nothing happens.
3. If it exists and differs, that's a conflict. The match stops with an error, and the old document stays.
4. The match's checkpoint doesn't pass the event until its moments are written.

**Starting the workflow.** The workflow starts from the Cosmos change feed on `moments`, and only on documents with
`kind = "moment"`. The feed delivers at least once, so the workflow de-duplicates by `moment_id` (its job and outbox
records live in the same container with other `kind` values; agents workflow spec). The stats engine never writes
anything else to `moments` and never edits a moment after creating it.

**Timing.** A moment is written while its triggering event is being processed, before that match's next panel. At
20× it reaches Cosmos within about 1 wall-clock second of the event. Unmeasured; plan AC-05 measures it.
