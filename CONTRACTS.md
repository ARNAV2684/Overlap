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

- The screen relay bundles frames into **about one message per second**; the browser tweens between them.
- The archiver stores tracking as compressed **per-minute chunks** in Blob Storage, not one document per frame.
- Speeds must come from smooth motion (acceleration and top-speed limits), not noise, or sprint tags and distance
  covered become meaningless.

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

- `trigger`: `goal`, `red_card`, `penalty`, `big_chance` (shot xG > 0.2), `shot_cluster` (3 shots in 5 min),
  `momentum_swing`, `press_change`, `sprint`, `milestone`.
- `facts[]`: `key`, `value`, optional `unit`, `decimals` (the precision a narrated value is rounded to) and
  `label`. Keys are unique within a pack.
- **Fact key naming:** snake_case with the window and unit in the name, so a key can't be misread:
  `shots_last_5min`, `high_regains_since_55min`, `momentum_share_last_10min_pct`, `player_top_speed_kmh`.
- `window` (in `match_ms`), `event_ids` and `player_ids` tie the moment to its evidence.

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
  `stat_bars`, `key_events`. `window_ms` (`[from, to]`) and `highlight` (`team_id`, `player_id`, `event_id`,
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
| `match-<id>` | Events, positions, stat panels |
| `match-<id>-<mode>-<lang>` | Overlays for one audience |
| `match-<id>-player-<playerId>` | Tags for followers of one player |

---

## 8. Metric definitions (stats engine)

Numbers come from code. These definitions are shared so the agents, charts and tests agree.

| Metric | Definition |
|---|---|
| **xG** | Logistic model of distance, angle, body part and situation. Penalty = 0.78 (Opta's value, sourced in [`CALIBRATION.md`](CALIBRATION.md)). |
| **Pass difficulty** (0–1) | Length, under pressure, forward progress, lines broken, receiver under pressure |
| **Momentum** | Per team, per 5-minute bucket of `period_ms`: goal 5, shot on target 3, other shot 1.5, key pass 2, completed take-on 1, red card 3, yellow 1, substitution 0.5. A goal counts once, as a shot. |
| **Momentum share** | A team's weighted actions ÷ both teams' over a window, in %. A **momentum swing** is a change in share between consecutive windows past a threshold. |
| **PPDA** | Opponent passes with `x ≤ 60` in **their** frame ÷ our `Tackle`, `Interception` and committed `Foul` events with `x ≥ 40` in **our** frame. Lower means more intense pressing. |
| **Press height** | Mean `x` of our defensive actions, in metres (`× 1.05`). Shown **alongside** PPDA, because the two often disagree. |
| **Pressing zones** | Defensive actions binned into a 9 × 6 grid, in the stats engine rather than the browser |
| **Chance creation** | Shots with `key_pass_event_id` set; the creator is `assisted_by` |
| **Control ↔ chaos** | Turnovers per minute, share of very short possessions, fast transitions |
| **Rhythm** | Passes per minute, stoppages, possession duration |
| **Small samples** | Per-90 rates and percentiles are shrunk towards the group mean: `(rate × minutes + mean × K) / (minutes + K)`, with K = 270 minutes (pass accuracy: K = 60 attempts). Values below a minimum sample are flagged so the narrator avoids them. |

## 9. Open questions for the team

- [ ] Agree the momentum-swing and press-change thresholds.
- [ ] Agree the stat panel (`kind: stats`) payload shape.
- [ ] Agree the per-minute tracking chunk format for replays.
- [ ] Decide whether the translator is a full agent (football phrasing plus a numeric check) or a service call.
- [ ] Confirm the hero moment's chart for the demo video (currently `shot_map` for every mode).
- [ ] Decide which language the shared models are written in, and where they live.
