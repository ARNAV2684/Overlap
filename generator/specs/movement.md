# Movement spec

> **Status: not started.** Write and agree this before coding `movement.py`.

Decides where every player and the ball are, five times a second, and how speed and distance are measured.

## 1. Shape

- What are the formation anchor positions for each formation?
- How does the shape shift with the ball's position and with possession (compact, wide, high line)?

_Answer:_

## 2. Motion

- How does a player move towards a target: acceleration, deceleration and top speed per attribute?
- How much noise is added, and how is it kept small enough that speeds stay realistic?
- How does the ball move between events (straight line, arc, speed)?

_Answer:_

## 3. Linking to events

- How do tracking positions stay consistent with event coordinates (team frame → pitch frame)?

_Answer:_

## 4. Measurements

- What counts as a sprint (threshold and minimum duration)?
- How is distance covered measured, and what are typical totals per position?
- What triggers a player tag (e.g. top speed above a threshold)?

_Answer:_

## 5. Output

- What is the frame rate, and which frames are emitted (see CONTRACTS.md §4)?

_Answer:_
