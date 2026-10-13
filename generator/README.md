# Generator

A probabilistic match simulation: hand-written rules plus seeded dice rolls, tuned until the output matches public
real-football averages. It is not a trained model. Everything it produces (clubs, players, matches) is invented.

## Define before you code

Write and agree these specs **in this order** before writing the scripts they govern. Each template lists the
questions to answer; nothing in `world.py`, `engine.py` and the rest should be written until its spec is agreed.

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/world.md`](specs/world.md) | Every club, player and team trait: squads, positions, the full attribute list and ranges, how ratings are generated, club strength, team style parameters and how each changes behaviour, formations, names, kit colours, how the world is saved | `world.py`, `names.py`, `kits.py` |
| 2 | [`specs/engine.md`](specs/engine.md) | The match state, the loop, what starts and ends a possession and what triggers a change of possession, the clock and stoppage time, pressure, fatigue, seeds, which events are emitted | `engine.py`, `state.py` |
| 3 | [`specs/actions.md`](specs/actions.md) | What the player on the ball does next and whether it works: the action set, base probabilities by zone, how attributes, style, score and pressure shift them, shot outcomes, speeds, calibration knobs | `decisions.py`, `outcomes.py`, `config.py` |
| 4 | [`specs/set-pieces-and-discipline.md`](specs/set-pieces-and-discipline.md) | Restarts, fouls, cards, substitutions, offside | `set_pieces.py`, `discipline.py` |
| 5 | [`specs/movement.md`](specs/movement.md) | Where every player and the ball are at 5 Hz: formation anchors, how the shape shifts, acceleration and top speed, sprints, distance covered, player-tag thresholds | `movement.py` |
| 6 | [`specs/storylines.md`](specs/storylines.md) | Scripted drama that tilts the odds: the file format, allowed effects and limits, the demo catalogue, answer keys for evaluating the agents | `storylines.py`, `storylines/*.yaml` |
| 7 | [`specs/live-and-batch.md`](specs/live-and-batch.md) | Streaming to Event Hubs, the recorded-match format, full seasons, the realism report, the command line | `live.py`, `batch.py`, `realism_report.py`, `cli.py` |

Shared rules every spec must respect: [`CONTRACTS.md`](../CONTRACTS.md) (event and tracking shapes, coordinates,
time) and [`CALIBRATION.md`](../CALIBRATION.md) (every target needs a public source).

## Files

| File | Job |
|---|---|
| `world.py` | Invents clubs, squads, attributes and team styles |
| `names.py` | Invented, non-duplicate names |
| `kits.py` | Distinguishable, readable kit colours |
| `state.py` | Everything the engine knows during a match |
| `engine.py` | The match loop, possession by possession |
| `decisions.py` | What the player on the ball does next |
| `outcomes.py` | Whether an action works, and what happens next |
| `set_pieces.py` | Kickoffs, throw-ins, goal kicks, corners, free kicks, penalties |
| `discipline.py` | Fouls, cards, substitutions |
| `movement.py` | Positions, speed, sprints and distance at 5 Hz |
| `storylines.py` + `storylines/` | Loads storyline files and applies their effects |
| `config.py` | Every tunable number in one place |
| `live.py` | Streams a match into Event Hubs at 1×, 5× or 20× |
| `batch.py` | Generates a full synthetic season |
| `realism_report.py` | Compares a season with the calibration targets |
| `cli.py` | Command-line entry point |
| `tests/` | Invariants, seed reproducibility, world checks |

## Invariants (to be tested)

The score equals the number of goal shots; coordinates stay within 0–100; no events after full time; every
successful pass has a receiver on the same team; no player acts after a red card; the same seed produces the same
match.
