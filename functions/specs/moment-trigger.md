# Moment trigger spec

> **Status: not started.** Write and agree this before coding `moment_trigger.py`.

Decides how a new moment starts the agent workflow.

## 1. Trigger

- Change feed or queue? What poll delay, and how is latency kept low?

_Answer:_

## 2. Exactly once

- How do we avoid starting the workflow twice for one moment?

_Answer:_

## 3. Retries

- What happens when the workflow fails: retry, mark pending, or drop?

_Answer:_
