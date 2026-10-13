# Actions and outcomes spec

> **Status: not started.** Write and agree this before coding `decisions.py` and `outcomes.py`.

Decides what the player on the ball does next, and whether it works. This is where the numbers get tuned.

## 1. Action set

- Which actions can the player on the ball take (short pass, long pass, through ball, cross, switch, carry, take-on, shot, clearance, hold)?
- Which off-ball actions exist (pressure, tackle, interception, aerial duel, ball recovery)?

_Answer:_

## 2. Choosing an action

- What are the base probabilities of each action, by pitch zone?
- How do player attributes, position, team style, score and pressure shift those probabilities?
- How is the target of a pass chosen (nearest, most open, most progressive)?

_Answer:_

## 3. Resolving an outcome

- What is the base success rate of each action (cite public averages in CALIBRATION.md)?
- How do length, pressure, skill, fatigue and the defender's attributes change it?
- What happens on failure: who gets the ball, and where?

_Answer:_

## 4. Shots

- How are shot location, body part and situation chosen?
- How is the outcome decided (goal, saved, missed, blocked, woodwork), and how does it relate to xG?
- How are shot speed and goal-mouth position generated?

_Answer:_

## 5. Speeds and distances

- How are ball speed and pass distance generated per action?

_Answer:_

## 6. Calibration

- Which per-match totals must land in range (passes, completion, shots, goals, fouls, cards)?
- Which knobs do we turn when a total is out of range?

_Answer:_
