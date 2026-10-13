# Archiver

Reads every event and tracking frame and stores it permanently, so replays never depend on Event Hubs retention.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/storage.md`](specs/storage.md) | Where events are stored and how they're keyed, the per-minute tracking chunk format, what the replay API reads, retention | every file here |

## Files

| File | Job |
|---|---|
| `consumer.py` | Reads every event and tracking frame |
| `event_store.py` | Saves events permanently |
| `tracking_chunks.py` | Compressed per-minute tracking chunks in Blob Storage |
| `main.py` | Runs the service |
