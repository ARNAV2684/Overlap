# Archiver

Reads every event and tracking frame and stores it permanently, so replays never depend on Event Hubs retention.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/storage.md`](specs/storage.md) | Where events are stored and how they're keyed, the per-minute tracking chunk format, what the replay API reads, retention | every file here |

## Files

| File | Job |
|---|---|
| `consumer.py` | The core: checks each message and sends setups, events, stats panels and frames to the stores |
| `event_store.py` | Cosmos containers `matches`, `events`, `stats` (write and read back) |
| `tracking_chunks.py` | Per-minute tracking files in Blob Storage, committed after every batch |
| `reader.py` | Reads a whole archived match back (`uv run python reader.py SYN-0505`) |
| `main.py` | Local runner (Event Hubs SDK). On Azure the same core runs as `archive_events` / `archive_tracking` in `functions/function_app.py` |
| `tests/test_archiver.py` | Unit tests; the storage tests run when Azurite and the Cosmos emulator are up |
| `tests/check_archive.py` | Round trip: an archived match must read back identical to the generator's recording |

## Run locally

With the local stack up (`infra/specs/local-development.md` §5) and settings from `infra/local/env.example` loaded:

```bash
uv run python main.py                              # consumer group `archiver` on both hubs
uv run python tests/check_archive.py SYN-0505      # after a recorded match (`cli.py live --record`)
uv run pytest
```
