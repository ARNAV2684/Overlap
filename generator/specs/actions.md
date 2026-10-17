# Actions and outcomes spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_match-engine`](../../plans/active/PLAN_generator_match-engine.md), together with
> [`engine.md`](engine.md), [`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) and
> [`movement.md`](movement.md), which it is kept in step with.

Decides what the player on the ball does next, and whether it works. This is where the numbers get tuned. Every
number below is a starting value kept in `generator/config.py` and tuned against
[`CALIBRATION.md`](../../CALIBRATION.md); the spec fixes the shape of each rule, not its final constants.

Positions are in the acting team's frame: `x` 0 → 100 from own goal to the opponent's, `y` 0 → 100 from its left
touchline to its right ([`CONTRACTS.md`](../../CONTRACTS.md) §1.1). Distances are in metres.

## 1. Action set

- Which actions can the player on the ball take (short pass, long pass, through ball, cross, switch, carry, take-on, shot, clearance, hold)?
- Which off-ball actions exist (pressure, tackle, interception, aerial duel, ball recovery)?

_Answer:_

**On the ball:** `short_pass` (up to 20 m), `long_pass` (over 32 m in the air or along the ground), `through_ball`
(into space behind the defensive line), `cross` (from a wide area into the box), `cutback` (from the byline area back
to the edge of the six-yard box or penalty spot), `switch` (more than 35 m across), `carry`, `take_on`, `shot`,
`clearance`, `hold` (shield the ball and wait for support).

**Off the ball:** `pressure`, `tackle`, `interception` (of a pass in flight), `block` (of a shot or cross),
`aerial` duel, `ball_recovery` (first to a loose ball), and the goalkeeper's `save`, `claim` and `punch`.

Restarts (kickoffs, throw-ins, goal kicks, corners, free kicks, penalties) are in
[`set-pieces-and-discipline.md`](set-pieces-and-discipline.md).

## 2. Choosing an action

- What are the base probabilities of each action, by pitch zone?
- How do player attributes, position, team style, score and pressure shift those probabilities?
- How is the target of a pass chosen (nearest, most open, most progressive)?

_Answer:_

Each available action gets a weight, and one is picked at random in proportion to its weight (the `decisions`
stream):

> weight = base(zone, action) × attributes × role × team style × score and time × pressure × conditions

**Zones** split the pitch by `x` (own third 0–33, middle 33–66, final third 66–83, box-depth 83–100) and by `y`
(wide 0–18 and 82–100, half-space 18–35 and 65–82, central 35–65).

**Base weights** (relative within a zone; an action that is impossible from where the player stands gets 0; the
values tuned against [`CALIBRATION.md`](../../CALIBRATION.md) in M3):

| Zone | short_pass | long_pass | through_ball | cross | cutback | switch | carry | take_on | shot | clearance | hold |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Own third | 60 | 14 | 3 | 0 | 0 | 4 | 12 | 2 | 0 | 8 | 4 |
| Middle third | 55 | 10 | 8 | 0 | 0 | 6 | 16 | 5 | 0.3 | 1 | 4 |
| Final third, wide | 38 | 2 | 6 | 5 | 3 | 5 | 14 | 10 | 1 | 0 | 5 |
| Final third, central | 40 | 1 | 11 | 0 | 0 | 2 | 12 | 8 | 10 | 0 | 4 |
| Box-depth | 24 | 0 | 6 | 4 | 6 | 0 | 6 | 8 | 0 | 0 | 3 |

**Shot weight.** In the final third and box-depth, `shot` gets weight `S × xG / (K + xG)` plus the zone's base weight
above, where xG is the shot's value from §4 if he shoots from here, `S` is the shot appetite (19) and `K` (0.25) sets
how closely the choice follows chance quality. No shot below xG 0.02. The weight is then multiplied by
`0.2 + directness`, so direct sides shoot sooner and patient sides work the ball closer.

**Attributes** (each factor is 1.0 for a rating of 70):

| Action | Factor |
|---|---|
| `take_on` | `(dribbling / 70)²` |
| `through_ball`, `switch` | `(vision / 70)²` |
| `long_pass` | `passing / 70` |
| `carry` | `(dribbling + acceleration) / 140` |
| `shot` | `finishing / 70`; from over 20 m also `× (finishing / 70)` |
| `clearance` | `1.5 − composure / 140` |

**Roles** ([`world.md`](world.md) §3) multiply the weights of the actions that define them:

| Role | On the ball |
|---|---|
| `sweeper_keeper` | `short_pass` ×1.5, `long_pass` ×0.6 |
| `shot_stopper` | `long_pass` ×1.5, `short_pass` ×0.7 |
| `ball_playing_cb` | `carry` ×1.4, `long_pass` and `switch` ×1.3, `clearance` ×0.7 |
| `stopper` | `clearance` ×1.6, `carry` ×0.6 |
| `overlapping_fullback`, `wing_back` | `cross` ×1.5 |
| `inverted_fullback` | `short_pass` ×1.2, `cross` ×0.6 |
| `anchor` | `short_pass` ×1.3, `take_on` ×0.5 |
| `deep_playmaker` | `long_pass`, `switch` and `through_ball` ×1.5 |
| `ball_winner` | `short_pass` ×1.2, `through_ball` ×0.7 |
| `box_to_box` | `carry` ×1.2, `shot` from the box ×1.2 |
| `playmaker` | `through_ball` ×1.7, `cutback` ×1.3 |
| `inverted_winger` | `carry` inside onto the stronger foot ×1.5, `shot` from the half-space ×1.4, `cross` ×0.7 |
| `wide_winger` | `take_on` ×1.4, `cross` ×1.5 |
| `wide_midfielder` | `cross` ×1.2, `take_on` ×0.8 |
| `poacher` | `shot` in the box ×1.4, `shot` outside ×0.5, `carry` ×0.6 |
| `target_man` | `hold` ×2.0, `short_pass` (lay-offs) ×1.3 |
| `pressing_forward` | `through_ball` received more often (runs, [`movement.md`](movement.md) §1) |

**Team style** (match values after the score and time adjustments in [`engine.md`](engine.md) §6):

| Trait | Effect |
|---|---|
| `directness` | `long_pass` and `through_ball` × (0.5 + directness); `short_pass` × (1.5 − directness) |
| `width` | `cross` and `switch` × (0.5 + width) |
| `tempo` | decision delay ([`engine.md`](engine.md) §4) × (1.3 − 0.6 × tempo) |
| `build_up_short` | the goalkeeper's `short_pass` × (0.3 + build_up_short × 1.4), `long_pass` the reverse |
| `counter_attack` | in the **counter window** (12 s after winning the ball in the own half; it ends early when a completed pass gains less than 5 % of the pitch, so recycling the ball ends a counter): `through_ball`, forward `long_pass`, forward `carry` and `shot` × (1 + counter_attack); `short_pass` × (1 − 0.5 × counter_attack); `hold` × (1 − counter_attack) |
| `press_intensity`, `press_height`, `counter_press`, `line_height` | off the ball, below |
| `set_piece_focus` | restarts, [`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) |

**Off the ball,** the defending side decides each step who presses:

- **Where pressing starts:** the ball must be inside the press zone, `x ≥ 100 − (35 + 45 × press_height)` in the
  **carrier's** frame (the same as `x ≤ 35 + 45 × press_height` in the defenders' own frame). A high press (0.85)
  hunts the ball almost up to the carrier's goal; a low block (0.35) waits until the ball reaches about halfway.
- **How often:** each nearby defender (within 12 m, nearest first, at most two at once) presses with probability
  `press_intensity` per decision of the carrier.
- **Counter-press window:** for 5 s after losing the ball, the nearest three players press regardless of the press
  line, with probability `counter_press`.
- `line_height` places the defensive line ([`movement.md`](movement.md) §1), which drives offsides and balls in
  behind.
- Roles: `ball_winner` and `pressing_forward` press ×1.4; `stopper` steps out to tackle ×1.3; `anchor` presses
  ×0.7 (holds position).

**Score and time** come in through the match style ([`engine.md`](engine.md) §6). **Pressure** (an opponent within
2.5 m): `through_ball`, `take_on` in own half and `carry` × 0.6; `short_pass`, `clearance` and `hold` × 1.3.
**Conditions:** wind above 8 m/s makes `long_pass`, `switch` and `cross` × 0.8.

**Choosing the pass target.** Every teammate in range is scored:

> score = openness + progress + receiver + role preference

- **openness:** distance from the receiver and the passing lane to the nearest opponent;
- **progress:** how much nearer the opponent's goal the ball ends up, and lines of defenders bypassed;
- **receiver:** a little extra for better first touch (`dribbling`) and, for crosses, `aerial`;
- **role preference:** crosses aim at the best `aerial` attacker (a `target_man` first), cutbacks at arriving
  midfielders, a `deep_playmaker` looks for the furthest open runner.

The target is picked from the scores with a softmax whose temperature falls as `vision` rises, so better passers pick
the best option more often.

## 3. Resolving an outcome

- What is the base success rate of each action (cite public averages in CALIBRATION.md)?
- How do length, pressure, skill, fatigue and the defender's attributes change it?
- What happens on failure: who gets the ball, and where?

_Answer:_

**Which foot.** A player uses his stronger foot unless the ball and angle force the other: about 15 % of passes and
a share of shots that grows when he is on his weaker side. A both-footed player never counts as using his weak foot.
A weak-foot action is marked with the `weak_foot` qualifier and loses accuracy by `(5 − weak_foot) × 3 %` for
passes and `(5 − weak_foot) × 5 %` for shots. (Published passing data found about 14 % of passes are made with the
weaker foot; a shooting study found weak-foot shots underperform xG. Both are cited in
[`CALIBRATION.md`](../../CALIBRATION.md).)

**Base success** (before modifiers; tuned to the completion targets in [`CALIBRATION.md`](../../CALIBRATION.md)):

| Action | Base | Main modifiers |
|---|---|---|
| `short_pass` | 0.96 | `passing`, pressure, distance, weak foot |
| `long_pass` | 0.75 | `passing`, `vision`, distance, wind |
| `through_ball` | 0.50 | `vision`, `passing`, how tight the defensive line is |
| `cross` | 0.24 (reaches a teammate) | `passing`, delivery foot, the target's `aerial` vs the defenders' |
| `cutback` | 0.55 | `passing`, defenders near the six-yard box |
| `switch` | 0.70 | `passing`, wind |
| `take_on` | 0.48 | `dribbling` and `acceleration` against the defender's `tackling` and `pace` |
| `carry` | 0.95 per carry | pressure and the defenders it passes |
| `tackle` | 0.55 for the defender | `tackling` against `dribbling`; from behind, fouls more likely |
| `aerial` | 0.50 | `aerial` against `aerial`, plus height of run-up (position) |

Each modifier moves the probability on the log-odds scale: skill by `(rating − 70) / 15`, pressure by −0.4 (halved
for `composure` ≥ 80), fatigue as in [`engine.md`](engine.md) §6, wet pitch −0.1, weak foot as above. A ground pass
played to within 3 m of an opponent loses up to 0.8 (all of it with the opponent on the spot), so passes into a
crowded box fail more than passes into space. Every pass in
flight can also be **intercepted** by a defender near its path: each defender within 2 m of the line gets a chance
that rises with his `positioning` and `pace` and falls with the ball's speed.

**On failure:**
- A pass that is intercepted goes to the interceptor (`Interception`). One that is simply off target becomes a loose
  ball where it lands, won by whoever gets there first ([`engine.md`](engine.md) §3); out of play gives a restart.
- A failed take-on or a lost carry is a `Tackle` won by the defender, who has the ball, or a loose ball if the
  tackle only pokes it away (30 %).
- A lost aerial duel: the winner heads it on, clears it or controls it. A defender heading a cross away puts it
  behind for a corner 25 % of the time.
- An inaccurate cross is cut out behind for a corner 15 % of the time; a blocked shot goes behind for a corner 35 %
  of the time.
- A clearance goes 25–55 m upfield, usually out of play or to a loose ball.

## 4. Shots

- How are shot location, body part and situation chosen?
- How is the outcome decided (goal, saved, missed, blocked, woodwork), and how does it relate to xG?
- How are shot speed and goal-mouth position generated?

_Answer:_

**Location** is where the shooter is when he shoots. **Body part:** a header after a cross, corner or high ball
that he wins in the air; otherwise a foot (§3). **Situation:** `penalty`; `corner`, `free_kick` or `throw_in`
when the shot comes within 10 s of that restart and before the defence has cleared it; `counter` in the counter
window (§2); otherwise `open_play`.

**Shot quality (xG).** Every shot gets an xG from one logistic model, as close to real football as public data
allows:

> xG = 1 / (1 + e^−z), z = β₀ + β_d · distance + β_a · angle + β_da · distance · angle + β_head · header
> + β_weak · weak foot + β_sit · situation + β_assist · assist type + β_press · defenders in the way
> + β_gk · keeper out of position

- `distance` from the centre of the goal (m); `angle` the visible angle of the goal mouth (radians);
- `assist type`: through ball, cutback, cross (crosses and headers are lower), set piece, none;
- `defenders in the way`: opponents inside the triangle from the ball to the posts;
- `keeper out of position`: his distance from the line between the ball and the centre of the goal;
- a **penalty** is fixed at **0.78**, Opta's value from its historical conversion rate. `CONTRACTS.md` §8 still says
  about 0.76 and is updated in the conditions contract PR; `CALIBRATION.md` is updated in the calibration-sources PR.

The coefficients live in `config.py` and are fitted so the model hits these **public anchor points**, each cited in
[`CALIBRATION.md`](../../CALIBRATION.md):

| Shot | Target xG |
|---|---|
| Inside the six-yard box, central, foot | about 0.40 |
| Same, header | under 0.25 |
| Open-play shot from the penalty spot, central, foot | about 0.30 |
| Edge of the box, central, foot | about 0.06–0.08 |
| From 25 m or more | about 0.02–0.03 |
| All shots, season average | conversion about 10–12 % |

Because the inputs are the ones [`CONTRACTS.md`](../../CONTRACTS.md) §8 lists for the stats engine's xG (distance,
angle, body part, situation), the stats engine can use the same model, so measured xG and goals agree.

**From xG to outcome.** xG is what an average player scores from that shot. The actual result then depends on who
is shooting and who is in goal:

1. **Blocked:** each defender in the way may block it (higher with more defenders and a slower shot).
2. **On target or not:** probability from the shot's xG and difficulty, raised by `finishing` and lowered by
   pressure, the weak foot, fatigue and wind. About a third of all shots are on target. Of off-target shots, a small
   share hit the **woodwork**.
3. **Goal or save:** for a shot on target, `P(goal) = min(0.97, xG / P(on target))`, moved by the shooter's `finishing` against
   the keeper's `goalkeeping` on the log-odds scale (each 10 points ≈ 0.15), so an elite finisher beats xG by
   roughly 10–20 % over a season and a weak one falls short. A save emits a `Save` and may give a rebound (a loose
   ball), a corner or the keeper's possession.

**Shot speed:** feet 70–120 km/h (more for power from distance, scaled by `finishing`), headers 40–75 km/h.
**Goal-mouth position:** `goal_mouth_y` (0–100 across the goal) and `goal_mouth_z` (metres) are drawn to fit the
outcome: inside the frame for goals and saves, outside for misses, on the post or bar for woodwork; better finishers
aim nearer the corners.

## 5. Speeds and distances

- How are ball speed and pass distance generated per action?

_Answer:_

- **Distance** is from the passer to the chosen target point (a receiver's feet, or space ahead of a runner for a
  through ball).
- **Ball speed** at release: short ground passes 35–60 km/h, long and lofted passes 55–90 km/h, crosses 60–85 km/h,
  clearances 70–100 km/h; higher `passing` gives tighter, firmer passes. The ball slows in flight (rolling friction
  on the ground, which is lower on a wet pitch; air drag in the air), so flight time comes from physics, not a fixed
  value.
- **Lofted balls** (long passes, crosses, clearances, goal kicks) follow an arc with a peak of 2–12 m, which sets
  `z` in tracking and whether a defender can intercept on the way.
- `ball_speed_kmh` on events is the release speed; tracking carries the speed every step
  ([`movement.md`](movement.md) §5).

## 6. Calibration

- Which per-match totals must land in range (passes, completion, shots, goals, fouls, cards)?
- Which knobs do we turn when a total is out of range?

_Answer:_

Each target has a public source in [`CALIBRATION.md`](../../CALIBRATION.md); a target without one is not used.

| Total per match | Target (to be sourced) | Main knobs |
|---|---|---|
| Goals | about 2.7–3.3 | shot appetite `S` and `K` (chance quality), finishing and goalkeeping factors |
| Shots (both teams) | about 25–28 | shot appetite `S`, the final-third shot base weight, the minimum xG |
| Shot conversion | about 10–12 % | xG coefficients, on-target model |
| Penalty conversion | about 0.78 | penalty xG, finishing vs goalkeeping |
| Passes per team | 350–600 | base weights, decision delay, `tempo` |
| Short-pass completion | about 88–90 % | `short_pass` base, interception chance |
| Fouls per team | 9–14 | foul base rate ([`set-pieces-and-discipline.md`](set-pieces-and-discipline.md) §2) |
| Yellow cards | to be sourced | card probabilities |
| Possession for reference club A against B | about 65–70 % (answer key, not a public target) | `directness`, `tempo`, press traits |

When a total is out of range, change the named knob in `config.py` in one small step, re-run the batch check, and
record the measured value in [`CALIBRATION.md`](../../CALIBRATION.md).
