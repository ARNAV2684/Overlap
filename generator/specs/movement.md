# Movement spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_match-engine`](../../plans/active/PLAN_generator_match-engine.md), together with
> [`engine.md`](engine.md), [`actions.md`](actions.md) and
> [`set-pieces-and-discipline.md`](set-pieces-and-discipline.md), which it is kept in step with.

Decides where every player and the ball are, five times a second, and how speed and distance are measured.
`generator/movement.py` is called by the engine every 200 ms step ([`engine.md`](engine.md) §2), so the positions
the engine decides from are the positions that go out as tracking. All pitch maths (size, team frame ↔ pitch frame)
lives in `generator/pitch.py`, the one coordinate helper ([`CONTRACTS.md`](../../CONTRACTS.md) §1.1).

## 1. Shape

- What are the formation anchor positions for each formation?
- How does the shape shift with the ball's position and with possession (compact, wide, high line)?

_Answer:_

**Anchors** are each slot's place in a mid-block, in the team frame (`x` own goal → opponent's, `y` left touchline →
right, both 0–100), in the slot order of [`world.md`](world.md) §4:

| Formation | GK | Defence | Midfield | Attack |
|---|---|---|---|---|
| 4-3-3 | (5, 50) | RB (30, 85) · CB (25, 62) · CB (25, 38) · LB (30, 15) | DM (42, 50) · CM (52, 68) · CM (52, 32) | RW (70, 85) · ST (78, 50) · LW (70, 15) |
| 4-2-3-1 | (5, 50) | RB (30, 85) · CB (25, 62) · CB (25, 38) · LB (30, 15) | DM (42, 62) · DM (42, 38) | RW (64, 85) · AM (64, 50) · LW (64, 15) · ST (78, 50) |
| 4-4-2 | (5, 50) | RB (30, 85) · CB (25, 62) · CB (25, 38) · LB (30, 15) | RM (55, 85) · CM (48, 60) · CM (48, 40) · LM (55, 15) | ST (75, 60) · ST (75, 40) |
| 4-1-4-1 | (5, 50) | RB (30, 85) · CB (25, 62) · CB (25, 38) · LB (30, 15) | DM (40, 50) · RM (56, 85) · CM (54, 64) · CM (54, 36) · LM (56, 15) | ST (76, 50) |
| 3-4-3 | (5, 50) | CB (24, 72) · CB (22, 50) · CB (24, 28) | RWB (48, 90) · CM (48, 60) · CM (48, 40) · LWB (48, 10) | RW (70, 80) · ST (78, 50) · LW (70, 20) |
| 5-3-2 | (5, 50) | RWB (36, 92) · CB (22, 68) · CB (20, 50) · CB (22, 32) · LWB (36, 8) | CM (48, 70) · CM (46, 50) · CM (48, 30) | ST (74, 60) · ST (74, 40) |
| 5-4-1 | (5, 50) | RWB (32, 92) · CB (20, 68) · CB (18, 50) · CB (20, 32) · LWB (32, 8) | RM (46, 80) · CM (42, 60) · CM (42, 40) · LM (46, 20) | ST (68, 50) |

**Shape each step.** Every player's target is his anchor, shifted:

- **With the ball (team frame):** the whole block moves toward the ball by 45 % of `ball_x − 50` along the pitch and
  25 % across it.
- **In possession:** the team pushes up by `12 × line_height` and spreads: each `y` moves away from the centre by a
  factor `0.8 + 0.4 × width`.
- **Out of possession:** the team narrows (`y` toward the ball side, factor 0.75) and the back line sits at
  `x = 18 + 22 × line_height`; the rest of the block stays within 35 m of it. Players chosen to press
  ([`actions.md`](actions.md) §2) leave the shape and run at the carrier.
- **Roles** move players away from their anchor in possession:

| Role | In possession |
|---|---|
| `sweeper_keeper` | Stands 12–18 m off his line when his team is in the opponent's half |
| `shot_stopper` | Stays within 6 m of his line |
| `inverted_fullback` | Steps inside to the defensive-midfield line (`y` about 35 or 65) |
| `overlapping_fullback`, `wing_back` | Pushes up the touchline (`y` about 5 or 95) when the ball is on his side, overlapping the winger |
| `box_to_box` | Makes a late run into the box when the ball is wide in the final third |
| `inverted_winger` | Drifts into the half-space (`y` about 30 or 70) in the final third |
| `wide_winger` | Holds the touchline |
| `poacher` | Stays on the shoulder of the last defender, between the centre-backs |
| `target_man` | Stays central, ahead of the midfield, facing his own goal to receive |
| `pressing_forward` | Runs in behind the defensive line when a teammate on the ball faces forward |

**Runs for passes:** when a teammate is about to play a `through_ball` or `cross` ([`actions.md`](actions.md) §2), the
intended receiver runs to the target point; that run is what can be caught offside
([`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) §5).

## 2. Motion

- How does a player move towards a target: acceleration, deceleration and top speed per attribute?
- How much noise is added, and how is it kept small enough that speeds stay realistic?
- How does the ball move between events (straight line, arc, speed)?

_Answer:_

**Players** steer their velocity toward their target each step, within physical limits:

| Limit | Value |
|---|---|
| Top speed | `6.9 + 2.9 × (pace − 40) / 59` m/s: about 30 km/h at 70 pace, 35 km/h at 99 |
| Acceleration | `2.5 + 2.0 × (acceleration − 40) / 59` m/s² |
| Deceleration | up to 5 m/s² |
| Fatigue | top speed and acceleration fall by up to 8 % ([`engine.md`](engine.md) §6) |

They jog (about 55 % of top speed) when only repositioning, and sprint when chasing a loose ball, pressing, running
in behind, breaking on a counter or recovering after losing the ball. They slow down as they reach their target, so
they don't overshoot.

**Noise** is a tiny wobble (under 0.1 m) on each target, drawn from the `movement` stream. Speeds always come from the
capped motion above, never from noise, so sprint counts and distance stay meaningful
([`CONTRACTS.md`](../../CONTRACTS.md) §4).

**The ball:**
- **Held:** 0.6 m in front of the carrier, in his direction of travel.
- **On the ground:** a straight line, slowing by rolling friction (about 0.8 m/s², 0.6 on a wet pitch).
- **In the air:** an arc from release speed and peak height ([`actions.md`](actions.md) §5), with `z` above the
  ground; it may land and roll on.
- **Dead:** placed at the restart spot.

## 3. Linking to events

- How do tracking positions stay consistent with event coordinates (team frame → pitch frame)?

_Answer:_

There is only one set of positions. The engine keeps them in metres in the **pitch frame**; an event takes its actor's
position at that step and converts it to the **acting team's frame** with `pitch.py` (a 180° rotation for a team
attacking west, [`CONTRACTS.md`](../../CONTRACTS.md) §1.1). Tracking uses the pitch frame directly. A pass's
`end_x`/`end_y` is where the ball actually arrived. No other module converts coordinates.

## 4. Measurements

- What counts as a sprint (threshold and minimum duration)?
- How is distance covered measured, and what are typical totals per position?
- What triggers a player tag (e.g. top speed above a threshold)?

_Answer:_

- **Sprint:** at or above **25 km/h** for at least 1 s (the threshold in [`CALIBRATION.md`](../../CALIBRATION.md)).
- **Distance covered** adds up each player's movement every step (`dist_m` in tracking). Targets to source in
  [`CALIBRATION.md`](../../CALIBRATION.md): central midfielders about 10–12 km over a full match, centre-backs and
  strikers less, goalkeepers about 5 km.
- **Top speed** is the highest speed reached: 33–36 km/h for the fastest players, in line with
  [`CALIBRATION.md`](../../CALIBRATION.md).
- **Player tags** (for example "top speed 33.1 km/h") are chosen by the stats engine and the agents from this data;
  the generator only makes sure the speeds and distances behind them are realistic.

## 5. Output

- What is the frame rate, and which frames are emitted (see CONTRACTS.md §4)?

_Answer:_

- **5 Hz:** one frame every 200 ms step of play, from each kickoff to the end of the period. No frames during
  half-time.
- Each frame follows [`CONTRACTS.md`](../../CONTRACTS.md) §4: `match_id`, `period`, `period_ms`, `match_ms`, the ball
  (`x`, `y` 0–100 in the pitch frame, `z` in metres, `speed_kmh`) and every player on the pitch (`player_id`, `x`,
  `y`, `speed_kmh`, cumulative `dist_m`), home players first, then away, each in slot order.
- A player sent off or substituted off leaves the next frame; a substitute appears from the moment he comes on, with
  `dist_m` starting at 0.
