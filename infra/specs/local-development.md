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
| Azure Functions | Functions Core Tools 4 (`func start` in `functions/dist/`, built by `functions/package.py`) | 7071 | Runs the relay, archiver and insights against the emulators (checked 23 Oct). Without Core Tools, `relay_runner.py`, the archiver's `main.py` and the insights poller run the same code |
| Web PubSub | `infra/local/webpubsub_standin/` (ours; Microsoft has no emulator), run on the host with `uv run standin` | 8787 | Same service send API, `/negotiate` and browser protocol `json.webpubsub.azure.v1` |
| Microsoft Foundry (models) | Foundry Local: Microsoft's on-device runtime with an OpenAI-compatible endpoint (`OVERLAP_MODEL_PROVIDER=local`) | shown by `foundry server status` | Small model for plumbing only; prompt quality is judged on the Azure model after the switch (`agents/specs/agents.md` §8). Licence and download need Arnav's approval |
| Azure AI Translator | Local fake (`OVERLAP_TRANSLATOR=fake`): returns the English text marked with the language | — | Proves plumbing, not translation |

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
| `AzureWebJobsStorage` | Azurite | Storage account, managed identity (`AzureWebJobsStorage__accountName`, `__credential`, `__clientId`) |
| Functions bindings `EVENTHUBS`, `COSMOS` | Emulator connection strings (`functions/local.settings.example.json`) | `EVENTHUBS__fullyQualifiedNamespace`, `COSMOS__accountEndpoint`, each with `__credential=managedidentity` and `__clientId` |
| Model, translator | `OVERLAP_MODEL_PROVIDER=local` or `off`, `OVERLAP_TRANSLATOR=fake` | `azure` for both, with `OVERLAP_AZURE_OPENAI_*` and `OVERLAP_TRANSLATOR_ENDPOINT` / `_REGION` |
| `AZURE_CLIENT_ID` | Not set (developer sign-in or keys) | The workload's user-assigned identity ([`security.md`](security.md) §1) |
| Negotiate URL used by the browser | `http://localhost:8787/negotiate` | Web app's `/api/negotiate` |

Local values live in `infra/local/.env.local` (created from `.env.local.example`, never committed). The emulators'
local keys are Microsoft's public, documented values, not secrets; Azure never uses keys.

## 5. Run order

1. `ACCEPT_EULA=Y docker compose up -d` in `infra/local/` (the three emulators); wait for the health checks.
   Before a run, `python infra/local/check_stack.py --model` checks every service below and the local model's port.
2. Start the Web PubSub stand-in on the host: `uv run standin` in `infra/local/webpubsub_standin/`.
3. Start the relay: `func start` in `functions/dist/` (see `functions/README.md`; it also runs the archiver and step 6),
   or `relay_runner.py` (add `--from-latest` if matches streamed while it was off) and `uv run python main.py` in
   `archiver/` (`--from-latest` likewise).
4. Open the screen: Vedant's app or, until it exists, `mock/single-match-demo/` on 8788 (moved to the protocol).
5. Start the stats engine: `uv run python main.py live` in `stats/` (moments, `match_state`, stat panels).
6. Start the insights flow (skip with `func start`, which runs it): `uv run python ../functions/moment_trigger.py` in `agents/` (polls moments, runs the
   agents, the recap at full time and the publisher, which sends cards and player tags to the stand-in's audience
   groups). Model settings are in `infra/local/env.example`; provider `off` uses templates.
7. Send a match: `uv run python cli.py live --hubs emulator --speed 20` in `generator/`. Add `--record` to keep a
   copy for `archiver/tests/check_archive.py`. Each run is SYN-0001 unless `--first-match <n>` says otherwise, and a
   match id that already finished is ignored downstream as a repeat, so give every run a new number.
8. Optional: open `http://127.0.0.1:8787/insights/viewer?match=<id>&mode=casual&lang=en` to see one audience's cards
   rendered (dev page); after the match, `uv run python -m evals.live_run --match <id> --out <dir>` in `agents/`
   reports latency and outcomes. `uv run python check_delivery.py --match <id> --club <teamId> --player <playerId>` in `agents/` plays
   two viewers (one joins late through the insights snapshot).
9. Stop: `docker compose down` and Ctrl+C the stand-in, relay and archiver (data is cleared; every run starts clean).

After Docker restarts (the laptop slept or shut down), the Event Hubs emulator starts again from sequence 0 but
Azurite keeps every consumer's saved positions, so a consumer saved past the new end of a partition waits there and
reads nothing. The relay and archiver have `--from-latest`; the stats engine has no such option yet (on 23 Oct its
old positions on two partitions hid SYN-0801 and SYN-0802 until they were moved to the newest messages by hand).

## 6. What local testing does not prove

Checked only on Azure (sprint S4): managed-identity roles, Web PubSub limits and billing, Flex Consumption scaling and
cold starts, and differences between the emulators and the real services.
