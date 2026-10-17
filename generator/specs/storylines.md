# Storylines spec

> **Status: agreed.** Agreed in the spec PR for
> [`PLAN_generator_storylines`](../../plans/active/PLAN_generator_storylines.md). Kept in step with
> [`engine.md`](engine.md) §6, whose score-and-time hook storylines use.

Decides the scripted drama that tilts the odds without forcing events, and how we know what to expect from each.

A storyline never writes an event. It only changes inputs the engine already has (style traits, shot appetite, foul
and card rates, stamina, a player's form) inside a time window, so everything that happens is still decided by the
same dice and rules. That keeps matches believable and lets the agents be scored on spotting the change.

## 1. Format

- What fields does a storyline file have (name, trigger window, team, which parameters it changes, by how much)?

_Answer:_

One YAML file per storyline in `generator/storylines/`, named after the storyline:

```yaml
name: late_pressure_surge
summary: The home side raises its press and shoots more after the 55th minute.
team: home                      # home, away, trailing, leading, or a club id
starts: {minute: 55}            # or {after: conceding | red_card_against | leading_by_2}; optional jitter_min
ends: {minute: full_time}       # or {minute: 80}
ramp_min: 5                     # effects grow from 0 to full over this many minutes
effects:
  style: {press_intensity: +0.20, press_height: +0.15, counter_press: +0.10}
  shot_appetite: 1.30           # multiplier
answer_key:
  signals: [pressures_per_5min_up, high_regains_up, shots_per_5min_up, momentum_share_up]
  detect_within_min: 10         # an agent should call it within this many minutes of onset
```

| Field | Meaning |
|---|---|
| `name` | Matches the file name and the value in the match setup's `storylines` ([`CONTRACTS.md`](../../CONTRACTS.md) §2) |
| `summary` | One sentence for people and for the agents' evaluation |
| `team` | Who it applies to; `trailing` / `leading` are decided at onset |
| `starts`, `ends` | A minute, or an event-based condition; `jitter_min` moves the start by up to that many minutes (seeded) |
| `ramp_min` | Effects grow linearly to full size, so the change is gradual, as in real matches |
| `effects` | Only the effects in §2, within their limits |
| `answer_key` | What a good agent should notice (§4) |

A match may carry up to two storylines; when both change the same thing, the changes add and the limits in §2 still
apply to the total.

## 2. Allowed effects

- Which parameters can a storyline change (press intensity, directness, shot appetite, fatigue rate)?
- What limits keep the result believable?

_Answer:_

| Effect | What it changes | Limit |
|---|---|---|
| `style` | Any of the ten style traits ([`world.md`](world.md) §4) | Each within ±0.25 of the club's value, and inside 0–1 |
| `shot_appetite` | The shot weight in `actions.md` §2 | × 0.7 to × 1.5 |
| `foul_rate` | The foul chance in `set-pieces-and-discipline.md` §2 | × 0.5 to × 2.5 |
| `card_rate` | Card chances after a foul | × 0.5 to × 2.0 |
| `stamina_drain` | Stamina drain in `engine.md` §6 | × 0.8 to × 1.3 |
| `player_form` | One named player's `finishing`, `composure` and `dribbling` | +5 at most each (a "big night", never a different player) |

**Never:** forcing a goal, a card, a substitution or any other event; changing attributes beyond `player_form`;
changing the other team's traits (each storyline applies to one side, and the other side reacts through the normal
score-and-time rules).

## 3. Catalogue

- Which storylines do we need for the demo (e.g. late pressure surge, red-card collapse, comeback, star player's big night)?

_Answer:_

| Storyline | Team | When | Main effects | Good demo with |
|---|---|---|---|---|
| `late_pressure_surge` | home | 55' to full time | press +0.20, press height +0.15, counter-press +0.10, shots × 1.3 | Calverholme at home |
| `red_card` | away | 28'–42' window | fouls × 2.5, cards × 2.0 (a red becomes likely, never certain) | Dunmarrow away |
| `comeback` | trailing | from 60' if trailing | directness +0.15, press +0.20, shots × 1.4 | Either |
| `star_night` | a club id + player | whole match | `player_form` +5 for one player; shots × 1.2 for his team | Calverholme's striker |
| `low_block_resistance` | away | whole match | line height −0.10, press height −0.10, counter-attack +0.10 | Dunmarrow away |
| `fading_legs` | either | from 70' | stamina drain × 1.3 | Hot-weather matches |

The mock's three storylines (`late_pressure_surge`, `red_card`, `comeback`) keep their names so consumers built on the
mock see the same values.

## 4. Answer keys

- What do we record so the agents can be evaluated later (e.g. storyline onset time, expected signals)?

_Answer:_

For each storyline in a match, the engine records an **answer key** in the match summary (and the recorded
`summary.json`, [`live-and-batch.md`](live-and-batch.md) §2):

| Field | Meaning |
|---|---|
| `name`, `team_id` | Which storyline, for which club |
| `onset_ms`, `full_ms`, `end_ms` | When it started, when its effects reached full size, when it ended (`match_ms`) |
| `signals` | The signals from the file's `answer_key` |
| `measured` | The same signals measured from the events, before and after onset (for example pressures per 5 minutes) |
| `detect_within_min` | How soon an agent should call it |

The agents' recall evaluation ([`agents/specs/evaluation.md`](../../agents/specs/evaluation.md) §1, owner unassigned,
Arnav decides) scores a storyline as found if a moment or overlay about it appears between `onset_ms` and
`onset_ms + detect_within_min`. The answer key stays inside the generator's output files; it is never sent to the
agents during a match, so they can't read the answer.
