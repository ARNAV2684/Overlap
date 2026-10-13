# Storage spec

> **Status: not started.** Write and agree this before coding `event_store.py` and `tracking_chunks.py`.

Decides how every event and tracking frame is kept for replays.

## 1. Events

- Where are events stored (Cosmos `events`), with which partition key and id?

_Answer:_

## 2. Tracking

- What is the per-minute chunk format and compression, and where in Blob Storage does it live?

_Answer:_

## 3. Replay files

- What does the replay API read, and in what order?

_Answer:_

## 4. Retention

- How long is data kept, and how is it cleaned up after judging?

_Answer:_
