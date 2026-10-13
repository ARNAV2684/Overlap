# Real-time data spec

> **Status: not started.** Write and agree this before coding `src/lib/*` and `src/app/api/*`.

Decides how messages reach the screen and stay in order.

## 1. Connection

- Negotiate flow, groups joined per preference, reconnects.

_Answer:_

## 2. Store

- Store shape and how each envelope kind updates it; seq dedupe.

_Answer:_

## 3. Catch-up

- Snapshot on join, then live; stale-connection fallback to the snapshot API.

_Answer:_

## 4. Overlay scheduler

- Timing by `show_at_ms`, priority and how pile-ups are avoided.

_Answer:_

## 5. Replay

- How replay files drive the same store at 1×, 5× and 20×.

_Answer:_
