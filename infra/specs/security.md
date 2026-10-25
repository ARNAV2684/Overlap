# Security spec

> **Status: draft for review.** Plan: [`PLAN_infra_azure-pass`](../../plans/active/PLAN_infra_azure-pass.md) (A0).
> Set this line to `> **Status: agreed.**` in the PR that approves it. Governs `identity.bicep` and `key-vault.bicep`.

Decides identities, secrets and network access. The repository is public, so nothing secret may ever be in it.

## 1. Identities

- Which managed identity does each service use, and which roles does it get?

_Answer:_

One **user-assigned managed identity per workload**, created in `identity.bicep`, so each workload's access is one
readable row. Every role is scoped to the narrowest resource that works. Each workload finds its identity through
`AZURE_CLIENT_ID` (and the `__clientId` settings of the Functions bindings); code signs in with
`DefaultAzureCredential`, which it already does.

| Identity | Used by | Roles (scope) |
|---|---|---|
| `id-overlap-functions` | Functions app: relay, archiver, moment trigger, recap trigger, insights publisher; the MCP server it starts | Azure Event Hubs Data Receiver (each hub) · Storage Blob Data Owner (storage account: Functions host) · Storage Blob Data Contributor (`tracking`) · Cosmos DB Built-in Data Contributor (database `live`) · Web PubSub Service Owner (Web PubSub) · Cognitive Services OpenAI User (Foundry) · Cognitive Services User (Translator) |
| `id-overlap-stats` | Stats engine | Azure Event Hubs Data Receiver (each hub) · Azure Event Hubs Data Sender (`match-events`, for stat panels) · Storage Blob Data Contributor (`stats-checkpoints`) · Cosmos DB Built-in Data Contributor (database `live`) · AcrPull (registry) |
| `id-overlap-generator` | Generator job | Azure Event Hubs Data Sender (each hub) · AcrPull (registry) |
| `id-overlap-web` | Web app | Cosmos DB Built-in Data Reader (database `live`) · Storage Blob Data Reader (`tracking`) · Web PubSub Service Owner (Web PubSub; needed to make client tokens) · starting the generator job only (a custom role with `Microsoft.App/jobs/start/action` on that job) · AcrPull (registry) |
| Developers | Arnav, and anyone Arnav names, from their own Entra sign-in | Contributor on the resource group (to deploy) and the data roles above at resource-group scope (to run laptop services against Azure). Cosmos data roles are assigned per person; no keys are shared |

Cosmos data roles are Cosmos's own SQL role assignments (`Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments`),
not Azure RBAC; Bicep creates both kinds.

## 2. Secrets

- What, if anything, lives in Key Vault?

_Answer:_

**Nothing is secret.** Every connection is managed identity:

- Local (key) authentication is **off** on Event Hubs, Cosmos DB, Web PubSub, the AI Services (Foundry) account and
  Translator; shared-key access is **off** on the storage account.
- No connection strings, keys or passwords exist in the repository, in app settings or in `azd` environment files.
  Settings hold only endpoints and identity client ids, which are not secrets.
- The local emulators' keys in `infra/local/` and `functions/local.settings.example.json` are Microsoft's public,
  documented values; they never work against Azure.
- Key Vault: **not deployed** (Arnav, 23 Oct, D-11), see [`resources.md`](resources.md) §2.11.

## 3. Public endpoints

- Which endpoints are public, and how is `/api/start-match` rate-limited?

_Answer:_

| Endpoint | Public? | Protection |
|---|---|---|
| Web app (`ca-overlap-web`) | **Yes**, the judges' link, HTTPS only | The only public entry point. No login (the rules require a free, open test link) |
| `/api/negotiate` | Yes (through the web app) | Gives a client URL that is **receive-only**, valid for 10 minutes, and can join only the groups asked for (at most 4, all of one match): `web/src/lib/server/pubsub-token.ts` |
| `/api/start-match` | Yes (through the web app) | **One running match at a time across the whole site**: the route asks Azure whether a generator job execution is running and answers `429` if one is. On top of that, **3 starts per hour per client IP** (per replica, in memory). The route only starts the existing job with its fixed settings; nothing from the request is passed to the job |
| Other web routes (snapshot, insights, replay, matches) | Yes (read-only) | Validate `match_id` (`isMatchId`); read-only identity |
| Functions app | No HTTP functions | Triggers only (Event Hubs, Cosmos change feed, timers). Basic-auth publishing off |
| Event Hubs, Cosmos DB, Web PubSub service API, Storage, Foundry, Translator | Reachable on their Azure endpoints | Entra sign-in only (local auth off), roles as §1. No private networking in this project |
| Stats engine, generator job | No ingress | — |

Data: everything is synthetic (`CALIBRATION.md`); there are no user accounts, and no personal data is collected or
stored (viewer preferences stay in the browser).

## Local release proposal: shared start admission
Web receives Blob Data Contributor on the dedicated `match-control` container only. Tracking/replay stays
read-only. This additional role is defined locally, not applied by the patch. All replicas share the same blob
lease and durable reservations; IP-derived visitor hashes are best-effort identifiers, backed by a global cap.
Cross-site starts are rejected; missing permissions and uncertain ARM outcomes fail closed. Public start availability
requires explicit OVERLAP_LIVE_ENABLED=true. This does not add public authentication or a guarantee against denial
of service: a public visitor can consume the shared start allowance. Review before unattended public use.
