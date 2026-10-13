# Match engine spec

> **Status: not started.** Write and agree this before coding `engine.py` and `state.py`.

Decides how a match is simulated: the state, the loop, possession, the clock and the end of the match.

## 1. Match state

- What does the state hold (ball position, carrier, possession team, score, period, clock, players on the pitch, fatigue, cards, substitutions used)?
- Which parts of the state are visible to the decision model, and which are internal?

_Answer:_

## 2. The loop

- What is one step of the loop: one action by the player on the ball?
- In what order are things resolved: decision → outcome → new state → events emitted?

_Answer:_

## 3. Possession

- What starts a possession (kickoff, regain, set piece) and what ends it (turnover, shot, out of play, foul)?
- What triggers a change of possession, and how is the new carrier chosen?
- How are possession ids assigned?

_Answer:_

## 4. Clock and periods

- How much time does each action type take (a distribution per action)?
- How much stoppage time is added, and what drives it (goals, subs, cards, injuries)?
- When does a period end exactly (e.g. not in the middle of an attack)?
- Are extra time and penalties in scope?

_Answer:_

## 5. Pressure

- When is a player under pressure? How many opponents, and how close?
- How does pressure feed into decisions and outcomes?

_Answer:_

## 6. Fatigue and form

- How does stamina drain over a match, and how does it affect attributes?
- Does recent form or the score (e.g. a team chasing the game) change behaviour?

_Answer:_

## 7. Randomness and seeds

- Which random generator is used, and how is it seeded so the same seed gives the same match?
- Do the generator and the movement model share one random stream or use separate ones?

_Answer:_

## 8. Events out

- Which event types are emitted for each action (see CONTRACTS.md §3)?
- Which qualifiers are emitted, and when?

_Answer:_
