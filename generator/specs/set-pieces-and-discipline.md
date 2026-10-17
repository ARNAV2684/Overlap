# Set pieces and discipline spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_match-engine`](../../plans/active/PLAN_generator_match-engine.md), together with
> [`engine.md`](engine.md), [`actions.md`](actions.md) and [`movement.md`](movement.md), which it is kept in step
> with.

Decides restarts, fouls, cards and substitutions. Takers come from each club's `set_pieces` lists
([`world.md`](world.md) §2): the first listed player on the pitch takes it; if none is on the pitch, the best
available player by the attribute named below. Every number is a starting value in `generator/config.py`, tuned
against [`CALIBRATION.md`](../../CALIBRATION.md).

## 1. Restarts

- When does each restart happen (kickoff, throw-in, goal kick, corner, free kick, penalty)?
- Who takes each one, and what are the likely outcomes?

_Answer:_

| Restart | When | Taker | What usually happens |
|---|---|---|---|
| Kickoff | Start of each period; after a goal (by the side that conceded) | The striker (or the most advanced player) | A short pass backwards, then normal play |
| Throw-in | The ball crosses a touchline; to the side that didn't touch it last | The nearest full-back, wing-back or wide player | A short throw to the most open teammate within 15 m. A **long throw** into the box when in the final third, with probability `set_piece_focus × 0.5`, if the team has a `target_man` or a player with `aerial` ≥ 80 |
| Goal kick | The ball crosses the goal line, last touched by an attacker | The goalkeeper | Short to a centre-back when `build_up_short` is high and the opponent is not pressing high (`press_height` < 0.6); otherwise long towards the `target_man` or best `aerial` player, which starts an aerial duel |
| Corner | The ball crosses the goal line, last touched by a defender | `set_pieces.corners`; fallback: best `passing` (never a goalkeeper) | A `Corner` event, then a delivery (below) |
| Free kick | A foul outside the box | `set_pieces.free_kicks` for direct kicks; otherwise the nearest player | Below |
| Penalty | A foul by a defender inside his own box | `set_pieces.penalties`; fallback: best `finishing` + `composure` | A shot with xG 0.78 ([`actions.md`](actions.md) §4) |
| Drop ball | Not modelled | — | — |

**Corners.** A **short corner** with probability `0.35 × (1 − set_piece_focus)`. Otherwise a delivery into the
box: an **in-swinger** if the taker's stronger foot is on the side away from the corner flag, an out-swinger if
not. The delivery aims at the best header (a `target_man` first, then the highest `aerial`) and becomes an aerial
duel against the defender marking him. A won header by an attacker is a headed shot (situation `corner`); a won
header by a defender is a clearance. With high `set_piece_focus`, the attackers send more players into the box,
which raises the chance that the delivery finds a header but leaves fewer back to stop a counter: every set-piece
delivery (corner, wide free kick, long throw) gains `2.5 × (set_piece_focus − 0.5)` on the log-odds of reaching its
target.

**Free kicks.**
- **Direct shot** when the kick is within about 30 m of goal and central: taken with probability
  `0.6 × (0.5 + set_piece_focus)` by the `free_kicks` taker. The shot uses the same shot model with situation
  `free_kick` and a wall in the way.
- **Wide or deeper in the final third:** a cross into the box like a corner delivery when `set_piece_focus` is high;
  otherwise a short pass.
- **In own half:** taken quickly as a short pass (a long ball if `directness` is high).

**Counter risk.** After a cleared set piece the defending side often breaks with fewer attackers back; any shot
within the counter window after that regain counts as `counter` ([`actions.md`](actions.md) §2).

## 2. Fouls

- What is the chance of a foul per defensive action, and what changes it (tackling, fatigue, frustration, zone)?
- Where do fouls lead (free kick, penalty, advantage)?

_Answer:_

Each tackle, aerial duel and attempt to stop a take-on can be a foul by the defender:

> P(foul) = base (0.11 for a tackle, 0.06 for an aerial) × skill × fatigue × situation × role × home advantage

| Factor | Effect |
|---|---|
| Skill | × (1 + (65 − tackling) / 100) |
| Fatigue | up to × 1.3 as stamina falls ([`engine.md`](engine.md) §6) |
| From behind or late | × 1.8 |
| Counter window against his team | × 1.6 (tactical fouls to stop a break) |
| Trailing late | × 1.2 (frustration) |
| Role | `stopper` and `ball_winner` × 1.3 |
| Wet pitch | × 1.1 |
| Home advantage | the home side's fouls are given slightly less often, scaled by attendance ([`engine.md`](engine.md) §9) |
| Inside his own box | × 0.03 (defenders are much more careful), but a foul there is a penalty; tuned so penalties stay near the real rate of about 0.3 a match |

**Consequences:** one `Foul` event by the offender with `fouled_player_id`. Inside the offender's own box → penalty.
Elsewhere → a free kick at the spot, unless the fouled team keeps the ball in a promising position, in which case
the referee plays **advantage**: the foul is still recorded and play goes on.

## 3. Cards

- When is a foul a yellow or red card? How are second yellows handled?
- What happens to a team after a red card?

_Answer:_

| Foul | Yellow | Straight red |
|---|---|---|
| Ordinary | 0.12 | 0.002 |
| Stopping a counter attack (tactical) | 0.55 | — |
| From behind or late | 0.30 | 0.02 |
| Denying an obvious goal-scoring opportunity (last defender, central, near goal) | — | 0.6 (otherwise yellow) |

- A player already on a yellow who gets another is sent off: one `Card` with `second_yellow`. A `Card` event follows
  the `Foul` it punishes.
- **After a red card** the team plays with ten: the formation drops its most advanced non-striker slot (for example
  4-2-3-1 becomes 4-4-1 shape), and its match style shifts by `press_intensity` −0.15, `press_height` −0.15,
  `line_height` −0.10, `directness` +0.10 for the rest of the match. A sent-off player never acts again.
- A side reduced below seven players is abandoned with an error naming the seed (laws of the game); in practice the
  card rates make this vanishingly rare.

## 4. Substitutions

- How many substitutions, when, and who comes off (fatigue, cards, score)?

_Answer:_

- **Rules:** up to **5 substitutes** in at most **3 stoppages during play**, plus half-time, as in current top-flight
  rules. Substitutions happen only when the ball is dead.
- **When:** the first window is usually between 55' and 65', the second between 68' and 78', the last after 80';
  earlier if a player is badly tired or the team is trailing by two.
- **Who comes off:** in order: a player below 0.4 stamina; a defender or midfielder on a yellow card in a tight game
  after 60'; the lowest-rated tired player; trailing late, a defender for a forward ([`engine.md`](engine.md) §6).
  Leading late, a forward for a defender or midfielder.
- **Who comes on:** the best available bench player for the slot, by the world's replacement rule
  ([`world.md`](world.md) §2). He keeps his own role.
- **Event:** one `Substitution`: `player_id` goes off, `player_on_id` comes on.

## 5. Offside

- Is offside modelled? If so, how often and where?

_Answer:_

Yes, simply. When a `through_ball` or forward `long_pass` is played to a runner, the receiver is **offside** if at the
moment of the pass he is beyond the second-last defender. Where that defender stands comes from the defending team's
`line_height` and the movement model ([`movement.md`](movement.md) §1), and the runner's timing from his
`positioning` and role (a `pressing_forward` and a `poacher` gamble more). A high line (`line_height` 0.85) catches
more runners but leaves more space behind when it fails.

An offside gives one `Offside` event by the receiver and an indirect free kick to the defence where he stood. The
target is about 1–3 offsides per team per match, to be sourced in [`CALIBRATION.md`](../../CALIBRATION.md).
