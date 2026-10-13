# Agent workflow spec

> **Status: not started.** Write and agree this before coding `workflow.py` and `state.py`.

Decides how the agents hand a moment to each other, what they share, and how they recover from failure.

## 1. Chain

- What is the order of agents, and which steps run in parallel?
- What exactly does each agent receive and return (field by field)?

_Answer:_

## 2. Shared state

- How does the moment document record each agent's output and the fact-check verdict?

_Answer:_

## 3. Timing

- What is the end-to-end time budget, and the timeout for each agent?
- When is a moment too late for live and kept only for the recap?

_Answer:_

## 4. Failure recovery

- What happens when an agent times out, errors or runs out of quota?
- Which template fallbacks exist, and how are they labelled?

_Answer:_

## 5. Triggering

- How does a new moment start the workflow exactly once?

_Answer:_
