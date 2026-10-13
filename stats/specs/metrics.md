# Metrics spec

> **Status: not started.** Write and agree this before coding `xg.py`, `pass_difficulty.py`, `per_event.py` and `whole_match.py`.

Decides the exact formula for every number the stats engine produces. CONTRACTS.md §8 has the agreed starting definitions.

## 1. xG

- Which inputs (distance, angle, body part, situation, assisted, under pressure)?
- What are the coefficients, and how are they checked against public reference values?

_Answer:_

## 2. Pass metrics

- How are pass distance, accuracy and difficulty (0–1) computed?
- What counts as progressive, line-breaking or a key pass?

_Answer:_

## 3. Speed and distance

- How are ball speed and shot speed reported, and which player speed metrics are kept?

_Answer:_

## 4. Pressing

- Exact PPDA zones and which events count.
- How press height and the 9 × 6 pressing grid are computed.

_Answer:_

## 5. Momentum and control

- Momentum weights and bucket size.
- How control ↔ chaos and rhythm are scored.

_Answer:_

## 6. Whole-match

- Which totals, pass network rules (minimum passes per link), zones and player stats are kept?

_Answer:_

## 7. Small samples

- Shrinkage constants and the minimum sample for each rate or percentile.

_Answer:_
