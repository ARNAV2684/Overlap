# Match engine spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_match-engine`](../../plans/active/PLAN_generator_match-engine.md), together with
> [`actions.md`](actions.md), [`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) and
> [`movement.md`](movement.md), which it is kept in step with.

Decides how a match is simulated: the state, the loop, possession, the clock and the end of the match.

The engine is one step-by-step simulation. Every 200 ms of match time every player and the ball move
([`movement.md`](movement.md)), the player on the ball decides when he is ready ([`actions.md`](actions.md)), and a
tracking frame is recorded. Events and tracking therefore come from the same positions and always agree. Inputs are
the saved world ([`world.md`](world.md)), the two club ids, a match id and a seed; the output is the match setup,
the events and the tracking frames ([`CONTRACTS.md`](../../CONTRACTS.md) §2–§4).

## 1. Match state

- What does the state hold (ball position, carrier, possession team, score, period, clock, players on the pitch, fatigue, cards, substitutions used)?
- Which parts of the state are visible to the decision model, and which are internal?

_Answer:_

| Part | Holds |
|---|---|
| Clock | `period`, `period_ms`, `match_ms`, added time announced for the period, display `clock` |
| Score | Goals per side |
| Ball | Position in metres (pitch frame) and height, velocity, mode (`held`, `flight`, `loose`, `dead`), carrier, the flight's target and arrival time |
| Possession | Team in possession, `possession_id`, how it started (kickoff, regain, restart), when, and where |
| Players on the pitch | Per player: slot, role, the world's attributes, position and velocity, stamina left (0–1), yellow card, distance covered, top speed |
| Squads | Bench, substitutions used and windows used, players sent off |
| Recent history | Last completed pass (for key-pass links), when each side last lost and last won the ball (for counter-press and counter-attack windows), last pressure on the carrier |
| Restart pending | Kind, team, spot, taker, earliest time it may be taken |
| Conditions | Weather and attendance for this match (§9) |
| Match style | Each side's ten style traits after score, time, red-card and storyline adjustments (§6) |
| Output | `seq` counter, events, tracking frames |
| Randomness | One random stream per concern (§7) |

**Visible to the decision model:** positions and velocities of everyone, the ball, the carrier, pressure, score and
clock, both sides' match style, roles, attributes, stamina and conditions. **Internal:** random streams, `seq`, the
output buffers and the restart queue.

## 2. The loop

- What is one step of the loop: one action by the player on the ball?
- In what order are things resolved: decision → outcome → new state → events emitted?

_Answer:_

One step is **200 ms of match time**, the tracking rate (5 Hz). A step is not one action: an action (a pass in
flight, a carry, a decision delay) usually spans several steps. In each step, in this order:

1. **Clock.** Advance `period_ms` and `match_ms`; check for the end of the period (§4).
2. **Restarts.** If the ball is dead and the restart's earliest time has come, take it ([`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) §1).
3. **Movement.** Every player steps toward his target; the ball flies, rolls or stays with its carrier
   ([`movement.md`](movement.md) §2).
4. **Arrivals.** A ball in flight that reaches its target or an opponent is resolved: received, intercepted, won in
   the air, saved, blocked, out of play ([`actions.md`](actions.md) §3–§4).
5. **Defending.** Defenders near the ball may press, tackle or intercept ([`actions.md`](actions.md) §1–§3).
6. **Decision.** If the ball is held and the carrier's decision delay has run out, he chooses an action
   ([`actions.md`](actions.md) §2), which either resolves at once (a take-on) or launches the ball (a pass, shot).
7. **Events.** Each resolved action emits its events at this step's `match_ms`, in the order they happened.
8. **Frame.** Record one tracking frame ([`movement.md`](movement.md) §5).

Within a step, decision → outcome → new state → events, always in that order.

## 3. Possession

- What starts a possession (kickoff, regain, set piece) and what ends it (turnover, shot, out of play, foul)?
- What triggers a change of possession, and how is the new carrier chosen?
- How are possession ids assigned?

_Answer:_

- **Starts:** a kickoff; a regain (successful tackle, interception, recovery of a loose ball, a keeper's save that
  he holds or a claim); a restart awarded to the team (throw-in, goal kick, corner, free kick, penalty).
- **Ends:** the other team gains control, or the ball goes dead and the restart goes to the other team. A shot ends
  the possession only if the ball goes dead to the opponent or the opponent gains it; a rebound to the attackers
  continues it.
- **Change of possession** happens when a player of the other team gains control: winning a tackle, intercepting,
  being first to a loose ball, or taking a restart.
- **Loose balls:** the player who reaches the ball first wins it. Arrival time comes from distance, current speed,
  `acceleration` and `pace`; ties go to the higher `positioning`.
- **Ids:** `possession_id` starts at 1 at the first kickoff and increases by 1 every time the team in possession
  changes, and at every kickoff. A restart taken by the team that already had the ball keeps the id.

## 4. Clock and periods

- How much time does each action type take (a distribution per action)?
- How much stoppage time is added, and what drives it (goals, subs, cards, injuries)?
- When does a period end exactly (e.g. not in the middle of an attack)?
- Are extra time and penalties in scope?

_Answer:_

**Time per action** comes from the simulation itself: ball flights take their physical time
([`actions.md`](actions.md) §5), carries and runs take their movement time, and every touch costs a decision delay:

| Delay | Range (s) | Shorter when | Longer when |
|---|---|---|---|
| Decision delay on the ball | 0.4–2.4 | Higher `tempo`, under pressure, one-touch passes in the final third | Low `tempo`, a deep playmaker or goalkeeper with time, protecting a lead late on |

**Dead-ball time** (seeded within each range):

| Restart | Range (s) |
|---|---|
| Throw-in | 8–18 |
| Goal kick | 15–30 |
| Corner | 25–45 |
| Free kick | 15–45 (longer near goal) |
| Penalty | 60–100 |
| After a goal, to kickoff | 45–75 |
| Substitution | 25–40 |
| Card | 20–40 |

**Added time** is announced when the period reaches 45:00. It is the dead-ball time spent on goals, substitutions,
cards and penalties in that period above a normal allowance, plus a seeded 30–90 s for other stoppages, rounded up
to whole minutes: typically 2–5 minutes in the first half and 5–10 in the second, in line with recent top-flight
practice. The calibration target and its source go in [`CALIBRATION.md`](../../CALIBRATION.md).

**End of a period:** once the added time has run out, the referee ends the period at the next moment the ball is
dead, or the next moment neither side is in the final third, whichever comes first, and at most 60 s later.

**In scope:** periods 1 and 2 only. Extra time and shootouts (periods 3–5) are out of scope.

## 5. Pressure

- When is a player under pressure? How many opponents, and how close?
- How does pressure feed into decisions and outcomes?

_Answer:_

- **Under pressure:** an opponent is within **2.5 m** of the carrier and closing, or one pressed him in the last
  1.5 s. This sets `under_pressure` on his events.
- **Pressure events:** a defender who closes to within 2.5 m of the carrier emits one `Pressure` event (with
  `target_player_id`), at most once per 1.5 s per defender.
- **Effect on decisions:** under pressure, risky actions (through balls, take-ons deep in his own half, long
  carries) lose weight and safe ones (short passes, clearances, hold-up for a target man) gain it
  ([`actions.md`](actions.md) §2).
- **Effect on outcomes:** pass, first-touch and shot accuracy drop under pressure, by less for a player with high
  `composure` ([`actions.md`](actions.md) §3).

## 6. Fatigue and form

- How does stamina drain over a match, and how does it affect attributes?
- Does recent form or the score (e.g. a team chasing the game) change behaviour?

_Answer:_

- **Stamina** starts at 1.0 and drains each step by an amount that grows with the player's speed (sprinting drains
  most), multiplied by `0.6 + 0.8 × (1 − stamina/99)` so a high-`stamina` player drains slower, and by the heat
  factor (§9). Half-time restores 15 % of what was lost.
- **Effect:** below 0.7 stamina, `pace` and `acceleration` drop by up to 8 % and pass, touch and shot accuracy by up to
  6 % at 0.3. Tired players are first in line to be substituted
  ([`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) §4).
- **Form:** none inside a match. Form across a season belongs to batch mode ([`live-and-batch.md`](live-and-batch.md)).
- **Score and time** adjust each side's match style, within limits so a team never stops being itself:

| Situation | Adjustment |
|---|---|
| Trailing after 60' | `directness` +0.10, `press_intensity` +0.10, `press_height` +0.10, more shots from distance |
| Trailing by 2+ after 75' | The above doubled; a defender replaced by a forward when a sub is available |
| Leading after 75' | `tempo` −0.10, `line_height` −0.10, `press_height` −0.10, more holds and clearances |
| A red card against | See [`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) §3 |

Storylines ([`storylines.md`](storylines.md)) may add further, bounded adjustments through the same hook.

## 7. Randomness and seeds

- Which random generator is used, and how is it seeded so the same seed gives the same match?
- Do the generator and the movement model share one random stream or use separate ones?

_Answer:_

- Python's `random.Random`, one **stream per concern**: `conditions`, `decisions`, `outcomes`, `discipline`,
  `movement`, `restarts`. Each is seeded with the first 8 bytes of `sha256(f"{match_seed}:{stream}")`, so tuning one
  concern never reshuffles the others.
- The movement model has its own stream (`movement`), separate from the engine's.
- **Same seed, same match, byte for byte:** iteration is always in a fixed order (players by slot, sides home then
  away), no set or dict order is relied on, and no wall-clock time or global random state is used.

## 8. Events out

- Which event types are emitted for each action (see CONTRACTS.md §3)?
- Which qualifiers are emitted, and when?

_Answer:_

Every event follows [`CONTRACTS.md`](../../CONTRACTS.md) §3 exactly, with coordinates in the **acting team's frame**
taken from the actor's tracked position at that step (converted by `generator/pitch.py`), so events and tracking
agree.

| Action | Events |
|---|---|
| Period start / end | `PeriodStart`, `PeriodEnd` (no team or player) |
| Pass, cross, through ball, switch, cutback, long ball | `Pass` with `outcome`; on success an exact `receiver_id`; `end_x`/`end_y` where it arrived |
| Carry | `Carry`, emitted **when the carry ends**, with its start in `x`/`y` and its end in `end_x`/`end_y` |
| Take-on | `TakeOn` (attacker) with `outcome`; a won duel for the defender is a `Tackle` |
| Shot | `Shot` with `shot_outcome`, `situation`, `body_part`, `shot_speed_kmh`, `goal_mouth_y`, `goal_mouth_z`; `assisted_by` and `key_pass_event_id` when a pass set it up |
| Keeper save | `Save` by the goalkeeper, right after the saved `Shot` |
| Tackle, interception, clearance, ball recovery | `Tackle` (with `outcome`), `Interception`, `Clearance`, `BallRecovery` |
| Aerial duel | One `Aerial` for each player in the duel: `outcome` success for the winner, fail for the loser |
| Pressure | `Pressure` with `target_player_id` (§5) |
| Foul | One `Foul` by the offender, with `fouled_player_id` |
| Card | `Card` with `card` |
| Substitution | `Substitution`: `player_id` goes off, `player_on_id` comes on |
| Offside | `Offside` by the player caught offside |
| Corner | `Corner` by the taker, then the delivery as a `Pass` |

**Qualifiers:** `key_pass` (the pass before a shot), `cutback`, `switch_of_play` (a pass that moves the ball more than
35 m across), `through_ball`, `cross`, `long_ball` (over 32 m), `headed`, `weak_foot` (a pass or shot with the weaker foot).
What counts as a big chance is the stats engine's call ([`CONTRACTS.md`](../../CONTRACTS.md) §5), not a qualifier.

**Invariants, tested on every match:** the score equals the goal shots; `seq` strictly increases; `match_ms` never
goes back; no events after full time; a successful pass's receiver is a teammate, not the passer; no player acts
after a red card or after being substituted off; key-pass links are exact; coordinates stay within 0–100; the same
seed gives the same match.

## 9. Match conditions

Not one of the template's questions, but the engine reads them, so they are specified here.

- **Weather** is drawn once per match from the `conditions` stream, from the home venue's climate
  ([`world.md`](world.md) §1) and the kickoff month. The venue's `climate` and `capacity` are added to the world
  in their own small PR; until then every venue is temperate with 40,000 seats. Weather is: temperature (°C), precipitation (`none`, `light`, `heavy`) and
  wind (m/s). The pitch is `wet` in any rain.
- **Effects are small** and each is either sourced in [`CALIBRATION.md`](../../CALIBRATION.md) or labelled a
  judgement call there:

| Condition | Effect |
|---|---|
| Heat (above 25 °C) | Stamina drains up to 15 % faster (published work links heat with less distance covered) |
| Wet pitch | Ground passes travel about 5 % faster; first-touch and pass accuracy drop about 2 %; keeper handling errors rise slightly (judgement call) |
| Heavy rain | The wet-pitch effects doubled (judgement call) |
| Wind above 8 m/s | Long passes, crosses and shots from over 20 m lose accuracy, more so into the wind (judgement call) |

- **Attendance** is the home venue's capacity × a seeded fill rate (85–100 %). **Home advantage** is a small boost to
  the home side's `passing`, `finishing`, `tackling` and `composure` (+6 each at a full house, substitutes
  included) and a slightly lower chance that the home side's fouls are given, both scaled by attendance; it is tuned so the home win, draw and away win shares match the public target in
  [`CALIBRATION.md`](../../CALIBRATION.md). Studies of matches played without crowds found the home advantage
  shrinks without them, which is why it scales with attendance.
- **Conditions in the output:** recorded in the engine's result. Sending them to other layers needs an optional
  `conditions` field in the match setup ([`CONTRACTS.md`](../../CONTRACTS.md) §2), proposed in its own contract PR;
  until it merges, they stay inside the generator.
