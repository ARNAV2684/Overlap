# mock/ — TEMPORARY

> **Stand-in for the generator's live output. Delete this whole folder once `generator/live.py` produces real
> synthetic matches.** Nothing outside `mock/` imports it.

It plays invented matches and sends exactly the message shapes in [`CONTRACTS.md`](../CONTRACTS.md) v0, so the
Event Hubs layer and the web app can be built and tested before the real generator exists. When the generator is
ready, point the same consumers at it and remove this folder.

It is **not** the generator: a simple seeded simulation, not calibrated against [`CALIBRATION.md`](../CALIBRATION.md).
Don't tune stats or agents to its numbers.

## The matches

| Match | Home | Away | Storyline | What happens |
|---|---|---|---|---|
| `SYN-9001` | Northbridge FC (4-3-3, high press) | Harbour Athletic (5-3-2, deep and direct) | `late_pressure_surge` | Home press and shot rate rise after 55' |
| `SYN-9002` | Ironvale City (4-2-3-1) | Saltmarsh Wanderers (4-4-2) | `red_card` | An away player is sent off in the 28'–42' window |
| `SYN-9003` | Larkspur Rangers (3-4-3, wide) | Greywater Albion (4-1-4-1) | `comeback` | Away team leads; home team comes back in the second half |

Each team has 11 starters (goalkeeper first) and 7 substitutes; all clubs, players and venues are invented. Each
match has about 2,000 events and about 29,000 tracking frames (5 Hz, 22 players), with substitutions, corners, free
kicks and at least one penalty. `SYN-9001` and `SYN-9002` contain all 18 event types; `SYN-9003` happens to have no
cards. The same seed always produces the same match.

## Setup

Python 3.12 and [uv](https://docs.astral.sh/uv/). From this folder:

```bash
uv sync
uv run mock list
uv run mock validate
```

`validate` plays every match twice and checks every message against `CONTRACTS.md` (fields, IDs, enums,
coordinates) and the generator invariants: score = goal shots, `seq` strictly increasing, no events after full
time, successful passes go to a teammate, nobody acts after a red card, key-pass links are exact, tracking is
5 Hz with realistic speeds, and the same seed gives the same match.

## For the Event Hubs layer

The producer sends what the generator's live mode will send:

| Hub | Messages | Partition key | Properties |
|---|---|---|---|
| `match-events` | the setup (once, first), then every event in `seq` order | `match_id` | `kind` = `setup` / `event`, `match_id` |
| `match-tracking` | every 5 Hz tracking frame (pitch frame) | `match_id` | `kind` = `tracking`, `match_id` |

Bodies are the JSON objects from `CONTRACTS.md` §2–§4, `content_type: application/json`.

**Local, no Azure (Event Hubs emulator in Docker):**

1. Read Microsoft's emulator licence terms (linked in [`emulator/docker-compose.yml`](emulator/docker-compose.yml));
   the emulator only starts once you accept them.
2. Start it (PowerShell):

   ```powershell
   cd emulator
   $env:ACCEPT_EULA = "Y"
   docker compose up -d
   ```

   This creates `match-events` and `match-tracking` with 4 partitions each, plus consumer groups `stats`,
   `relay` and `archiver` (and `$Default`).
3. Stream into it and read it back:

   ```bash
   uv run mock play --match all --speed 5 --hubs emulator
   uv run mock tail --hubs emulator --seconds 20
   ```

   The emulator uses Microsoft's fixed local connection string (in `overlap_mock/sinks/eventhubs.py`). It only
   works against localhost and is not a secret.

**Real Azure:** `az login`, then

```bash
uv run mock play --match all --speed 5 --hubs azure --namespace <name>.servicebus.windows.net
```

This signs in with your Azure identity (`DefaultAzureCredential`), so no keys are stored. Your identity needs the
*Azure Event Hubs Data Sender* role on the namespace (and *Data Receiver* for `tail`).

## For the web app

```bash
uv run mock play --match all --speed 1 --web --loop
```

This serves a local stand-in for Azure Web PubSub (hub `live`) on `http://localhost:8787`:

| Endpoint | What it does |
|---|---|
| `GET /negotiate?groups=match-SYN-9001` | Returns `{ baseUrl, url, token }`, the shape the Web PubSub service SDK returns |
| `ws://localhost:8787/client/hubs/live` | WebSocket speaking Web PubSub's `json.webpubsub.azure.v1` (and `json.reliable.webpubsub.azure.v1`) client protocol |
| `GET /api/match/{id}/snapshot` | Setup, current status and every envelope so far (events and status, plus the latest positions), for catch-up |
| `GET /mock/matches` | Which matches are playing, their phase, score and clock |

Browser code written for the real service works unchanged: connect with the subprotocol, send
`{"type":"joinGroup","group":"match-SYN-9001","ackId":1}`, and receive
`{"type":"message","from":"group","group":"match-SYN-9001","dataType":"json","data":<envelope>}`. Later, only the
negotiate URL changes. A plain WebSocket with no subprotocol also works: add `?groups=match-SYN-9001` to the URL and
you receive raw envelopes.

Envelopes follow `CONTRACTS.md` §7 (`seq`, `kind`, `match_id`, `match_ms`, `clock`, `data`) on group
`match-<id>`:

| `kind` | `data` |
|---|---|
| `event` | one event (§3) |
| `positions` | `{ "frames": [...] }`: the last 5 tracking frames (§4), about one message per second; tween between them |
| `status` | `{ "phase", "period", "score" }`; the first one (`phase: "pre_match"`) also carries `setup` |

`--loop` starts a new match when one ends (new match ID, +100 per run, and a new seed), so a dev server always has
something live. The audience (`match-<id>-<mode>-<lang>`) and player groups stay silent because there are no agents
here, so no `overlay`, `player_tag`, `stats` or `recap` envelopes.

## Recorded files

```bash
uv run mock record            # → recorded/<match_id>/  (about 13 MB per match; gitignored)
```

| File | Contents |
|---|---|
| `setup.json` | the match setup |
| `events.ndjson` | one event per line |
| `tracking.ndjson.gz` | one tracking frame per line, gzipped |
| `envelopes.ndjson.gz` | everything a browser would receive, in order, gzipped |

## Other options

```text
uv run mock play --help
  --match ID|all     one match or all three at once (default all)
  --speed N          match seconds per real second (1, 5, 20 ...)
  --hubs off|emulator|azure
  --web [--port 8787]
  --stdout events|all  also print raw messages as NDJSON
  --loop             keep playing new matches
  --pre-kickoff-s / --halftime-s / --linger-s
```

## Provisional choices to agree with the generator

`CONTRACTS.md` doesn't settle these yet. The mock picks one and the real pipeline should agree or change them:

1. **The setup travels on `match-events`**, first, with property `kind=setup`.
2. **Positions envelope shape:** `data.frames` holding 5 frames.
3. **Status envelope shape**, including the setup in the `pre_match` status.
4. **Snapshot response shape** and the recorded-file layout above.
5. **`Carry` is timestamped when the carry ends** (with its start in `x`/`y`), so `seq` order and time order agree.

## Known limits

- Not calibrated: goals, shots, fouls and distance covered are roughly realistic but vary a lot between matches.
- No stats panels, overlays, player tags or recaps: those come from the stats engine and agents.
- Only invented clubs and players.
