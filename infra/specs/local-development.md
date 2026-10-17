# Local development spec

> **Status: draft for review.** Plan: [`PLAN_functions_screen-relay`](../../plans/active/PLAN_functions_screen-relay.md).
> Set this line to `> **Status: agreed.**` in the PR that approves it.

Everything is built and tested locally first, against local replacements for each Azure service, and treated as the
real environment. Moving to Azure changes **settings only**: endpoints and how services sign in. Code, message shapes
and tests stay the same.

## 1. Local replacement for each Azure service

| Azure service | Local replacement | Port | Notes |
|---|---|---|---|
| Event Hubs | Microsoft Event Hubs emulator (Docker) | 5672 (AMQP), 5300 (health) | Hubs and consumer groups from `infra/local/eventhubs-config.json` |
| Storage (Functions checkpoints, archived tracking) | Azurite (Docker) | 10000–10002 | Also used by the Event Hubs emulator; Blob container `tracking` |
| Cosmos DB | Microsoft Cosmos DB emulator, Linux (Docker) | 8081 | Check before relying on it: create, upsert, query by partition key, ETag conditions |
| Azure Functions | Functions Core Tools (`func start`) | 7071 | If its Event Hubs trigger can't use the emulator, `functions/relay_runner.py` runs the same core |
| Web PubSub | `infra/local/webpubsub_standin/` (ours; Microsoft has no emulator), run on the host with `uv run standin` | 8787 | Same service send API, `/negotiate` and browser protocol `json.webpubsub.azure.v1` |
| Microsoft Foundry | No local replacement | — | The insight flow uses real Azure models from the start |

Microsoft's emulators each need their licence accepted once per developer (`ACCEPT_EULA=Y`), and Docker Desktop.

## 2. Hubs and consumer groups

| Hub | Partitions | Consumer groups |
|---|---|---|
| `match-events` | 4 | `$Default`, `relay`, `stats`, `archiver` |
| `match-tracking` | 4 | `$Default`, `relay`, `stats`, `archiver` |

The same names are used on Azure. `$Default` is for ad-hoc reading and tests; each service uses its own group.

## 3. The Web PubSub stand-in

| Endpoint | Behaves like |
|---|---|
| `POST /api/hubs/live/groups/<group>/:send` | Web PubSub service API "send to group" (what the relay calls through the SDK) |
| `GET /negotiate?groups=match-<id>` | Returns `{ baseUrl, url, token }`, like the web app's negotiate route on Azure |
| `ws://localhost:8787/client/hubs/live` | Browser connection with `json.webpubsub.azure.v1`: `connected`, `joinGroup`/`ack`, group messages |
| `GET /api/match/<id>/snapshot` | `CONTRACTS.md` §7.3, read from the same Cosmos store the relay writes |

It runs on the host (not in Docker), accepts any token locally and binds to `127.0.0.1` only. No plain-socket mode.

## 4. Settings: local vs Azure

| Setting | Local | Azure |
|---|---|---|
| `OVERLAP_EVENTHUBS_NAMESPACE` / connection | Emulator's documented local connection string | `<name>.servicebus.windows.net`, managed identity |
| `OVERLAP_EVENTS_HUB`, `OVERLAP_TRACKING_HUB` | `match-events`, `match-tracking` | Same |
| `OVERLAP_WEBPUBSUB_ENDPOINT`, hub | `http://localhost:8787`, `live` | `https://<name>.webpubsub.azure.com`, `live`, managed identity |
| `OVERLAP_COSMOS_ENDPOINT`, database, container | Emulator endpoint, `live`, `screen` | `https://<name>.documents.azure.com`, `live`, `screen`, managed identity |
| Archive: Cosmos containers | `matches`, `events`, `stats` in `live` (created by the archiver) | Same, created by Bicep |
| `OVERLAP_ARCHIVE_STORAGE` / `OVERLAP_ARCHIVE_BLOB_ENDPOINT` | Azurite (`UseDevelopmentStorage=true`) | `https://<name>.blob.core.windows.net`, managed identity |
| `OVERLAP_ARCHIVER_CONSUMER_GROUP` | `archiver` | Same |
| `AzureWebJobsStorage` | Azurite | Storage account, managed identity |
| Negotiate URL used by the browser | `http://localhost:8787/negotiate` | Web app's `/api/negotiate` |

Local values live in `infra/local/.env.local` (created from `.env.local.example`, never committed). The emulators'
local keys are Microsoft's public, documented values, not secrets; Azure never uses keys.

## 5. Run order

1. `ACCEPT_EULA=Y docker compose up -d` in `infra/local/` (the three emulators); wait for the health checks.
2. Start the Web PubSub stand-in on the host: `uv run standin` in `infra/local/webpubsub_standin/`.
3. Start the relay: `func start` in `functions/` (or `relay_runner.py`). `func start` also runs the archiver;
   without it, run `uv run python main.py` in `archiver/`.
4. Open the screen: Vedant's app or, until it exists, `mock/single-match-demo/` on 8788 (moved to the protocol).
5. Send a match: `uv run python cli.py live --hubs emulator --speed 20` in `generator/`. Add `--record` to keep a
   copy for `archiver/tests/check_archive.py`.
6. Stop: `docker compose down` and Ctrl+C the stand-in, relay and archiver (data is cleared; every run starts clean).

## 6. What local testing does not prove

Checked only on Azure (sprint S4): managed-identity roles, Web PubSub limits and billing, Flex Consumption scaling and
cold starts, and differences between the emulators and the real services.
