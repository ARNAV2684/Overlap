# PLAN_mock_live-feed — temporary mock of the generator's live output

| Field | Complete this |
|---|---|
| Change | Add `mock/`: a temporary, seeded mock that streams `CONTRACTS.md` v0 setup, events and 5 Hz tracking to Event Hubs (emulator or Azure), a local Web PubSub stand-in, stdout and recorded files |
| Why | The Event Hubs layer and the web app need live data before the generator is ready |
| Author / owner | Arnav |
| Status | Done (merged in PR #4) |
| Reviewed commit | main · f49c20b |
| Branch | `mock/live-feed` |
| Governing spec | `CONTRACTS.md` v0 §1–§4 and §7 (merged). `generator/specs/live-and-batch.md` is not agreed yet, so the mock's choices for things it doesn't settle are marked provisional in `mock/README.md`. |

**Files (the only files that may change):**

| File | Add / modify | What changes |
|---|---|---|
| `mock/README.md` | Add | Temporary notice, setup, usage for the Event Hubs layer and the web app, provisional choices, limits |
| `mock/pyproject.toml` | Add | Python 3.12 + uv project; dependencies `aiohttp`, `azure-eventhub`, `azure-identity` |
| `mock/.gitignore` | Add | Ignores `.venv/`, `recorded/`, `uv.lock` |
| `mock/overlap_mock/*.py` | Add | World and three match setups, match engine, contract validator, timeline/pacing/envelopes, CLI |
| `mock/overlap_mock/sinks/*.py` | Add | Event Hubs producer, local Web PubSub stand-in, recorded files |
| `mock/emulator/docker-compose.yml`, `mock/emulator/Config.json` | Add | Event Hubs emulator + Azurite; hubs `match-events`, `match-tracking` (4 partitions), consumer groups `stats`, `relay`, `archiver` |
| `plans/active/PLAN_mock_live-feed.md` | Add | This plan |

- **Contracts or hot shared files touched:** None. `CONTRACTS.md` is not changed; five provisional choices it leaves
  open are listed in `mock/README.md` for the generator and consumer owners to agree. New top-level folder `mock/`
  agreed by Arnav; it is deleted once `generator/live.py` lands.
- **Conflict scan:** No overlaps found on 2026-10-14 at f49c20b. Sources checked: plans ✓ (none active) · PRs ✓
  (none open) · branches ✓ (`setup/*` fully merged) · hot files ✓ (none touched).
- **Done when:** `uv run mock validate` passes for all three matches (contract shapes, generator invariants, same seed
  gives the same match), and the Web PubSub stand-in and stdout stream deliver every match in order.
- **Risk:** teams build against mock quirks or the provisional choices instead of `CONTRACTS.md`; the mock is not
  calibrated.
- **Handover:**
  - **Checked:** `uv run mock validate` → OK for `SYN-9001`, `SYN-9002`, `SYN-9003` (deterministic). Web PubSub
    stand-in tested with a WebSocket client on `json.webpubsub.azure.v1`: connect, `joinGroup` ack, in-order
    `status` / `event` / `positions` envelopes (5 frames × 22 players), snapshot and matches endpoints. All three
    matches streamed together at 300× to stdout with no out-of-order `seq`. Event coordinates match tracked player
    positions (median error ≤ 1 m for most event types).
  - **Not checked:** sending to the Event Hubs emulator or Azure (needs the emulator licence accepted and its images
    pulled); Microsoft's `@azure/web-pubsub-client` SDK against the stand-in.
  - **Provisional, to agree:** setup on `match-events` with `kind=setup`; `positions` envelope shape; `status`
    envelope shape; snapshot response and recorded-file layout; `Carry` timestamped when the carry ends.
  - **Known limits:** not calibrated; no stats panels, overlays, player tags or recaps; `SYN-9003` has no cards.
