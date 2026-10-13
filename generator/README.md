# Generator

A probabilistic match simulation: hand-written rules plus seeded dice rolls, tuned until the output matches public
real-football averages. It is not a trained model.

| Part (planned) | Job |
|---|---|
| World builder | Invents clubs, players, kits (contrast-checked) and team styles |
| Match engine | Simulates the match possession by possession |
| Movement model | Player and ball positions, speed and distance at 5 Hz |
| Storylines | Scripted drama that tilts the odds, never forces events |
| Live mode | Streams a match into Event Hubs at 1×, 5× or 20× |
| Batch mode | Writes a whole synthetic season plus a realism report |

**First milestone:** one recorded match in [`data/recorded`](../data/recorded), in the shapes from
[`CONTRACTS.md`](../CONTRACTS.md).

**Invariants (to be tested):** the score equals the number of goal shots; coordinates stay within 0–100; no events
after full time; every successful pass has a receiver on the same team; no player acts after a red card; the same
seed produces the same match.
