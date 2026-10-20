# Metrics spec

> **Status: agreed.** Agreed in the spec PR for [`PLAN_stats_engine`](../../plans/active/PLAN_stats_engine.md) (M1).
> Extends the starting definitions in [`CONTRACTS.md` §8](../../CONTRACTS.md#8-metric-definitions-stats-engine); where
> this spec is more exact, it is the reference.

Decides the exact formula for every number the stats engine produces. CONTRACTS.md §8 has the agreed starting definitions.

Every number comes from §3 events and §4 tracking frames only. Nothing here reads generator storylines, answer keys or
ratings. Coordinates are team frame for events (the acting team attacks towards `x = 100`). Metres are `x × 1.05` and
`y × 0.68`, and the goal centre is at (105, 34) m.

## 1. xG

- Which inputs (distance, angle, body part, situation, assisted, under pressure)?
- What are the coefficients, and how are they checked against public reference values?

_Answer:_

**Inputs**, all from the `Shot` event and the pass it links to:

| Input | From | Meaning |
|---|---|---|
| `d` | `x`, `y` | Metres from the shot spot to the goal centre (at least 0.5) |
| `a` | `x`, `y` | Angle in radians between the lines to the two posts (`y = 34 ± 3.66` m) |
| header | `body_part = head` or qualifier `headed` | |
| weak foot | qualifier `weak_foot` (not on headers) | |
| situation | `situation` | `open_play`, `counter`, `corner`, `free_kick`, `throw_in`; `penalty` is a fixed value |
| assist | the qualifiers of the pass named by `key_pass_event_id` | `cutback`, else `through_ball`, else `cross`, else none |

`under_pressure` is **not** an input. On generated shots it had no reliable effect (+0.14 ± 0.14 on the log-odds),
and adding it would only add noise.

**Model.** `xG = min(logistic(z), 0.95)`, and a penalty is 0.78 (Opta, sourced in
[`CALIBRATION.md`](../../CALIBRATION.md)):

```
z = −5.18 + 1.544·ln d + 2.231·a − 0.167·d
    − 0.95 (header)  − 0.16 (weak foot)
    + 0.25 (counter) − 0.15 (corner) − 0.15 (free kick) − 0.10 (throw-in)
    + 0.40 (cutback) + 0.35 (through ball) − 0.25 (cross)
```

**Where the coefficients come from:**
- **The shape** (distance, angle, header, situation and assist terms) is the public-anchored model of
  [`generator/specs/actions.md`](../../generator/specs/actions.md) §4. That spec intends the stats engine to use the
  same inputs, so measured xG and goals agree.
- **The intercept and weak-foot term** were refitted on 4,809 non-penalty shots from two generated league seasons
  (180 matches). Events don't carry what the generator also knows: defenders in the way and where the keeper stands.

**Checks.**

| Check | Target | Measured |
|---|---|---|
| Six-yard box, central, foot (4.5 m) | about 0.35–0.50 (`CALIBRATION.md`) | 0.36 |
| Same, header | under 0.25 | 0.18 |
| Edge of the box, central (16.5 m) | 0.06–0.08 | 0.066 |
| 25 m, central | 0.02–0.03 | 0.023 |
| Goals ÷ xG over the 180 matches | about 1 | 452 goals, 452.0 xG |
| Calibration by fifths of predicted xG | predicted ≈ actual | 0.020 / 0.020, 0.037 / 0.043, 0.061 / 0.054, 0.097 / 0.103, 0.256 / 0.251 |

xG is reported to 2 decimals. Team and player xG are sums of shot xG.

## 2. Pass metrics

- How are pass distance, accuracy and difficulty (0–1) computed?
- What counts as progressive, line-breaking or a key pass?

_Answer:_

- **Distance:** metres from (`x`, `y`) to (`end_x`, `end_y`), 0 decimals.
- **Accuracy (completion):** passes with `outcome = success` ÷ all `Pass` events, set pieces included, as in
  `CALIBRATION.md`. Reported as %, 0 decimals; needs at least 10 passes (§7).
- **Difficulty (0–1):** `1 − P(complete)`, an expected-completion model fitted on 55,503 generated passes:

  ```
  P(complete) = logistic(2.10 + 0.026·length_m − 0.30 (under pressure) − 0.013·progress_m
                         − 2.44 (lofted: long_ball, cross or switch_of_play) − 1.61 (through_ball)
                         − 0.85 (set piece: corner, free_kick, goal_kick, throw_in) − 0.31 (ends in the final third))
  ```

  `progress_m = (end_x − x) × 1.05`. Calibration by fifths of difficulty, predicted / actual failure: 0.54 / 0.56,
  0.18 / 0.19, 0.11 / 0.08, 0.09 / 0.08, 0.07 / 0.07. A completed pass with difficulty ≥ 0.5 is a **difficult
  completion**. Reported to 2 decimals.
- **Progressive pass:** a completed open-play pass that starts at `x ≥ 35` and ends at least 25 % closer to the goal
  centre than it started. Set pieces are excluded.
- **Key pass:** a pass named by a `Shot`'s `key_pass_event_id`. That link is exact; nothing is inferred.
- **Line-breaking:** deferred. It needs every defender's position at the moment of the pass, and replays from events
  alone must give the same numbers. The difficulty model above uses only event fields. `CONTRACTS.md` §8's "lines
  broken, receiver under pressure" are therefore not inputs in v1.

## 3. Speed and distance

- How are ball speed and shot speed reported, and which player speed metrics are kept?

_Answer:_

- **Ball speed:** a pass's `ball_speed_kmh`, as sent, 0 decimals. Team "fastest pass" is its maximum.
- **Shot speed:** a shot's `shot_speed_kmh`, as sent, 0 decimals.
- **Player speed and distance**, from `match-tracking` frames:
  - **Top speed:** the highest frame `speed_kmh`, 1 decimal.
  - **Distance covered:** the latest frame `dist_m` ÷ 1000, in km to 2 decimals.
  - **Sprints:** runs of at least 5 consecutive frames (1 s) at 25.2 km/h or more (the threshold in
    `CALIBRATION.md`). Reported as a count, plus metres sprinted (0 decimals).
  - **High-intensity distance:** metres covered in frames at 19.8 km/h or more.
- **Without tracking** (a replay from events alone), speed and distance values are missing, never zero. A missing
  value is never put in an evidence pack.

## 4. Pressing

- Exact PPDA zones and which events count.
- How press height and the 9 × 6 pressing grid are computed.

_Answer:_

- **PPDA:** opponent `Pass` events with `x ≤ 60` in the passer's frame ÷ our defensive actions with `x ≥ 40` in our
  frame. Defensive actions are `Tackle` (any outcome), `Interception` and `Foul` committed by us. 1 decimal. It is
  missing when there are fewer than 3 defensive actions (§7). Lower means more intense pressing.
- **Press height:** the mean `x × 1.05` (metres from our own goal line) of our `Tackle`, `Interception`, `Foul`,
  `BallRecovery` and `Pressure` events. 0 decimals; needs at least 8 actions. Shown **alongside** PPDA, because the
  two often disagree: a deep block can still press hard in its own half.
- **Pressing grid:** our `Pressure` events counted in a 9 × 6 grid of our frame: `x` in nine 11.1-point columns from
  our goal, `y` in six 16.7-point rows from our left. Sent as `grid[col][row]`.
- **High regains:** our `BallRecovery`, `Interception` and successful `Tackle` events with `x ≥ 60`.
- **Pressing rate:** our `Pressure` events ÷ the opponent's `Pass` events in the same window, 2 decimals. This is the
  measure the `press_change` trigger compares. It counts pressing per opponent pass, so it doesn't move just because
  one team has more of the ball.

## 5. Momentum and control

- Momentum weights and bucket size.
- How control ↔ chaos and rhythm are scored.

_Answer:_

**Momentum** (`CONTRACTS.md` §8). Per team, the weighted sum of its attacking actions:

| Action | Weight |
|---|---|
| Goal | 5 (counted once, as the shot) |
| Shot on target (saved) | 3 |
| Other shot (missed, blocked, woodwork) | 1.5 |
| Key pass | 2 |
| Completed `TakeOn` | 1 |
| Opponent's red card (`red` or `second_yellow`) | 3 |
| Opponent's yellow card | 1 |
| Opponent's substitution | 0 (`CONTRACTS.md` §8's 0.5 is dropped: a substitution is not pressure) |

A card is credited to the **other** team, because it rewards the side that drew the foul. `CONTRACTS.md` §8 is
updated to say so.

- **Buckets:** 5 minutes of `period_ms` (bucket `n` covers `[5n, 5n + 5)` minutes of that period). Stoppage time lands
  in the bucket it falls in, so bucket 9 of a period holds 45:00 onwards.
- **Momentum share:** a team's weighted sum ÷ both teams' sum, over a window (`windows.md`), in %, 0 decimals. It is
  missing when both teams together have fewer than 6 points in the window.

**Control ↔ chaos** (0 = controlled, 100 = chaotic), over the last 10 minutes, both teams together:

```
chaos = 100 × (0.4 × min(turnovers_per_min / 4, 1) + 0.4 × short_possession_share
               + 0.2 × min(fast_transitions_per_min / 0.5, 1))
```

- **Turnovers:** open-play changes of `possession_id` between teams.
- **Short possession:** at most 2 passes.
- **Fast transition:** a possession starting with a regain that reaches a shot or the opponent's final third
  (`x ≥ 66.7`) within 10 s.

**Rhythm:**
- passes per minute (each team and both);
- stoppages per 10 minutes (`Foul`, `Offside`, `Corner`, `Substitution`, goals);
- mean possession duration in seconds.

Each is 1 decimal.

## 6. Whole-match

- Which totals, pass network rules (minimum passes per link), zones and player stats are kept?

_Answer:_

**Possession:** a possession is the run of events sharing a `possession_id`. Its team is the team of its first
`Pass`, `Carry`, `TakeOn` or `Shot`, or of its first event if it has none of those. It lasts from its first event to
the next possession's first event. **Possession %** is a team's possession time ÷ both teams'.

**Team totals:**

| Category | Totals |
|---|---|
| Score and shots | goals; shots; on target (goal + saved); blocked; xG; xG per shot; big chances (xG ≥ 0.20) |
| Passing | passes; completed; completion %; progressive passes; key passes; crosses; difficult completions |
| Attacking | take-ons attempted / completed |
| Defending | tackles won / attempted; interceptions; clearances; aerials won; high regains; PPDA; press height |
| Discipline and set pieces | fouls; yellow and red cards; corners; offsides |
| Other | possession % |

**Pass network** (per team, starting XI until its first substitution, or the whole match on request):
- **Nodes:** each player's mean pass-start position (our frame) and number of passes.
- **Links:** passer → receiver counts of completed passes, with **at least 3 passes per link**.

**Zones:** each team's touches (events with a position and that team's `team_id`) in an 18-zone grid: 6 columns by
3 channels of its own frame.

**Player stats:**
- minutes;
- goals, shots, xG, assists (`assisted_by` on goals), key passes;
- passes and completion %, progressive passes;
- take-ons, tackles, interceptions;
- with tracking: distance, top speed, sprints.

## 7. Small samples

- Shrinkage constants and the minimum sample for each rate or percentile.

_Answer:_

- **Shrinkage** (`CONTRACTS.md` §8): a per-90 rate is reported as `(rate × minutes + mean × K) / (minutes + K)`, where
  the mean is the group's (the same position group in the season so far). K = 270 minutes; for pass accuracy
  K = 60 attempts.
- **Minimum samples:** below these, a value is sent with `low_sample: true` in panels and is **never** put in an
  evidence pack:

| Value | Minimum |
|---|---|
| Completion % | 10 passes |
| PPDA | 3 defensive actions |
| Press height | 8 actions |
| Momentum share | 6 weighted points in the window |
| xG per shot | 3 shots |
| Player per-90 rates and percentiles | 90 minutes (rates), 450 minutes (percentiles) |
