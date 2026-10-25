# Azure resources spec

> **Status: draft for review.** Plan: [`PLAN_infra_azure-pass`](../../plans/active/PLAN_infra_azure-pass.md) (A0).
> Set this line to `> **Status: agreed.**` in the PR that approves it. No `.bicep` file is written before then.

Decides every Azure resource, its tier and its settings. Moving from the local stack changes settings only
([`local-development.md`](local-development.md) §4); this spec is the Azure side of that table.

## 1. Region and naming

- Which region (model availability), resource group and naming pattern?

_Answer:_

- **Region:** **Sweden Central** (`swedencentral`) for every resource (Arnav, 23 Oct), set once as the Bicep
  parameter `location`. Chosen over Central India for model availability (GPT-5 mini listed for Global Standard and
  the EU Data Zone) and closeness to the judges; the cost is ~130–150 ms extra latency when testing from India.
  Service availability and model quota are confirmed with `az` before the first deployment.
- **Resource group:** `rg-overlap`, one per `azd` environment (environment name `overlap`).
- **Names:** `<abbreviation>-overlap-<token>`, where `<token>` is `uniqueString(subscription().id, resourceGroup().id)`
  cut to 6 characters, for names that must be globally unique. Storage and registry names drop the hyphens.

| Resource | Abbreviation | Example |
|---|---|---|
| Event Hubs namespace | `evhns` | `evhns-overlap-a1b2c3` |
| Cosmos DB account | `cosmos` | `cosmos-overlap-a1b2c3` |
| Web PubSub | `wps` | `wps-overlap-a1b2c3` |
| Storage account | `st` | `stoverlapa1b2c3` |
| App Service plan / Function app | `asp` / `func` | `func-overlap-a1b2c3` |
| Container Apps environment / app / job | `cae` / `ca` / `caj` | `ca-overlap-web`, `ca-overlap-stats`, `caj-overlap-generator` |
| Container registry | `cr` | `croverlapa1b2c3` |
| Log Analytics / Application Insights | `log` / `appi` | `log-overlap-a1b2c3` |
| Managed identity | `id` | `id-overlap-functions` |
| Foundry (AI Services) / Translator | `aif` / `trsl` | `aif-overlap-a1b2c3` |

- **Tags on every resource:** `azd-env-name`, `project: overlap`.

## 2. Per resource

- For each resource: SKU or tier, capacity, and the key settings (partitions, consumer groups, containers, hubs, scale rules).

_Answer:_

Every resource that supports it has **local (key) authentication turned off**; services sign in with managed identity
([`security.md`](security.md)).

### 2.1 Event Hubs

| Setting | Value |
|---|---|
| Tier | Standard, 1 throughput unit, auto-inflate off (Basic allows only `$Default`, and each reader needs its own group) |
| Hubs | `match-events`, `match-tracking`: 4 partitions each, retention 1 day (replays come from the archive, never from Event Hubs) |
| Consumer groups | On both hubs: `$Default` (ad-hoc reading), `relay`, `stats`, `archiver`, as [`local-development.md`](local-development.md) §2 |
| Other | Minimum TLS 1.2, local auth off, public network access on (no private networking in this project) |

### 2.2 Storage account

| Setting | Value |
|---|---|
| Kind and SKU | StorageV2, Standard LRS |
| Access | Shared-key access off, blob public access off, minimum TLS 1.2 |
| Blob containers | `tracking` (archived tracking chunks, `archiver/specs/storage.md`), `stats-checkpoints` (stats engine reading positions). The Functions host creates its own containers (`azure-webjobs-*`) for triggers, timers and Event Hubs checkpoints |

### 2.3 Cosmos DB

| Setting | Value |
|---|---|
| API and capacity | NoSQL, provisioned throughput, **free tier on** (one free-tier account per subscription; if already used, serverless instead) |
| Database | `live`, shared throughput (manual): 1,000 RU/s, the free-tier allowance, except during live runs, which need 4,000 (`COSMOS_THROUGHPUT`; 1,000 throttled a 20× match on 24 Oct) |
| Containers | `screen`, `matches`, `events`, `stats`, `match_state`, `moments`, `overlays` on `/match_id` (`CONTRACTS.md` §4); `leases` on `/id` (the Functions change-feed triggers' lease container). All created by Bicep: with identity, the services cannot create them |
| Other | Session consistency, single region, local auth off, periodic backup (default) |

### 2.4 Web PubSub

| Setting | Value |
|---|---|
| Tier | Standard S1, 1 unit, from the first deployment (Free allows 20 connections and 20,000 outbound messages a day with no overage, and moving Free → Standard later takes 30–60 minutes of downtime while the IP changes) |
| Hub | `live`; no event handlers (browsers only receive; the relay and insights publisher send through the service API) |
| Other | Local auth off; client tokens come from the web app's `/api/negotiate` |

### 2.5 Functions apps (relay; archiver, moment trigger, recap trigger, insights publisher)

| Setting | Value |
|---|---|
| Hosting | Dedicated App Service plan, Linux, **B3, exactly 1 instance, Always On**, with **two apps** from the same package: `live` runs the three relay functions, `insights` the archiver and the agents (each switches the other's off). The relay's open frame bundles and `seq` live in memory, so the relay stays in one process; the agents' model breaker likewise stays in the insights process. One process for everything held the relay to one core and it fell 80–120 s behind a 20× match (24 Oct). Flex Consumption scales each trigger on its own instances and is not used |
| Runtime | Functions 4, Python 3.12; code deployed from `functions/dist/` built by `functions/package.py`, with its packages installed for Linux and compiled beforehand, and run from the zip (`WEBSITE_RUN_FROM_PACKAGE=1`; `infra/README.md`) |
| Settings (names only) | `AzureWebJobsStorage__accountName`, `AzureWebJobsStorage__credential=managedidentity`, `AzureWebJobsStorage__clientId`; `EVENTHUBS__fullyQualifiedNamespace`, `EVENTHUBS__credential`, `EVENTHUBS__clientId`; `COSMOS__accountEndpoint`, `COSMOS__credential`, `COSMOS__clientId`; `AZURE_CLIENT_ID`; `OVERLAP_EVENTS_HUB`, `OVERLAP_TRACKING_HUB`, `OVERLAP_RELAY_CONSUMER_GROUP`, `OVERLAP_ARCHIVER_CONSUMER_GROUP`; `OVERLAP_COSMOS_ENDPOINT`, `OVERLAP_COSMOS_DATABASE`, `OVERLAP_COSMOS_CONTAINER`; `OVERLAP_ARCHIVE_BLOB_ENDPOINT`; `OVERLAP_WEBPUBSUB_ENDPOINT`, `OVERLAP_WEBPUBSUB_HUB`; `OVERLAP_MODEL_PROVIDER=azure`, `OVERLAP_AZURE_OPENAI_ENDPOINT`, `OVERLAP_AZURE_OPENAI_DEPLOYMENT`, `OVERLAP_AZURE_OPENAI_API_VERSION`; `OVERLAP_TRANSLATOR=azure`, `OVERLAP_TRANSLATOR_ENDPOINT`, `OVERLAP_TRANSLATOR_REGION`; the agents' budget settings (`OVERLAP_MAX_*`); `APPLICATIONINSIGHTS_CONNECTION_STRING` |
| Other | No HTTP functions; basic-auth publishing (FTP/SCM) off; deployment by `azd` with Entra sign-in |

If the plan size proves too small for the agents (CPU or memory in A6), it moves up one size (P0v3), still 1 instance.

### 2.6 Container Apps

| Setting | Value |
|---|---|
| Environment | Consumption only, logs to the Log Analytics workspace (§2.8) |
| Stats engine (`ca-overlap-stats`) | 0.5 vCPU, 1 GiB, min = max = 1 replica (one reader per consumer group), no ingress; `uv run python main.py live` |
| Web app (`ca-overlap-web`) | 0.5 vCPU, 1 GiB, 1–3 replicas, HTTP scale rule, external ingress (HTTPS only, port 3000); Next.js production server |
| Generator (`caj-overlap-generator`) | Container Apps **job**, manual trigger, 0.5 vCPU, 1 GiB, parallelism 1, no retries, replica timeout 30 minutes; runs `cli.py live --hubs azure --speed <setting>` with a new match number per run |
| Images | From the registry (§2.7), pulled with each app's managed identity; container files in `infra/containers/` |

### 2.7 Container registry

Basic, admin user off, images pulled by managed identity (`AcrPull`).

### 2.8 Monitoring

| Setting | Value |
|---|---|
| Log Analytics | Pay-as-you-go, retention 30 days, **daily cap 0.5 GB** |
| Application Insights | Workspace-based, for the Functions app; adaptive sampling on |

### 2.9 Microsoft Foundry (model)

| Setting | Value |
|---|---|
| Resource | AI Services account with a custom subdomain (needed for Entra sign-in) and a Foundry project |
| Deployment | GPT-5 mini, or the closest current mini model if it is retiring (checked at deployment), Global Standard, small capacity (about 10K tokens per minute) |
| Other | Local auth off. The model is only called by the Functions app; spending is capped in code by the agents' budget settings and watched by the budget in [`costs.md`](costs.md) |

Free Trial subscriptions have no model quota; the model can only be deployed after the subscription is upgraded to
pay-as-you-go ([`costs.md`](costs.md) §2).

### 2.10 Azure AI Translator

Text Translation, **F0** (free, 2 million characters a month), custom subdomain (needed for Entra sign-in), local auth
off.

### 2.11 Key Vault

**Not deployed (Arnav, 23 Oct, D-11).** Nothing in Overlap is secret: every service signs in with identity, so
`key-vault.bicep` stays a placeholder.

## 3. Environments

- Do we need separate dev and demo environments?

_Answer:_

No. One `azd` environment (`overlap`) and one resource group serve development and judging. The laptop stack
([`local-development.md`](local-development.md)) stays the development environment; Azure is changed only by `azd`
from this repository. After judging (10 Nov) the whole resource group is deleted ([`costs.md`](costs.md) §3).
