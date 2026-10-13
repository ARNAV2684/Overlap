# Screen relay spec

> **Status: not started.** Write and agree this before coding `screen_relay.py`.

Decides how raw events reach browsers in under a second.

## 1. Input

- Which hubs and consumer group, and what batch size?

_Answer:_

## 2. Trimming

- Which event fields are kept for the browser?

_Answer:_

## 3. Bundling

- How are 5 Hz tracking frames bundled to about one message per second?

_Answer:_

## 4. Delivery

- Which Web PubSub group, and in which envelope (CONTRACTS.md §7)?

_Answer:_

## 5. Scaling

- Plan, warm instances, and how ordering is kept per match.

_Answer:_
