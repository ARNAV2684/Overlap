# Contracts (v0 — DRAFT for team review)

Every layer builds against the message shapes in this file. Until code exists, **this document is the source of
truth.** Once the shared models are written, they will implement exactly what is described here, and this file
will be kept in step with them.

To change a contract, open a PR that edits this file and say which layers are affected. Both sides of a hand-off
should agree before it merges.

| Hand-off | Contracts |
|---|---|
| Generator → stats engine, screen relay, archiver | Match setup, Event, Tracking frame |
| Stats engine → agents | Evidence pack, Narrated line |
| Agents → web app | Overlay, Envelope |

All clubs, players, venues and numbers below are **invented**.

---

## 1. Conventions

### 1.1 Pitch and coordinates

The pitch is a standard **105 × 68 m**. Coordinates run 0–100 on both axes; metres = `x × 1.05`, `y × 0.68`.

There are **two frames**, and every message says which one it uses:

| Frame | Used by | `x` | `y` |
|---|---|---|---|
| **Team frame** | Events | 0 = acting team's own goal line → 100 = opponent's | 0 = acting team's **left** touchline (facing the opponent's goal) → 100 = its right |
| **Pitch frame** | Tracking, rendering | 0 = west goal line → 100 = east | 0 = north touchline → 100 = south |

- The **home team attacks east in periods 1 and 3, west in periods 2 and 4.**
- On screen, east is right and north is up, so **pitch-frame coordinates map straight onto SVG with no flips**:
  `svg_x = x × 1.05`, `svg_y = y × 0.68` in a `0 0 105 68` viewBox.
- A team attacking east sees north on its left, so for that team both frames are identical. For a team attacking
  west, convert with the 180° rotation `(x, y) → (100 − x, 100 − y)`. This conversion lives in one shared helper;
  nobody hand-flips coordinates anywhere else.
- For a defensive event (tackle, interception, pressure, committed foul), the acting team is the defender, so the
  coordinates are in the defender's frame.
- **Sanity check:** a left winger's events have small `y`, and while their team attacks east they render near the
  top of the screen.

### 1.2 Time

| Field | Meaning | Use it for |
|---|---|---|
| `period` | 1, 2 (halves) · 3, 4 (extra time) · 5 (shootout) | Which half a thing happened in. Never infer the half from the minute. |
| `period_ms` | Milliseconds since this period's kickoff | Bucketing within a period |
| `match_ms` | **Monotonic** play time across the whole match (half-time excluded) | Ordering, windows, `show_at_ms`, replay timing |
| `clock` | Display string, e.g. `62:14`, `45+2:10` | Showing to people. Never sort or compute with it. |

Example: if the first half runs to 47:00, the second half's `62:14` is `period_ms = 1,034,000` and
`match_ms = 2,820,000 + 1,034,000 = 3,854,000`. Stoppage time can never collide with the next period.

### 1.3 IDs

| ID | Format | Example |
|---|---|---|
| Match | `SYN-NNNN` | `SYN-0042` |
| Team | 3 capital letters | `NBR` |
| Player | `TEAM-NN` (shirt number) | `NBR-11` |
| Event | `SYN-NNNN-NNNNN` (match + seq) | `SYN-0042-01186` |
| Moment | `MO-NNNN-NNNN` | `MO-0042-0031` |
| Overlay | `OV-NNNN-NNNN` | `OV-0042-0087` |
| Season | `S<n>` | `S1` |

`seq` is unique and strictly increasing per match. Delivery is at-least-once, so **every consumer drops a `seq` it
has already applied.**

Consumers reject unknown fields, so a typo fails loudly instead of being silently dropped.

### 1.4 Event Hubs transport

How the generator (and the temporary mock) put messages on Event Hubs. This is the behaviour of the generator's live
mode ([`generator/specs/live-and-batch.md`](generator/specs/live-and-batch.md) §1, decision L1).

| Hub | Messages, in order | `kind` property |
|---|---|---|
| `match-events` | The match setup (§2), once per match and **before any of that match's events**; then every event (§3) in `seq` order | `setup`, then `event` |
| `match-tracking` | Every 5 Hz tracking frame (§4), in time order | `tracking` |

- **Partition key** `match_id` on both hubs, so one match stays on one partition and in order.
- **Properties:** every message carries the application properties `kind` and `match_id`. The body is the JSON object
  from §2–§4, with content type `application/json`.
- Consumers of `match-events` use `kind` to tell the setup from events. The setup has no `seq`.
- A send retry may deliver a message twice; consumers drop an event whose `seq` they have already applied (§1.3).

---

## 2. Match setup

Sent once, before kickoff.

```json
{
  "match_id": "SYN-0042",
  "seed": 42,
  "competition": "Synthetic League · Season 1 · Matchweek 9",
  "season_id": "S1",
  "venue": { "name": "Riverside Ground", "city": "Northbridge" },
  "kickoff_utc": "2026-10-24T19:00:00Z",
  "conditions": { "temperature_c": 11.5, "precipitation": "light", "wind_ms": 6.0, "attendance": 38250 },
  "storylines": ["late_pressure_surge"],
  "teams": {
    "home": {
      "team_id": "NBR",
      "name": "Northbridge FC",
      "colours": { "primary": "#B3202A", "secondary": "#1C2340" },
      "formation": "4-3-3",
      "style": { "press_intensity": 0.78, "directness": 0.35, "width": 0.70 },
      "lineup": [
        { "player_id": "NBR-11", "name": "Jonah Okafor", "pos": "LW", "shirt": 11,
          "attr": { "pace": 92, "passing": 70, "dribbling": 87, "finishing": 60, "tackling": 60, "stamina": 76 } }
      ],
      "bench": []
    },
    "away": { "team_id": "HBA", "name": "Harbour Athletic", "...": "same shape" }
  }
}
```

- `seed`: same seed, same match.
- `conditions` (optional in v0): the match's weather and crowd, decided by the generator before kickoff.
  `temperature_c` (°C, one decimal), `precipitation` (`none`, `light`, `heavy`), `wind_ms` (m/s, one decimal, ≥ 0),
  `attendance` (whole number, ≥ 0). The generator always sends it; the temporary mock may leave it out, so
  consumers accept a setup with or without it. Agents may describe conditions in words ("in heavy rain"); any
  number about them reaches an agent only through an evidence pack.
- `season_id` scopes every season aggregate (milestones, totals). No unscoped season reads.
- `style` values are 0–1. Player ratings are 1–99. `lineup` is exactly 11 players, goalkeeper first; the example
  shows one for brevity.
- Kit colours must be distinguishable from each other and readable on dark and light backgrounds. The world
  builder enforces this when it invents clubs.

## 3. Event (`match-events` hub, team frame)

One event per action.

```json
{
  "event_id": "SYN-0042-01186", "match_id": "SYN-0042", "seq": 1186, "possession_id": 214,
  "period": 2, "period_ms": 1034000, "match_ms": 3854000, "clock": "62:14",
  "team_id": "NBR", "player_id": "NBR-09", "type": "Shot",
  "x": 88.0, "y": 29.0, "body_part": "right_foot", "under_pressure": false, "qualifiers": [],
  "shot_outcome": "saved", "situation": "open_play", "shot_speed_kmh": 96.0,
  "goal_mouth_y": 54.0, "goal_mouth_z": 0.4,
  "assisted_by": "NBR-11", "key_pass_event_id": "SYN-0042-01185"
}
```

**Types:** `Pass`, `Carry`, `TakeOn`, `Shot`, `Save`, `Tackle`, `Interception`, `Clearance`, `Aerial`, `Pressure`,
`BallRecovery`, `Foul`, `Card`, `Substitution`, `Offside`, `Corner`, `PeriodStart`, `PeriodEnd`.

**Rules:**

| Rule | Why |
|---|---|
| Every event except `PeriodStart` / `PeriodEnd` has `team_id` and `player_id` | |
| A successful `Pass` has an exact `receiver_id`, never the passer | We generate it, so we never infer it |
| A `Shot` has `shot_outcome` (`goal`, `saved`, `missed`, `blocked`, `woodwork`) and `situation` (`open_play`, `counter`, `corner`, `free_kick`, `penalty`, `throw_in`) | A goal is a `Shot` with `shot_outcome: goal`. There is no separate goal event to double-count. |
| A `Shot` created by a key pass carries `assisted_by` and `key_pass_event_id` | Chance creation is linked exactly, not guessed from nearby events |
| A `Foul` is **one** event, by the offender, with `fouled_player_id` | A foul is never stored twice, so foul counts and PPDA can't be inflated |
| A `Card` has `card` (`yellow`, `second_yellow`, `red`); a `Substitution` has `player_on_id` (`player_id` is the player going off) | |
| `shot_outcome` appears only on shots | |

**Other fields:** `outcome` (`success` / `fail`), `x`, `y`, `end_x`, `end_y`, `body_part` (`left_foot`,
`right_foot`, `head`, `other`), `under_pressure`, `qualifiers` (e.g. `switch_of_play`, `cutback`, `key_pass`),
`ball_speed_kmh`, `target_player_id` (on `Pressure`).

**Generator invariants (to be tested):** the score equals the number of goal shots; there are no events after full
time; a successful pass's receiver is on the passer's team; no player acts after a red card; the same seed produces
the same match.

## 4. Tracking frame (`match-tracking` hub, pitch frame)

5 Hz.

```json
{
  "match_id": "SYN-0042", "period": 2, "period_ms": 1027400, "match_ms": 3847400,
  "ball": { "x": 24.4, "y": 89.6, "z": 0.0, "speed_kmh": 31.8 },
  "players": [
    { "player_id": "NBR-11", "x": 24.0, "y": 90.0, "speed_kmh": 33.1, "dist_m": 8842.0 }
  ]
}
```

In period 2 the home team attacks west, so Okafor's team-frame position `(76, 10)` on the left wing is pitch-frame
`(24, 90)`.

- The screen relay bundles up to five frames per `positions` envelope: about one message per **match** second (§7.2),
  so about 20 per wall-clock second at 20×. The browser tweens between them.
- The archiver stores tracking as compressed **per-minute chunks** in Blob Storage, not one document per frame (§4.1).
- Speeds must come from smooth motion (acceleration and top-speed limits), not noise, or sprint tags and distance
  covered become meaningless.

### 4.1 Archived match (archiver → replay, recap, judges' link)

Every match is kept permanently by the archiver ([`archiver/specs/storage.md`](archiver/specs/storage.md)), so replays
never depend on Event Hubs. All Cosmos containers are in database `live` with partition key `/match_id`.

| Where | Holds | Document / file |
|---|---|---|
| Cosmos `matches` | The setup and, at full time, the result | `{ "id": <match_id>, "match_id", "status": "live" \| "finished", "setup": <§2>, "result": { "score": { "home", "away" }, "events" } }` (`result` only when finished) |
| Cosmos `events` | Every event | The §3 event unchanged, plus `"id": <event_id>` |
| Cosmos `stats` | Every stat panel | The panel unchanged, plus `"id": "stats-<match_ms, 9 digits>"` |
| Blob container `tracking` | Every tracking frame | `<match_id>/p<period>/m<minute of the period, 3 digits>.ndjson.gz`: gzip, one §4 frame per line, ascending `match_ms` |

- **Reading a match:** the `matches` document first (setup, status); events ordered by `seq`; frames from the tracking
  files ordered by period then minute; stat panels ordered by `match_ms`.
- A tracking file can contain the same frame twice after a redelivery: readers keep the first frame for each
  `match_ms` and drop repeats. A file may be several gzip members joined together; standard gzip readers handle this.
- The minute in a file name is `period_ms ÷ 60000` (minute 0 of period 2 is the first minute after kick-off).
- Replays sent to browsers use the §7 envelope, built from this format by the replay route.

### 4.2 Match state (stats engine → Cosmos `match_state`)

The stats engine's latest numbers for a match: one document per match, overwritten every 5 seconds of match time and
at period starts and ends ([`stats/specs/publishing.md`](stats/specs/publishing.md) §1). Database `live`, container
`match_state`, partition `/match_id`.

```json
{ "id": "state", "match_id": "SYN-0042", "kind": "match_state", "schema_version": 1,
  "source": { "event_seq": 1186, "match_ms": 3854000 },
  "phase": "live", "period": 2, "clock": "62:14", "score": { "home": 1, "away": 0 },
  "panel": { "...": "the latest light stat panel, §7.4" },
  "totals": { "home": { "...": "whole-match team totals" }, "away": { } },
  "players": { "NBR-09": { "...": "player stats" } } }
```

- Readers: the MCP server's current-stats tool and a late-joining browser's stats. It is "now", not history:
  past panels are in Cosmos `stats` (archiver, §4.1).
- `source` is the last event included. Every number in it was computed from events up to `source.event_seq`.
- Field lists: [`stats/specs/metrics.md`](stats/specs/metrics.md) §6. A value below its minimum sample is `null` and
  listed in `panel.low_sample`.

## 5. Evidence pack (stats engine → agents)

The **only** source of numbers an agent may cite.

```json
{
  "moment_id": "MO-0042-0031", "match_id": "SYN-0042", "trigger": "big_chance",
  "period": 2, "match_ms": 3854000, "clock": "62:14",
  "team_id": "NBR", "player_ids": ["NBR-11", "NBR-09"],
  "event_ids": ["SYN-0042-01183", "SYN-0042-01184", "SYN-0042-01185", "SYN-0042-01186"],
  "window": { "from_ms": 3420000, "to_ms": 3854000 },
  "facts": [
    { "key": "xg", "value": 0.31, "unit": "xG", "decimals": 2, "label": "Expected goals of Bianchi's shot" },
    { "key": "shots_last_5min", "value": 3, "decimals": 0, "label": "Northbridge shots in the last 5 minutes, this one included" },
    { "key": "high_regains_since_55min", "value": 5, "decimals": 0, "label": "Northbridge ball recoveries in Harbour's half since the 55th minute" },
    { "key": "momentum_share_last_10min_pct", "value": 71, "unit": "%", "decimals": 0, "label": "Northbridge share of weighted attacking actions in the last 10 minutes" },
    { "key": "player_top_speed_kmh", "value": 33.1, "unit": "km/h", "decimals": 1, "label": "Okafor's top speed during the move" }
  ]
}
```

- `trigger`: `goal`, `red_card`, `penalty`, `big_chance` (shot xG ≥ 0.20), `shot_cluster` (3 shots in 5 min, §10.1),
  `momentum_swing`, `press_change`, `sprint`, `milestone`, and the insight moments `head_to_head` (a player clearly
  winning the battle with the other side's leader in the same role), `connection` (a team's new top passing pair over
  the last 15 minutes) and `workhorse` (a new hardest worker). Exact rules and cooldowns:
  [`stats/specs/triggers.md`](stats/specs/triggers.md). The facts each trigger's pack holds:
  [`stats/specs/evidence-packs.md`](stats/specs/evidence-packs.md). Every pack is stored inside a moment document
  (§10.2).
- `facts[]`: `key`, `value`, optional `unit`, `decimals` (the precision a narrated value is rounded to) and
  `label`. Keys are unique within a pack.
- **Fact key naming:** snake_case with the window and unit in the name, so a key can't be misread:
  `shots_last_5min`, `high_regains_since_55min`, `momentum_share_last_10min_pct`, `player_top_speed_kmh`.
- `window` (in `match_ms`), `event_ids` and `player_ids` tie the moment to its evidence.
- **Players are on the moment's team** (`team_id`), with one exception: a `head_to_head` pack has exactly two
  `player_ids`, the leader (on `team_id`) first and the **rival** (the other side's leader in the same role) second.
  Both are in `context.players` (§10.2), so the line may name the rival; their numbers are the `rival_*` facts.

### 5.1 Narrated line and fact-checking

The narrator returns its text **plus `claims`**: one per number it used.

```json
{
  "mode": "analyst", "lang": "en",
  "text": "0.31 xG cutback, Northbridge's 3rd shot in 5 minutes. 5 high regains since the 55th minute.",
  "claims": [
    { "key": "xg", "value": 0.31 },
    { "key": "shots_last_5min", "value": 3 },
    { "key": "high_regains_since_55min", "value": 5 }
  ]
}
```

The fact-checker works in two steps:
1. **In plain code:** every claim's key exists in the pack, and its value equals the fact rounded to `decimals`.
   Every number in `text` is covered by a claim.
2. **By a model:** non-numeric claims are supported by the evidence (e.g. "skins his man" needs a completed
   `TakeOn`).

A failed check goes back to the narrator (at most 2 rewrites). After that, a template line is used and labelled as
a fallback. Translations are re-checked so every number survives unchanged.

## 6. Overlay (agents → Cosmos `overlays` + Web PubSub)

```json
{
  "overlay_id": "OV-0042-0087", "match_id": "SYN-0042", "moment_id": "MO-0042-0031",
  "clock": "62:14", "show_at_ms": 3857000, "duration_ms": 6000, "priority": "high", "kind": "moment",
  "modes": {
    "casual": {
      "en": "Big chance! Okafor skins his man and Bianchi forces a save.",
      "hi": "बड़ा मौका! ओकाफ़ोर ने डिफेंडर को छकाया, बियांकी का शॉट रोका गया।",
      "es": "¡Ocasión clara! Okafor supera a su marcador y Bianchi obliga al portero a intervenir."
    },
    "analyst": { "en": "0.31 xG cutback, Northbridge's 3rd shot in 5 minutes. 5 high regains since the 55th minute." }
  },
  "visual": {
    "component": "shot_map",
    "window_ms": [3420000, 3854000],
    "highlight": { "team_id": "NBR", "event_id": "SYN-0042-01186" }
  },
  "player_tags": [{ "player_id": "NBR-11", "label": "Top speed 33.1 km/h" }],
  "verified": true,
  "fallback": false,
  "facts_checked": ["xg", "shots_last_5min", "high_regains_since_55min", "player_top_speed_kmh"]
}
```

- `show_at_ms` is in `match_ms`; `duration_ms` is how long it stays up; `priority` is `low` / `normal` / `high`;
  `kind` is `moment` / `player_tag` / `recap`.
- `modes`: text per viewer mode (`casual`, `analyst`, `player`) and language (`en`, `hi`, `es`). English is
  always present for every mode included.
- `visual.component` is one of `momentum_tide`, `shot_map`, `pass_network`, `pressing_zones`, `heatmap_zones`,
  `stat_bars`, `key_events`, and the live insight cards `head_to_head`, `connections`, `engine_room`
  (`web/specs/screens.md` §2.8). `window_ms` (`[from, to]`) and `highlight` (`team_id`, `player_id`, `event_id`,
  `zone`) are optional.
- `verified` is true **only** when the fact-checker passed every number; `fallback` marks template lines. A line
  is never both. `facts_checked` lists the fact keys that were verified, all from the moment's evidence pack.

## 7. Envelope (everything sent to browsers)

```json
{ "seq": 4182, "kind": "overlay", "match_id": "SYN-0042", "match_ms": 3857000, "clock": "62:17", "data": { } }
```

`kind` is `event`, `positions`, `stats`, `overlay`, `player_tag`, `recap` or `status`. Snapshots, live socket
messages and replay files all use this one shape, so the client has one code path.

**Web PubSub groups (hub `live`):**

| Group | Carries |
|---|---|
| `match-<id>` | `event`, `positions`, `status` and `stats`, all sent by the screen relay |
| `match-<id>-<mode>-<lang>` | Overlays for one audience |
| `match-<id>-player-<playerId>` | Tags for followers of one player |

### 7.1 Senders and numbering

- **One sender per group.** The screen relay is the only sender on `match-<id>`. Other producers never send to that
  group directly: the stats engine puts its stat panels on `match-events` with application property `kind=stats`, and
  the relay forwards them as `stats` envelopes.
- **`seq` belongs to the group.** It starts at 1 for a match and goes up by one for every envelope the group's sender
  sends, across all kinds. It survives a relay restart (the relay stores it). It is not the event's own `seq` (§3),
  which stays unchanged inside `data`.
- **Clients dedupe on `seq` within one group.** A client that joins several groups keeps one dedupe set per group.
- `match_ms` and `clock` describe the content (below); envelope order is send order, so `match_ms` can step back
  slightly between kinds. Clients order the timeline by `match_ms`, never by `clock`.

### 7.2 Payloads on `match-<id>`

| `kind` | `data` | Envelope `match_ms` / `clock` |
|---|---|---|
| `event` | The complete §3 event, unchanged | The event's |
| `positions` | `{ "frames": [ … ] }`: 1 to 5 complete §4 frames from one period, in `match_ms` order. Five frames ≈ one second of match time | The last frame's |
| `status` | `{ "phase", "period", "score": { "home", "away" } }`; the first status of a match (`phase: "pre_match"`) also has `"setup"` (the complete §2 setup) | The triggering setup or event's (0 and `"0:00"` before kickoff) |
| `stats` | The stat panel (§7.4), unchanged | The panel's (a whole match second) |

- `phase` is `pre_match`, `live`, `half_time` or `full_time`; `period` is 0 before kickoff, then 1 or 2.
- A status is sent **after** the event that causes it: `PeriodStart` (→ `live`), a `Shot` with
  `shot_outcome: "goal"` (score + 1 for that side), `PeriodEnd` of period 1 (→ `half_time`) and of period 2
  (→ `full_time`). The score only ever comes from goal shots.
- Frames are never dropped: a short bundle is sent when frames pause or the period changes.

```json
{ "seq": 3, "kind": "status", "match_id": "SYN-0042", "match_ms": 0, "clock": "0:00",
  "data": { "phase": "live", "period": 1, "score": { "home": 0, "away": 0 } } }
```

### 7.3 Snapshot (catch-up)

A browser that joins late or reconnects joins the group first, holds live messages back, fetches the snapshot, merges
the two by `seq` and continues live.

`GET /api/match/<id>/snapshot` returns:

```json
{ "match_id": "SYN-0042",
  "setup": { },
  "status": { "seq": 1204, "kind": "status", "...": "the latest status envelope" },
  "envelopes": [ ],
  "rejected": { "count": 0, "samples": [] } }
```

- `envelopes`: every `event` and `status` envelope sent so far, the latest `positions` envelope, and of the `stats`
  envelopes the newest panel and the newest panel with a `heavy` block (panels are cumulative), in `seq` order. Older
  `positions` and `stats` are left out, so `seq` has gaps; clients never assume +1.
- `rejected`: envelopes the server could not include because they failed validation; `samples` holds up to five short
  descriptions. Always present, `count: 0` when nothing was rejected.
- `404` for an unknown match, `503` while the match has no setup yet; error bodies are `{ "error": "<code>" }`.
- The same shape is served locally (Web PubSub stand-in) and on Azure (the web app's snapshot route reading the relay's
  store).

### 7.4 Stat panel (stats engine → `match-events` → relay → browsers; archiver)

Sent by the stats engine once per match second on `match-events` (properties `kind=stats`, `match_id`; partition key
`match_id`). The relay forwards it as a `stats` envelope's `data`, unchanged. The archiver keeps it in Cosmos `stats` as
`stats-<match_ms, 9 digits>`. Full rules: [`stats/specs/publishing.md`](stats/specs/publishing.md) §2.

```json
{ "match_id": "SYN-0042", "match_ms": 3854000, "clock": "62:14", "period": 2, "source_seq": 1186,
  "score": { "home": 1, "away": 0 },
  "teams": {
    "home": { "team_id": "NBR", "possession_pct": 58, "shots": 11, "shots_on_target": 5, "xg": 1.42, "passes": 402,
              "pass_completion_pct": 83, "ppda_last_10min": 7.5, "pressures_per_opp_pass_last_10min": 1.34,
              "momentum_share_last_10min_pct": 71, "press_height_last_10min_m": 52 },
    "away": { "team_id": "HBA", "...": "same fields" } },
  "momentum": { "period": 2, "bucket": 3, "home": 9.5, "away": 3.0 },
  "low_sample": [] }
```

- `match_ms` is a whole second, so a resent panel replaces the same archived document.
- `low_sample` lists fields sent as `null` because their sample is too small (`metrics.md` §7). Charts show them as
  "not enough data", never as zero.
- On the panel at every whole minute and at each `PeriodEnd`, an extra `heavy` object holds `momentum_buckets`,
  `pass_network`, `pressing_grid`, `zones`, `shots` (every shot so far with its xG) and, with tracking, `players`
  (shapes in `publishing.md` §2). Panels archived before `shots` existed don't have it; consumers treat it as optional.
- Numbers on panels are for screens. Agents cite only evidence-pack facts (§5).

---

## 8. Metric definitions (stats engine)

Numbers come from code. These definitions are shared so the agents, charts and tests agree.

| Metric | Definition |
|---|---|
| **xG** | Logistic model of distance, angle, body part, situation and the key pass's type. Penalty = 0.78 (Opta's value, sourced in [`CALIBRATION.md`](CALIBRATION.md)). Coefficients and checks: [`stats/specs/metrics.md`](stats/specs/metrics.md) §1 |
| **Pass difficulty** (0–1) | `1 − P(complete)` from length, under pressure, forward progress, lofted, through ball, set piece, ending in the final third (`metrics.md` §2). Lines broken and receiver under pressure are deferred: they need tracking at the moment of the pass |
| **Momentum** | Per team, per 5-minute bucket of `period_ms`: goal 5, shot on target 3, other shot 1.5, key pass 2, completed take-on 1. An opponent's red card 3 and yellow card 1 are credited to the **other** team (the side that drew the foul). Substitutions 0. A goal counts once, as a shot. |
| **Momentum share** | A team's weighted actions ÷ both teams' over a window, in %. A **momentum swing** is a change in share between consecutive windows past a threshold. |
| **PPDA** | Opponent passes with `x ≤ 60` in **their** frame ÷ our `Tackle` (any outcome), `Interception` and committed `Foul` events with `x ≥ 40` in **our** frame. Lower means more intense pressing. Missing below 3 defensive actions. |
| **Press height** | Mean `x` of our `Tackle`, `Interception`, `Foul`, `BallRecovery` and `Pressure` events, in metres (`× 1.05`). Shown **alongside** PPDA, because the two often disagree. |
| **Pressing rate** | Our `Pressure` events ÷ the opponent's passes in the same window. What `press_change` compares (`stats/specs/triggers.md`). |
| **Pressing zones** | Defensive actions binned into a 9 × 6 grid, in the stats engine rather than the browser |
| **Chance creation** | Shots with `key_pass_event_id` set; the creator is `assisted_by` |
| **Control ↔ chaos** | Turnovers per minute, share of very short possessions, fast transitions |
| **Rhythm** | Passes per minute, stoppages, possession duration |
| **Small samples** | Per-90 rates and percentiles are shrunk towards the group mean: `(rate × minutes + mean × K) / (minutes + K)`, with K = 270 minutes (pass accuracy: K = 60 attempts). Values below a minimum sample (`metrics.md` §7) are flagged, sent as `null` on panels and never put in evidence. |

## 9. Open questions for the team

- [x] Agree the momentum-swing and press-change thresholds: [`stats/specs/triggers.md`](stats/specs/triggers.md) §1.
- [x] Agree the stat panel (`kind: stats`) payload shape: §7.4.
- [x] Agree the per-minute tracking chunk format for replays (§4.1).
- [ ] Decide whether the translator is a full agent (football phrasing plus a numeric check) or a service call.
- [ ] Confirm the hero moment's chart for the demo video (currently `shot_map` for every mode).
- [ ] Decide which language the shared models are written in, and where they live.

## 10. Insight handoffs (stats → agents → screens)

> **Stats owner's agreement:** Azeem (stats owner) agrees §10.1 and §10.2 as written, in the stats spec PR for
> [`PLAN_stats_engine`](plans/active/PLAN_stats_engine.md). §10.2's document is used for **every** trigger type (§5),
> and its `context` gains `players: [{player_id, name, pos}]` for the evidence's `player_ids`
> ([`stats/specs/evidence-packs.md`](stats/specs/evidence-packs.md) §3), which is no more citable than the rest of
> `context`. §10.3–§10.4 are unchanged and remain for Pranav, Arnav and Vedant.
>
> **Status:** §10.1–§10.2 agreed by the stats owner (above). §10.3–§10.4, with the build extensions in §10.6, are
> agreed by Arnav (layer 5 owner; [`PLAN_agents_insights-build`](plans/active/PLAN_agents_insights-build.md)) on
> 20 Oct 2026 and merged before Azeem's (producer) and Vedant's (consumer) review. They are asked to confirm;
> any change they need follows as an amendment to this section. Existing §§1–9 and running services are unchanged.

### 10.1 Shot-cluster evidence

The first trigger uses only §3 events, not tracking or generator storyline labels. Proposed deterministic rule:

1. Consume the contiguous, deduplicated event prefix for a match in `seq` order. A missing sequence blocks the
   prefix; two different bodies with the same event identity are an error. Do not bridge a gap by guessing.
2. Consider each `Shot` in periods 1 and 2 after at least 300,000 ms of that period have elapsed. This deliberate
   full-window warm-up skips early-half clusters; its recall cost is a D1 review decision.
3. At triggering event time `t`, count that team's shots in the **same period**, with `t-300000 < match_ms <= t`
   and event `seq <=` the triggering event's `seq`. All shot outcomes and situations count; a goal is one shot.
4. If count >= 3, emit unless that team emitted a shot cluster less than 300,000 match ms ago in that period.
   At exactly the cooldown boundary another cluster is allowed. Reset cooldown at the next period. No trigger
   on non-shot events; do not merge another team's cluster. Other trigger types are outside this first slice.
5. Reuse the logical identity `(match_id, shot_cluster, period, team_id, triggering event_id)` on retries.
   The stats publisher must persist its mapping to a §1.3 `moment_id` and its per-match ordinal atomically with
   publication/checkpoint state. Never allocate a fresh ID for a repeated event after restart. Overflow fails loudly.

Keep the §5 evidence-pack shape. `window` is `{from_ms:t-300000,to_ms:t}`; `match_ms=t`; `clock` and `period` are
copied from the triggering event. `event_ids` contains **all counted shots**, ascending by event seq, and
`player_ids` their distinct shooters in first-appearance order. The triggering shot is the last evidence event.

Exactly these facts are citable in this first slice:

| Key | Value | Unit | Decimals | Meaning |
|---|---|---|---|---|
| `shots_last_5min` | Integer count >= 3 | omitted | 0 | Shots by `team_id` in the bounded same-period window |
| `window_duration_min` | `(to_ms-from_ms)/60000`, exactly 5 | `min` | 0 | Duration of that window, so the worded duration has a claim too |

Labels describe the same meanings. Extra facts, score narration, xG, pressure, comparative dominance and tactical
causes are deferred. Missing facts are invalid, never zero. A goal in the evidence does not authorise goal or score
narration without a corresponding approved fact. The source events remain useful for audits/evaluation only.

### 10.2 Immutable moment and context

Proposed source document in Cosmos database `live`, container `moments`, partition `/match_id`:

| Field | Type / rule |
|---|---|
| `id`, `moment_id` | Same §1.3 moment ID |
| `match_id` | §1.3 match ID, matches evidence |
| `kind` | Literal `moment` (distinguishes job/outbox records in this container) |
| `schema_version` | Integer 1 |
| `evidence_version` | Integer 1; corrections are not supported by this first slice |
| `evidence` | Complete §5 pack restricted by §10.1 |
| `source` | `{event_seq, period, match_ms}` at the final included event; positive seq, integer times |
| `context` | `{phase, score:{home,away}, teams:{home:{team_id,name},away:{team_id,name}}}` |

The stats publisher captures context **at the same contiguous event prefix** that generated the evidence. Phase
is `live` here; nonnegative integer score is derived through `source.event_seq`, never from the final result.
Names/IDs come from that match's setup. Source period/time must equal the evidence period/time, and every evidence
event must belong to that prefix/team/period/window. A repeated ID with different content is a conflict; do not upsert
over the old source. Cosmos system fields are storage metadata, not model input.

This is a **new publisher obligation**, not a capability of today's stats placeholder. The archiver's `matches`
result and the relay's latest `screen` snapshot cannot supply historical context safely. M2 can use clearly labelled,
agreed fixtures of this document; M4 requires actual stats publication. Archived events can support a future
bounded reconstruction design, but there is no automatic fallback to an unbounded archive or latest snapshot.

MCP reads this immutable document by `(match_id, moment_id)`; it returns only the allowlisted context and source
cursor, not the full document, evidence answer keys, prompts or processing state. The evidence pack is still the
only numerical authority. Context score/time are metadata and **cannot be cited** by this slice's narrator.

### 10.3 Narration and overlay profile

Narrated lines retain §5.1 `{mode,lang,text,claims}`. Modes are `casual` and `analyst`; language is `en`. In this
slice, write counts and durations as digits, each occurrence with a matching claim in textual order. A permitted
line is `Kestlebury United have taken 3 shots in the last 5 minutes.` with claims for `shots_last_5min=3` then
`window_duration_min=5`. Do not copy §5.1's broader illustrative line as a complete numeric-coverage fixture: it
contains duration/ordinal numbers beyond its listed claims. The [checker spec](agents/specs/fact-checking.md)
defines this slice's stricter coverage and semantic rules without changing the existing narrated-line shape.

Overlay body uses §6 with one **proposed additive field**, `period` (integer 1 or 2), copied from the evidence.
This lets the receiver check half boundaries without guessing or fetching context for every card. It requires
Pranav, Arnav and Vedant's agreement and a later frontend schema update; no current runtime schema is changed here.
Proposed first-slice values:

- One overlay per moment, `OV-` plus the moment ID's numeric suffix. `kind=moment`, `priority=normal`.
- Both English mode texts must pass; otherwise use the approved template for both with `fallback=true` and
  `verified=false`. Verified model text sets the reverse. Invalid evidence suppresses the overlay entirely.
- `facts_checked` is the unique union of fact keys checked in the actual text (including checked template values).
- `player_tags=[]`; `visual.component=key_events`, window equal to the evidence window, highlight the team and
  triggering event. Text must remain renderable if this optional visual is unavailable. A shot map is deferred.
- `show_at_ms=evidence.match_ms`; `clock=evidence.clock`: this identifies the observed moment, not a fresh event
  invented at model completion. `duration_ms=6000` is the **maximum wall-clock display duration**, independent of
  playback speed. Recheck eligibility as the base playhead advances; remove early on expiry, period change or full time.
- Suppress live delivery when current base-stream play time is more than 600,000 match ms past `show_at_ms`,
  the period changed, or the match ended. Do not relabel late analysis as current. Preserve its terminal reason
  for evaluation; recap/replay use is a future feature. If the current playhead cannot be established, do not send
  a live card. The playhead is defined in §10.6 (not the relay's private `screen` documents); it is not model
  context.
- Frontend eligibility requires a base playhead in the same period, between `show_at_ms` and `show_at_ms+600000`.
  Period comes from the overlay's proposed `period` field, not guessed from the clock label. At most one card is
  visible; keep at most
  two waiting per audience, prefer newest eligible normal-priority cards and record/surface an appropriate empty
  state. Switching mode/reconnecting must not redisplay the same overlay in one page session.

These timing and visual choices require Vedant's agreement. Current web code does not implement them.

### 10.4 Audience delivery, persistence and catch-up

The relay remains the sole sender to `match-<id>`. Insights publish only to `match-<id>-casual-en` and
`match-<id>-analyst-en`, with independent persistent seq counters **per group**. The §7 envelope is unchanged;
its `match_ms`/`clock` describe the original moment and `data` is the full §10.3 overlay, including its proposed
`period` field. No extra field is added to the outer envelope.

Proposed `overlays` container, partition `/match_id`: store the immutable overlay as `{id:overlay_id, ...overlay}`,
and typed audience-delivery documents `{id,match_id,kind:audience_delivery,group,seq,envelope,state}` plus
one counter document per group. Delivery id is `delivery:<group>:<overlay_id>`; counter is
`{id:counter:<group>,match_id,kind:audience_counter,group,last_seq}` with nonnegative integer `last_seq`.
The **single insight publisher** reserves seq and creates deliveries/counters
in one transaction in this container/partition, idempotently keyed by `(group,overlay_id)`. No counter reuse after
restart. State is `pending`, `sent` or `expired`. Save before sending; ambiguous send failures may resend the
same envelope. Successful send is service acceptance, not evidence that a browser displayed it.

Workflow completion uses a durable outbox in `moments` (see workflow spec). Transfer to `overlays` is idempotent,
not atomic across containers. Recovery retries pending entries; matching repeated writes reuse seq. Conflicting
content is an error. Do not mark the job published merely because its outbox was saved. Partial audience success
is retained per audience; expire the remaining entries when no longer eligible.

**New endpoint proposal**, not implemented in the current stand-in or Next.js app:
`GET /api/match/<id>/insights/snapshot?mode=casual&lang=en` (also accepts `analyst`).

```json
{
  "match_id": "SYN-1017",
  "group": "match-SYN-1017-casual-en",
  "cursor": 1,
  "envelopes": [{"seq": 1, "kind": "overlay", "match_id": "SYN-1017", "match_ms": 4174400, "clock": "65:34", "data": {}}],
  "rejected": {"count": 0, "samples": []}
}
```

`data` is abbreviated above; the complete example is in [shot-cluster examples](agents/specs/examples/shot-cluster.md).
Snapshot returns at most the two newest eligible persisted cards (pending or sent), ordered by seq, and the highest
persisted group seq as `cursor`; expiry filtering uses the base playhead. `envelopes=[]` is valid. `404` unknown match,
`503` before trustworthy playhead/setup, `400` unsupported mode/language. IDs/modes are validated; caller may only
read/join the authorised audience. Overlay period must match the original moment.

Join the audience group first, buffer live messages, fetch this snapshot, merge by `(group,seq)` and dedupe visible
cards by `overlay_id`. Do not assume contiguous seq or discard buffered cards just because seq <= cursor. On a new
live overlay, validate its period/time against the base playhead before scheduling. Snapshot failure still permits
valid newly received cards when the base playhead is available; show an insight-history-unavailable state and retry
catch-up on reconnect. §7.3's base snapshot is not changed and does not already provide this feature.

### 10.5 Approval and implementation boundary

The numeric evidence and transport shapes above are review proposals. D1–D4/D6 decisions are recorded in the
sprint, not inferred from this document's existence. Promotion requires explicit shared review and matching stats,
storage and frontend specifications/implementation plans. No current consumer must start accepting §10 by
accident. Model access/spending (D5) is a separate M3 gate; M1 and local MCP tests require no model calls.

### 10.6 Build extensions (seven agents, all triggers, modes and languages)

These extend §10.3–§10.4 for the layer-5 build. Where they differ from §10.3–§10.4, this section wins.

- **Triggers.** Every trigger the stats engine writes uses the §10.2 document (with `context.players`):
  `goal`, `red_card`, `penalty`, `big_chance`, `shot_cluster`, `momentum_swing`, `press_change`, `milestone`,
  `head_to_head`, `connection`, `workhorse`
  ([`stats/specs/triggers.md`](stats/specs/triggers.md), [`stats/specs/evidence-packs.md`](stats/specs/evidence-packs.md)).
  `sprint` joins when the stats engine produces it. Priority (`high` for goal, red card, penalty; `normal` otherwise)
  is fixed by trigger, not stored in the document.
- **Modes.** `casual`, `analyst`, `player` (lines centred on one followed player; written only when that player is
  in `evidence.player_ids`), `club` (the same facts told from one club's side; written for each of the two teams).
- **Languages.** `en`, `es`, `hi`, `fr`. Numbers, claims and names are identical in every language (re-checked after
  translation); a language that fails its check gets the translated template or no card.
- **Overlay.** The §6 overlay body gains `period` (1 or 2, from the evidence), `mode` and `lang` as above, and
  `club` (the team id) for `club` mode or `player` (the player id) for `player` mode. One `overlay_id` per moment
  per audience. `visual.component` per trigger: goal, big chance, penalty → `shot_map` (or `key_events` until it
  exists); shot cluster → `key_events`; momentum swing → `momentum_tide` (highlight the team); press change →
  `pressing_zones`; red card → `stat_bars` or `key_events`; milestone → `key_events` with a player tag; head-to-head →
  `head_to_head` (highlight the leader); connection → `connections` (highlight the team; the screen also draws the
  pair on the 3D pitch); workhorse → `engine_room` (highlight the player). The highlight is the last `event_id` (the
  triggering event) except for `momentum_swing`, `head_to_head`, `connection` and `workhorse`.
- **Groups** (Web PubSub hub `live`; one sender per group, the insights publisher; `seq` per group):

  | Group | Carries |
  |---|---|
  | `match-<id>-casual-<lang>`, `match-<id>-analyst-<lang>` | Overlays for that mode and language |
  | `match-<id>-club-<teamId>-<lang>` | Club-mode overlays for one team |
  | `match-<id>-player-<playerId>-<lang>` | Player-mode overlays and `player_tag` envelopes for one player |

  This replaces §7's `match-<id>-player-<playerId>` (no service sends to it yet). The relay remains the only sender
  on `match-<id>`.
- **Player tags.** `kind = "player_tag"` envelopes, `data = {player_id, name, metric, value, unit, threshold}`, sent
  when a followed player's speed or distance in `match_state` (§4.2) first crosses a threshold. Values come from
  `match_state`, never from a model.
- **Playhead for expiry.** The base playhead is `match_state.source.match_ms` (§4.2, written at least every 5 match
  seconds). A card is live-eligible while that playhead is in the same period, between `show_at_ms` and
  `show_at_ms + 600000` (10 match minutes; 5 until 26 Oct, raised so a 20× card has 30 wall seconds). Unknown
  playhead → no live card.
- **Insights snapshot.** `GET /api/match/<id>/insights/snapshot?mode=<mode>&lang=<lang>` (plus `&club=<teamId>` or
  `&player=<playerId>` for those modes), same response shape as §10.4. Served by the Web PubSub stand-in locally and
  by the web app's route on Azure.
- **Recap.** At full time, one `kind = "recap"` envelope per audience group; `data` is a set of §5.1 lines built from
  the match's moments and final `match_state`, checked like any overlay.

---

## 11. Season document (stats engine → web app; later the MCP `season` tool)

One JSON document per finished season run, built by `python main.py season <run folder>` in `stats/`. Rules for every
number: [`stats/specs/season.md`](stats/specs/season.md). The web app serves it from a committed file
(`web/data/season/season-<id>.json`) through `/api/season/*` ([`web/specs/realtime.md`](web/specs/realtime.md) §7).
The schema is `seasonDocumentSchema` in `web/src/lib/contracts.ts`.

```json
{ "id": "season-S1", "kind": "season", "schema_version": 1, "season_id": "S1", "world_version": 4,
  "built_from": { "run": "S1", "seed": 1, "matches": 90, "world": true },
  "hidden_teams": ["CAL", "DTN"],
  "rules": { "min_minutes_for_percentiles": 450, "groups": { "CB": "centre_backs" }, "radar": { "attackers": ["goals", "npxg"] } },
  "dna_correlations": { "press_intensity": 0.9, "press_height": 0.98 },
  "matchweeks": [1, 2, 3],
  "teams": [ { "team_id": "KES", "name": "Kestlebury United", "table": { "position": 4, "points": 31 }, "xpts": 35.2,
               "form": ["W", "D", "L", "W", "D"], "season": { "pressures_per_opp_pass": 0.81 },
               "dna": [ { "dial": "press_intensity", "designed": 0.85, "designed_rank": 1, "measured_key": "pressures_per_opp_pass",
                          "measured_label": "Pressures per opponent pass", "measured": 0.81, "measured_rank": 2 } ],
               "pressing_grid": [[0]], "zones": [[0]], "goals_by_15min": { "for": [5, 4, 6, 3, 7, 6], "against": [2, 3, 4, 3, 5, 4] },
               "shots_for": [ { "match_id": "SYN-0001", "player_id": "KES-09", "x": 88.0, "y": 47.0, "xg": 0.21, "outcome": "saved", "situation": "open_play" } ],
               "shots_against": [] } ],
  "matches": [ { "match_id": "SYN-0001", "matchweek": 1, "home": "KES", "away": "CAL", "score": { "home": 0, "away": 1 },
                 "xg": { "home": 0.7, "away": 0.57 }, "xpts": { "home": 1.44, "away": 1.15 },
                 "win_probability": { "home": 0.347, "draw": 0.402, "away": 0.251 } } ],
  "players": [ { "player_id": "KES-09", "team_id": "KES", "name": "…", "pos": "ST", "group": "attackers", "role": "pressing_forward",
                 "attr": { "finishing": 81 }, "minutes": 1619, "totals": { "goals": 23 }, "per90": { "goals": 1.28 },
                 "rates": { "shot_accuracy_pct": 48 }, "percentiles": { "goals": 100 }, "low_sample": false,
                 "shots": [], "touch_zones": [[0]], "defensive_zones": [[0]] } ] }
```

- **Frames:** all coordinates and grids are in the acting team's frame (§1.1), like the stat panel's heavy block.
- **Immutable:** a document is immutable per `season_id` and `world_version`. Rebuilding the same run gives the same
  bytes.
- **Missing values:** a value below its minimum sample is `null`. A player under 450 minutes has
  `percentiles: null` and `low_sample: true`.
- **Reference clubs:** clubs in `hidden_teams` stay in `teams` and `matches`, but their players are not in `players`
  and they get no club or player page (`season.md` §6).
