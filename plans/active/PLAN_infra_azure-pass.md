# PLAN_infra_azure-pass — run the whole local flow on Azure (sprints A0–A10)

## Proposal details

| Field | Complete this |
|---|---|
| Proposal title | Azure pass · write the three infra specs, then deploy every layer to Azure with Bicep and `azd`, managed identity only, and run the same 20× match there with settings changed only |
| Author / primary owner | Arnav |
| Collaborators and responsibilities | Pranav helps on layers 2, 4, 6 and the local stack (`plans/REGISTRY.md`). Azeem owns the generator and the stats engine, whose folders this plan touches in A7 and A10 only with his agreement. How the work is split is Arnav's call |
| Review coordinator | Arnav |
| Affected component owners | Generator, stats engine: Azeem · Event Hubs, Cosmos, Web PubSub, relay, archiver, agents, MCP: Arnav (Pranav helping) · Web app: Arnav, Azeem · Other infrastructure and `azure.yaml`: unassigned (Arnav decides) |
| Proposal version and date | v1.1 · 23 Oct 2026 (D-01, D-03, D-10 decided; A0 in progress) |
| Status | Built and proven 24 Oct: A0 (#85, #89), A1–A2 (`infra/azure-data`), Wave 1 A3–A5 (`infra/azure-wave1`), Wave 2 A6–A10 and A8 (`infra/azure-wave2`); paused after A8 with the replay link kept |
| Plan tier and file | Full · `plans/active/PLAN_infra_azure-pass.md` |
| Repository | [ARNAV2684/Overlap](https://github.com/ARNAV2684/Overlap) |
| Reviewed branch and commit | main · 0c73c59 |
| Architecture box / work area | All seven layers on Azure (Lucid "Overlap - Data Flow Diagrams", page 6, column A: A1–A8) |
| Relevant issue, spec PR, or discussion | Follows [`PLAN_agents_azure-readiness`](PLAN_agents_azure-readiness.md) (H1–H5 done). Joins the Azure milestones of [`PLAN_functions_screen-relay`](PLAN_functions_screen-relay.md) (S4, AC-09/AC-10), [`PLAN_archiver_archive-flow`](PLAN_archiver_archive-flow.md) (A3, AC-06), [`PLAN_stats_engine`](PLAN_stats_engine.md) (S4, AC-05 on Azure) and [`PLAN_web_live-home`](PLAN_web_live-home.md) §4. Supersedes the uncommitted 14 Oct draft `PLAN_infra_event-hubs.md` (its Event Hubs decisions are carried into A0) |

## 1. Purpose and intended outcome

- **Problem or need:** everything works end to end on one laptop (generator → Event Hubs → relay, archiver, stats →
  agents → web), but nothing exists on Azure. Every Bicep file, `azure.yaml` and all three infra specs are comment-only
  placeholders from `ff99ae0`. The judges need a public link that stays up until 10 Nov, and the AI cards and real
  translations only arrive with the Azure model and Azure AI Translator.
- **Proposed outcome:** one resource group, deployed by `azd up` from this repository, runs every layer on Azure with
  managed identities and no keys. The public web app shows a live 20× match on the 3D pitch with model-written cards in
  four modes and four languages, and replays from the Azure archive.
- **Benefit to viewers or teammates:** judges get a working link, not a laptop demo; AI cards are written by a real
  model; teammates can deploy their own changes with `azd deploy <service>`.
- **Success statement:** a 20× match started on Azure reaches full time on the public web app with every frame, event,
  stat panel and card delivered, and the same comparison checks as the local runs pass, with only settings changed.

## 2. Current state and reference material

| Reference | Revision / link | What it establishes |
|---|---|---|
| Bicep and `azd` | main · 0c73c59 · `infra/main.bicep`, `infra/modules/*.bicep` (10 files), `azure.yaml` | All 8-line placeholders. **Lucid page 6 says "Bicep module exists" for A1, A2, A4 and A7: only the empty file exists** |
| Infra specs | `infra/specs/resources.md`, `security.md`, `costs.md` | **Not started**: every question unanswered. Spec gate: no Bicep before they are agreed |
| Local stack spec | `infra/specs/local-development.md` (draft) §4 | The local ↔ Azure settings table this plan makes real |
| Code readiness for identity | `generator/live.py`, `stats/consumer.py`, `stats/publish.py`, `functions/relay_store.py`, `archiver/*`, `agents/{models,state,publisher,translation}.py`, `mcp_server/data_access.py`, `web/src/lib/server/*` | All use `DefaultAzureCredential` when no key is set. Exception: the stats engine's checkpoint store (`stats/consumer.py` `checkpoint_store()`) only takes a connection string |
| Functions app | `functions/function_app.py`, `functions/package.py` (H4) | 8 functions run under `func start`; triggers already read identity-style settings (`EVENTHUBS__fullyQualifiedNamespace`, `COSMOS__accountEndpoint`). Relay state (open frame bundles, `seq`) and the model breaker live **in process memory** and are shared between functions |
| Web routes | `web/src/app/api/match/[id]/insights/snapshot/route.ts`, `start-match/route.ts` | Insights snapshot answers 501 off-laptop; `start-match` is a 501 stub |
| Shared contracts | `CONTRACTS.md` §1.4 (Event Hubs transport), §4 (Cosmos: all containers in `live`, partition `/match_id`), §7, §10 | Transport and storage already agreed; no change needed for Azure |
| Lucid page 6 | read 23 Oct | A1 Event Hubs · A2 Cosmos (+ `overlays`, leases, roles) · A3 Web PubSub · A4 Azure OpenAI in Foundry ($25 alert) · A5 Translator · A6 Functions hosting · A7 stats on Container Apps · A8 same 20× match on Azure + Azeem's round 2 |
| CI | `.github/workflows/infra.yml` | Builds and lints every changed `.bicep` on PRs; no Azure access |
| Tools on this laptop | checked 23 Oct | Docker 28.5, Functions Core Tools present; **Azure CLI, `azd` and Bicep CLI not installed** |

**Differences between references:**
- Lucid page 6 marks A1, A2, A4 and A7 as "module exists"; the repository has placeholders only. Page 6 should say
  "not started" for every A box.
- Page 6 has no box for **hosting the web app** or **running the generator on Azure** (Lucid page 4 lists both under
  AZ2). Without them there is no public link and nothing produces live matches on Azure. This plan adds them as
  **A9** and **A10**, done before A8.
- Page 6 A6 still lists "add the publisher and recap trigger; package the agents": done in H4 (#79). A6 is now
  only "host it on Azure".

## 3. Scope and boundaries

| In scope for this proposal | Outside this proposal / deferred |
|---|---|
| The three infra specs (resources, security, costs) and the Azure column of the local-development spec | Changes to message shapes (`CONTRACTS.md` unchanged) |
| Bicep for every resource; `azure.yaml`; container files for the stats engine, generator and web app | New product features; agent prompts; chart work |
| Managed identities and least-privilege roles; local auth turned off everywhere | Voice (Azure Speech), season aggregates, `viewer_profiles` |
| Web app: insights snapshot read from Cosmos `overlays` on Azure; `/api/start-match` starts a generator job | `/api/preferences` (stays in the browser) |
| Stats engine: identity-based checkpoint store (with Azeem's agreement) | Stats `heavy.shots` and other stats features (Azeem's plan) |
| Budgets and alerts, the $25 model cap, the 10 Nov shutdown | A separate demo environment (one environment only, D-07) |
| The same 20× match on Azure (A8) with latency, expiry and cost measured | Load beyond 3 concurrent matches |

- **Minimum complete result:** A0–A10 and A8: every layer on Azure, the public link live with model cards in four
  languages and replay, until 10 Nov.
- **Optional extension:** a scheduled generator run so a match is always live or recent (D-08); a custom domain.
- **Boundary with neighbouring components:** this plan creates resources, identities, settings and deployment
  wiring. Behaviour inside each layer stays with its owner; the only code changes are the four named in §8 (stats
  checkpoint store, web insights snapshot, web `start-match`, container files).

## 4. Ownership and dependencies

| Dependency or shared area | Owner to coordinate with | What is needed / supplied | Status and needed-by milestone | How work can continue meanwhile |
|---|---|---|---|---|
| Azure subscription, budget, region | Arnav | Which subscription, total budget beyond the $25 model cap, region (D-01, D-02) | **Blocking · A0** | Specs can be drafted with region and SKUs as parameters |
| Tool install and sign-in | Arnav | OK to install Azure CLI, `azd`, Bicep (winget); Arnav signs in himself (`az login`, `azd auth login`) | **Blocking · A0** | Bicep build/lint runs in CI without Azure |
| `stats/consumer.py` (checkpoint store) | Azeem | Agree a small change: identity-based Blob checkpoint store when `AzureWebJobsStorage__accountName` (or a blob endpoint) is set | Pending · A7 | Stats can run on the laptop against Azure Event Hubs with a developer sign-in only if the store accepts a credential, so this blocks A7 |
| Generator container and job | Azeem | Agree that the generator runs as a Container Apps job (`cli.py live --hubs azure`), container file kept in `infra/containers/` so `generator/` is untouched | Pending · A10 | Generator runs from the laptop with `--hubs azure` (A1) |
| `azure.yaml`, `infra/main.bicep` (hot files) | Arnav, Pranav | Dedicated commits | Pending · A0 | — |
| `web/` routes (insights snapshot, start-match) | Arnav, Azeem | Agreement on the two route changes | Pending · A3, A10 | Local behaviour unchanged |
| Azeem's review round 2 | Azeem | Review cards written by the Azure model (agents plan M6) | Pending · A8 | Automatic checks only |
| Lucid page 6 | Arnav | Mark A boxes "not started", add A0, A9, A10 | On Arnav's word | — |

**My owned deliverables:** infra specs, all Bicep, `azure.yaml`, identities and roles, Functions hosting, the A8 run.
**Shared deliverables:** stats checkpoint store (Azeem), generator job (Azeem), web routes (Arnav, Azeem).

## 5. Proposed flow

```text
web app (Container Apps, public) ──/api/start-match──▶ generator job (Container Apps job)
                                                            │ AMQP, managed identity
                                                            ▼
                         Event Hubs (Standard, 1 TU): match-events, match-tracking · 4 partitions · key match_id
             ┌──────────────────────┬──────────────────────┬──────────────────────┐
         [relay]                [archiver]               [stats]
   Functions app (1 instance) ───────────┘        stats engine (Container Apps, 1 replica)
   relay · archiver · moment_trigger ·                      │ stat panels → match-events
   recap_trigger · insights_publisher                       │ match_state, moments → Cosmos
             │                    │                         ▼
             │                    └──▶ Cosmos (free tier, db live, shared 1,000 RU/s):
             │                         screen, matches, events, stats, match_state, moments, overlays, leases
             │                         Blob: tracking, checkpoints, Functions storage
             │   change feed on moments ─▶ 7 agents ─▶ Azure OpenAI (Foundry) + Azure AI Translator
             ▼
   Web PubSub (hub live): match-<id>, audience and player groups ──▶ browsers
   web app: /api/negotiate (token), snapshot, insights snapshot + history, replay, matches (Cosmos + Blob reads)
```

- **Input arrives through:** a viewer pressing "start a match" (or a schedule, D-08) starts the generator job.
- **Processing performed here:** none beyond the layers' own code; this plan supplies resources, identities and
  settings.
- **Output goes to:** viewers' browsers via Web PubSub and the web app's routes.
- **Execution relationship:** generator job runs per match; the Functions app and stats engine run continuously (one
  instance each); the web app scales 1–3 replicas.
- **State retained:** Cosmos documents and Blob tracking chunks (business state); Event Hubs checkpoints in Blob
  (reading positions only); nothing on instance disks.

## 6. Technical approach and decision rationale

| Decision | Proposed choice | Reason | Credible alternative and tradeoff | Status / person needed |
|---|---|---|---|---|
| Deployment tool | `azd up` with `azure.yaml` + `infra/main.bicep` (already the repo's stated plan, `infra/README.md`) | One command for teammates; Bicep is Microsoft's IaC | Plain `az deployment` + scripts (more steps) | Proposed · Arnav |
| Environments | One resource group, one environment, used for development and judging | Four days to submission; cost | Separate dev and demo (double cost and setup) | Proposed · D-07 |
| Region | Sweden Central for every resource | Model availability (GPT-5 mini Global Standard and EU Data Zone); close to the judges | Central India (closer to the team; model availability unconfirmed) | **Agreed · Arnav, 23 Oct** |
| Functions hosting | **Dedicated App Service plan, Linux, 1 instance, Always On** (B2 or P0v3 sized in A0) | The relay's open frame bundles and `seq`, and the model breaker, live in process memory shared by `relay_events`, `relay_tracking`, `relay_tick`, `moment_trigger` and `insights_publisher`. Flex Consumption scales each non-HTTP function on its own instances, so the tick would run on a different instance from the triggers. One dedicated instance keeps one process; 1 s timers cost nothing extra | (a) Functions on Container Apps with min = max = 1 replica (same environment as stats; fine too). (b) Flex Consumption: cheapest idle but breaks the single-process design. (c) Elastic Premium EP1 with scale-out 1: works, ~3–5× the cost | **Unresolved · D-03 Arnav** |
| Stats engine, web app, generator | Container Apps (consumption): stats app 1 replica (0.5 vCPU, 1 GiB); web app 1–3 replicas with external ingress; generator as a manual-trigger job; images in Azure Container Registry (Basic), pulled with managed identity | One environment, identity pull, scale rules; web keeps its Node server routes | App Service for the web app (simple, one more plan to pay for); Static Web Apps (Next.js server routes with Azure SDKs are a poor fit) | Proposed · D-04 Arnav |
| Event Hubs | Standard, 1 TU, auto-inflate off; hubs and consumer groups exactly as `local-development.md` §2; retention 1 day; local auth (SAS) disabled | Basic allows only `$Default`; each service needs its own group | Premium (far more cost) | Proposed · D-06 Arnav |
| Cosmos DB | NoSQL, **free tier** account (if this subscription has not used it), database `live` with shared 1,000 RU/s; containers `screen`, `matches`, `events`, `stats`, `match_state`, `moments`, `overlays` on `/match_id` and `leases` on `/id`, all created by Bicep; local auth disabled; built-in data roles | Free; containers in a shared database cost nothing extra; with identity, code cannot create containers, so Bicep must | Serverless (pay per RU, no free tier) if free tier is taken or throttling appears | Proposed · D-01 Arnav |
| Web PubSub | **Standard S1, 1 unit** for every real run and judging; hub `live`; local auth disabled | Free allows 20 connections and 20,000 outbound messages a day with no overage; 20× tracking frames to even one screen use that up within the first match | Free for a first smoke test only; moving Free → Standard later causes up to an hour's downtime (IP change), so start on Standard | Proposed · D-05 Arnav |
| Model | Azure OpenAI in Microsoft Foundry: GPT-5 mini (or the closest current mini model if it is retiring), Global Standard deployment, small TPM quota; `OVERLAP_MODEL_PROVIDER=azure` | Agents plan decision ("cheap, good enough for short checked lines") | Larger models: cost | Proposed (agents plan) · D-09 Arnav |
| $25 model cap | Enforced in code by the existing budget settings (`OVERLAP_MAX_TOKENS_PER_MATCH`, `OVERLAP_MAX_CALLS_PER_MATCH`, …) plus an Azure budget on the Foundry resource with alerts at 50/80/100 %; at 100 % Arnav removes the deployment (agents fall back to templates) | An Azure budget only alerts, it never stops spending | Action-group automation to delete the deployment (more moving parts) | Proposed · Arnav |
| Translator | Azure AI Translator, F0 (free, 2 M characters a month), custom subdomain so Entra sign-in works; `OVERLAP_TRANSLATOR=azure` | Free; Entra needs the custom subdomain | Translator through the Foundry (AI Services) account: one resource fewer, but paid | Proposed · Arnav |
| Identities | One user-assigned identity per workload: functions, stats, web, generator; roles in §10; developers get their own roles for laptop tests | Least privilege per workload, readable role list | One shared identity (simpler, much broader access) | Proposed · Arnav |
| Secrets and Key Vault | No secrets at all: every service signs in with identity; `key-vault.bicep` stays a placeholder and is not deployed | Nothing to store | Key Vault "just in case" (cost, no use) | Proposed · D-11 Arnav |
| Monitoring | One Log Analytics workspace + Application Insights for Functions and Container Apps, daily ingestion cap, sampling on | Find failures on Azure; cap protects cost | No monitoring (blind on Azure) | Proposed · Arnav |
| Live matches for judges | `/api/start-match` starts one generator job execution, rate-limited (one running match at a time, a few per hour per visitor) | Security spec §3 already asks how `/api/start-match` is limited | A schedule only (always something live, no button); both (D-08) | **Unresolved · D-08 Arnav** |
| Match speed on Azure | 20×, from settings, not hard-coded (`overlap-match-speed` decision) | Same as local | — | Agreed (Arnav, 20 Oct) |

**Assumptions:**
- A-01: prices in §10 are estimates from memory and recent pages, **not checked for the chosen region**; A0 checks
  them on the Azure pricing pages and writes them into `costs.md`.
- A-02: at most 3 matches stream at once, at most 20× (1 TU and S1 sized for that; measured in A8).
- A-03: the Cosmos change-feed trigger accepts a pre-created `leases` container under identity with
  `create_lease_container_if_not_exists=True` left on (checked in A6; if not, the flag is set from settings).
- A-04: `create_container_if_not_exists` in the relay, archiver, stats and agents succeeds against containers that
  Bicep already created when only data roles are granted (checked in A2; if not, those calls are skipped on Azure).

## 7. Data contracts and compatibility

| Interface | Producer → consumer | Contract / example link | Change proposed? | Affected owners and agreement |
|---|---|---|---|---|
| Event Hubs transport | Generator, stats → relay, archiver, stats | `CONTRACTS.md` §1.4 | No | — |
| Cosmos documents (all containers) | Relay, archiver, stats, agents → web, MCP | `CONTRACTS.md` §4, §10; `archiver/specs/storage.md` | No (containers created by Bicep with the agreed `/match_id`; `leases` is the Functions runtime's own container, `/id`) | — |
| Web PubSub groups and envelopes | Relay, insights publisher → browsers | `CONTRACTS.md` §7 | No | — |
| Insights snapshot route | Web app (reads `overlays`) → browser | `web/specs/realtime.md`; `CONTRACTS.md` §10 | No shape change: the Azure path returns the same body the stand-in returns, read from Cosmos instead | Arnav, Azeem · pending |
| `/api/start-match` | Browser → web app → generator job | `web/specs/` (route currently a stub) | Behaviour added: `202 { match_id }` or `429` when limited; body to be written into the web spec in A10 | Arnav, Azeem · pending |

**Shared contract edits required:** None.
**Source of truth:** `CONTRACTS.md`; settings names in `infra/specs/local-development.md` §4.

## 8. File and specification map

| File or small related group | Add / modify / use unchanged | Responsibility | Governing spec and unanswered questions | Owner / shared reviewer |
|---|---|---|---|---|
| `infra/specs/resources.md`, `security.md`, `costs.md` | Modify (A0) | Answer every question; this plan's §6 and §10 become the answers once agreed | Themselves · all unanswered today | Arnav · Pranav |
| `infra/specs/local-development.md` | Modify (A0, A8) | Azure column of §4 made exact; §6 updated with what Azure proved | Itself (draft) | Arnav · Pranav |
| `infra/main.bicep`, `infra/main.parameters.json` (add) | Modify / add (A0, then each sprint) | Compose the modules; parameters for region, SKUs, names | `resources.md` · hot file | Arnav, Pranav |
| `azure.yaml` | Modify (A0, A6, A7, A9, A10) | Services: `functions` (from `functions/dist`, pre-package hook runs `package.py`), `stats`, `web`, `generator` | `resources.md` · hot file | Arnav, Pranav |
| `infra/modules/identity.bicep`, `monitoring.bicep`, `storage.bicep` | Modify (A0) | Identities and role assignments; Log Analytics + App Insights; storage account (Blob `tracking`, checkpoints, Functions storage), shared-key access off | `security.md`, `resources.md` | Arnav (unassigned modules: Arnav decides) |
| `infra/modules/event-hubs.bicep` | Modify (A1) | Namespace, two hubs, consumer groups, roles | `resources.md`, `security.md` | Arnav, Pranav |
| `infra/modules/cosmos.bicep` | Modify (A2) | Account, database, 8 containers, SQL data roles | `resources.md`, `archiver/specs/storage.md` | Arnav (Pranav helping) |
| `infra/modules/web-pubsub.bicep` | Modify (A3) | Service, hub `live`, Service Owner roles | `resources.md`, `security.md` | Arnav (Pranav helping) |
| `infra/modules/foundry.bicep` | Modify (A4, A5) | Foundry resource, project, GPT mini deployment, Translator F0, roles, budget | `resources.md`, `costs.md` | Arnav |
| `infra/modules/functions.bicep` | Modify (A6) | Plan per D-03, app settings (identity-style), identity | `resources.md`, `functions/specs/*` | Arnav |
| `infra/modules/container-apps.bicep` | Modify (A7, A9, A10) | Environment, ACR, stats app, web app, generator job | `resources.md` | Arnav |
| `infra/modules/key-vault.bicep` | Use unchanged | Not deployed (D-11) | `security.md` | — |
| `infra/containers/stats.Dockerfile`, `generator.Dockerfile`, `web.Dockerfile`, `.dockerignore` (add) | Add (A7, A9, A10) | Container images; kept in `infra/` so `stats/`, `generator/` and `web/` are not touched for packaging | `resources.md` | Arnav · Azeem told |
| `infra/README.md` | Modify (A0, A8) | How to deploy, tear down, and what each module does | — | Arnav |
| `stats/consumer.py` | Modify (A7, own commit) | Checkpoint store signs in with identity when no connection string is set | `stats/specs/*` (settings section) | **Azeem** (his agreement first) |
| `web/src/app/api/match/[id]/insights/snapshot/route.ts`, `web/src/lib/server/overlays-store.ts` | Modify (A3) | Azure path reads `overlays` instead of answering 501 | `web/specs/realtime.md` | Arnav, Azeem |
| `web/src/app/api/start-match/route.ts`, `web/src/lib/server/start-match.ts` (add) | Modify / add (A10) | Start one generator job execution with identity; rate limit | `web/specs/realtime.md` (new subsection) + `security.md` §3 | Arnav, Azeem |
| `web/specs/realtime.md` | Modify (A3, A10) | Azure insights snapshot; `start-match` behaviour | Itself | Arnav, Azeem |
| `web/.env.example`, `web/package.json` + lockfile | Modify (A10) | Azure settings names; one Azure SDK package to start a job (lockfile regenerated with npm, never hand-merged) | — | Arnav, Azeem |
| `functions/README.md` | Modify (A6) | Azure settings and deploy steps | `functions/specs/*` | Arnav |
| `docs/knowledge/environments.md`, `event-hubs.md`, `storage.md`, `web-pubsub.md`, `frontend.md`, `stats-engine.md` | Modify (with the PR that changes each) | Graphify notes kept current | `docs/knowledge/setup.md` | Arnav |
| `plans/active/PLAN_infra_azure-pass.md` | Add, then update status | This plan | — | Arnav |
| `plans/active/PLAN_functions_screen-relay.md`, `PLAN_archiver_archive-flow.md`, `PLAN_agents_azure-readiness.md`, `PLAN_web_live-home.md` | Modify (status lines only, A8) | Mark their Azure milestones done | — | Arnav (`PLAN_stats_engine.md` status: Azeem) |
| `.github/workflows/infra.yml` | Use unchanged | Bicep build + lint on every PR | — | — |

## 9. Failure handling and recovery

| Failure or edge case | Expected behavior | Recovery / fallback | Effect on other components or viewers | How it will be checked |
|---|---|---|---|---|
| A role assignment missing or not yet propagated | The service logs an authorization error naming the resource | Bicep owns every role; wait for propagation (minutes) and restart; never fall back to keys | That layer is silent; others continue | First run of each sprint; AC per sprint |
| Cosmos free-tier throughput exhausted (429) | SDKs retry with back-off; writes slow down | Measure RU in A8; switch the database to more RU or serverless (D-01) | Screen and cards lag | A8 RU metrics |
| Model provider errors, timeouts or budget reached | Existing model breaker takes templates at once (H2) | Cool-down probe; at 100 % budget the deployment is removed | Cards fall back to checked templates | A4 forced-failure check |
| Functions instance restarts | Event Hubs triggers resume from Blob checkpoints; relay rebuilds state from Cosmos `screen` | As local restart tests | A short gap on screen | A6 restart check |
| Stats engine replica restarts | Resumes from its Blob checkpoints | Container Apps restarts it | Stat panels pause | A7 restart check |
| Generator job fails mid-match | Match stops; consumers treat it as an unfinished match (existing stale-match rule on home skips it after 9 s) | Start another match | Home replays the newest finished match | A10 kill check |
| Web PubSub limit reached | Sends are throttled or refused | S1 sized for 3 matches; measured in A8 | Screens stall | A8 message metrics |
| Spending runs ahead of estimate | Budget alerts at 50/80/100 % of the agreed total | Scale web/stats to zero between test sessions; delete the model deployment; tear down per `costs.md` | Link down if torn down | Alerts configured in A0; checked after A8 |
| Deployment half-applied | `azd up` / Bicep is idempotent; rerun | `azd down --purge` and redeploy if needed (data is test data) | — | A0 rerun check |

## 10. Requirements specific to this work

- **Performance and load:** at 20× about 100 tracking frames/s and 8 events/s per match (`archiver/specs/storage.md`),
  stat panels ~20/s. Targets carried from local runs, **unmeasured on Azure**: moment → card p95 ≤ 7 s, 0 expired
  cards, no backlog growth on any consumer group. Measured in A8 from Event Hubs enqueue time to browser receipt.
- **Observability:** Application Insights for the Functions app and Container Apps logs in Log Analytics, with
  `match_id` in every log line already present in the code; Event Hubs consumer lag, Cosmos RU and 429s, Web PubSub
  messages and connections from Azure Monitor metrics; the existing `agents/evals/live_run.py` report.
- **Azure resources and access (proposed roles):**

| Identity | Roles (scope) |
|---|---|
| functions | Event Hubs Data Receiver (both hubs) · Storage Blob Data Owner + Queue/Table Data Contributor (Functions storage) · Storage Blob Data Contributor (`tracking`) · Cosmos DB Built-in Data Contributor (db `live`) · Web PubSub Service Owner · Cognitive Services OpenAI User (Foundry) · Cognitive Services User (Translator) |
| stats | Event Hubs Data Receiver (both hubs) and Data Sender (`match-events`, stat panels) · Storage Blob Data Contributor (`stats-checkpoints`) · Cosmos DB Built-in Data Contributor · AcrPull |
| generator | Event Hubs Data Sender (both hubs) · AcrPull |
| web | Cosmos DB Built-in Data Reader (db `live`) · Storage Blob Data Reader (`tracking`) · Web PubSub Service Owner (client tokens) · a role that can start the generator job only (least-privilege role chosen in `security.md`) · AcrPull |
| developers (Arnav, and anyone Arnav names) | Data roles above at resource-group scope for laptop tests; Contributor on the resource group for deployment |

- **Cost (estimates, A-01, not checked for the region; per day while running):** Event Hubs Standard 1 TU ~$0.75 ·
  Web PubSub S1 ~$1.6 · Cosmos free tier $0 · Functions dedicated plan ~$0.4–2.5 (size per D-03) · Container Apps
  (stats + web at 1 replica) ~$1–2 · ACR Basic ~$0.17 · Log Analytics a few cents with a daily cap · Translator F0 $0 ·
  model calls within the $25 cap. **Roughly $4–7 a day, ~$75–125 from 24 Oct to 10 Nov, plus up to $25 of model
  calls.** Main cost drivers: Web PubSub, Event Hubs, Functions plan. Scaling web/stats to zero between test sessions
  before 27 Oct reduces this. Credits are not assumed (D-01). Shutdown: `costs.md` §3 says what is deleted on
  11 Nov (whole resource group with `azd down --purge`).
- **Security and data:** local auth off on Event Hubs, Cosmos, Web PubSub and Storage (shared key off); only the web
  app has public ingress; browser tokens are receive-only, 10 minutes, limited groups (existing `pubsub-token.ts`);
  `/api/start-match` rate-limited; synthetic data only; no secrets in the repo, settings named by variable only.
- **AI behavior:** unchanged agents; numbers from the evidence pack; on Azure the model writes words, the fact-checker
  still gates every line; budget limits and breaker as in H2.
- **Frontend experience:** unchanged screens; on Azure the insights snapshot works for late joiners (was 501).
- **Synthetic data or calculations:** Not applicable — no generator or stats logic changes.

## 11. Acceptance criteria and validation

| ID | Acceptance criterion | Verification method | Required fixture / dependency | Evidence to attach after implementation |
|---|---|---|---|---|
| AC-01 | Given the three infra specs, when reviewed, then every question is answered and the specs are merged as agreed | PR review | D-01–D-11 decided | Merged PR link |
| AC-02 | Given `main.bicep`, when `azd provision` runs twice, then the second run changes nothing and `infra.yml` passes | `azd provision`, CI | Subscription, tools | Run output, CI link |
| AC-03 | Given Event Hubs on Azure, when the laptop generator sends a 20× match with `--hubs azure`, then the laptop relay, archiver and stats read it with a developer sign-in and settings changed only | Existing relay/archive comparison scripts | A1 | Script output |
| AC-04 | Given Cosmos on Azure, when a match is archived, then the archive round trip is identical (archiver AC-06) and the 8 containers exist with the agreed partition keys | `archiver/tests/check_archive.py` against Azure | A2 | Report |
| AC-05 | Given Web PubSub on Azure, when a browser negotiates through the web app, then it receives `match-<id>` frames and audience-group cards, and a late joiner gets the insights snapshot (no 501) | Joint run; route test | A3 | Screenshot, test |
| AC-06 | Given the Azure model, when a moment arrives, then a model-written card passes the fact-checker within the moment deadline; with the model failing, templates appear and no card expires | `agents/evals/live_run.py`; forced failure | A4 | Report |
| AC-07 | Given Azure AI Translator, when a card is published, then es/hi/fr lines are real translations and pass the per-language check | Live run, sample of lines | A5 | Sample lines |
| AC-08 | Given the Functions app on Azure, when it starts, then all 8 functions are listed, one instance runs them, and a restart resumes from checkpoints with no duplicate envelopes on screen | Portal function list, instance id in logs, restart check | A6 | Logs |
| AC-09 | Given the stats engine on Container Apps, when a match streams, then every stat panel reaches a browser in `seq` order and is saved in Cosmos `stats` (stats AC-05 on Azure) | Existing check | A7, Azeem's agreement | Report |
| AC-10 | Given the public web app, when opened on desktop and phone, then home, live, replay and matches pages work against Azure | Browser checks | A9 | Screenshots |
| AC-11 | Given the start-match button, when pressed, then one generator job starts and the match appears live; a second press within the limit gets 429 | Route test + live run | A10 | Test, screenshot |
| AC-12 | Given the whole stack on Azure, when a 20× match runs, then it reaches full time with the same comparison checks as local, moment → card p50/p95 recorded, 0 expired cards, no consumer backlog, and the day's cost recorded | Same scripts as local + metrics | A8, all sprints | Report |
| AC-13 | Given the deployed resources, when inspected, then local auth / shared keys are off on Event Hubs, Cosmos, Web PubSub and Storage, and no secret is in the repo | `az` queries; secret scan | All | Output |

**Validation limits:** behaviour above 3 concurrent matches; cold starts after long idle (Always On should avoid
them); cost over the full judging period (only extrapolated from A8 and the first days).

## 12. Delivery milestones or short sprints

| Milestone | Demonstrable outcome | Owner | Depends on | Completion criteria / AC IDs | Estimated effort or date |
|---|---|---|---|---|---|
| A0 — Specs and foundation | Specs agreed; tools installed; region and prices checked; `main.bicep` + `azure.yaml` skeleton; resource group, identities, storage, monitoring, budgets deployed | Arnav (Pranav helps) | D-01, D-02, D-10 | AC-01, AC-02 | 23–24 Oct |
| A1 — Event Hubs | Namespace, hubs, groups, roles; laptop services read Azure hubs | Arnav, Pranav | A0 | AC-03 | 24 Oct |
| A2 — Cosmos | Free-tier account, db `live`, 8 containers, data roles; archive round trip on Azure | Arnav (Pranav helping) | A0 | AC-04 | 24 Oct (parallel with A1) |
| A3 — Web PubSub | S1 service, hub `live`, roles; web insights snapshot Azure path | Arnav (Pranav helping); web change with Azeem's agreement | A0, A2 | AC-05 (laptop web app against Azure) | 24 Oct |
| A4 — Azure OpenAI in Foundry | GPT mini deployment, role, budget alerts; model cards from the laptop agents | Arnav | A0, A2 | AC-06 | 24 Oct (parallel) |
| A5 — Translator | F0 resource, custom subdomain, role; real translations | Arnav | A0 | AC-07 | 24 Oct (parallel) |
| A6 — Functions hosting | Plan per D-03; `azd deploy functions`; relay, archiver, insights on Azure | Arnav | A1–A5 | AC-08 | 25 Oct |
| A7 — Stats engine hosting | Container Apps environment, ACR, stats image, identity checkpoint store; the first real Cosmos `moments` write on Azure (stats S4, handed to Arnav by Azeem on 23 Oct) | Arnav; `stats/` change by or with Azeem | A1, A2, Azeem's agreement | AC-09 | 25 Oct |
| A9 — Web app hosting | Web image (includes `web/data/season/season-S1.json`, which the season routes read from disk), public ingress, identity, Azure settings | Arnav, Azeem | A3, A7 (environment) | AC-10 | 25 Oct |
| A10 — Generator on Azure | Generator job; `/api/start-match` starts it with a rate limit | Arnav; job settings with Azeem's agreement | A7, A9 | AC-11 | 26 Oct |
| A8 — Same 20× match on Azure | Full run measured; Azeem's review round 2 on the Azure model; specs and plans updated; cost recorded | Arnav; review: Azeem | A6, A7, A9, A10 | AC-12, AC-13 | 26 Oct |

- **Project calendar check:** the 24 Oct "every required feature" date only fits A0–A5; A6–A10 and A8 fall on
  **25–26 Oct, inside the feature freeze**. This is deployment of finished features, not new features, but it is
  Arnav's call whether the freeze allows it. Submission 27 Oct; the link must then stay up to 10 Nov.
- **First integration checkpoint:** A1, when the laptop generator sends to Azure Event Hubs and the laptop consumers
  read from it (real Azure connection, laptop compute).
- **Parallel work:** A1, A2, A4, A5 run side by side after A0; container files (A7, A9, A10) can be written and tested
  with local Docker before the environment exists.
- **Dependency-bound work:** everything waits for D-01, D-02, D-10 (subscription, region, tools); A7 waits for Azeem's
  agreement on `stats/consumer.py`; A10 for his agreement on the generator job.
- **Scope reduction if time runs short:** Arnav's rule is full scope, so nothing is cut by default. If a sprint slips,
  the order that keeps a working judge link is A0 → A1 → A2 → A3 → A6 → A7 → A9 → A8, with A4/A5 (AI cards, real
  translations) next and A10's button replaced by matches started from the laptop until it lands.

## 13. Integration and change management

- **Proposed branch / PR boundaries:** branch names start `infra/`. PR 1 `infra/azure-specs` (A0 specs only, reviewed
  and merged first: spec gate). PR 2 `infra/azure-foundation` (A0 Bicep + `azure.yaml`, A1, A2). PR 3
  `infra/azure-services` (A3–A6, with the web snapshot change in its own commit). PR 4 `infra/azure-containers`
  (A7, A9, A10; the `stats/consumer.py` change in its own commit, or Azeem's own PR). PR 5 A8 results, spec and plan
  status updates.
- **Shared-file coordination:** `azure.yaml` and `infra/main.bicep` are hot files: their edits go in dedicated commits,
  Arnav and Pranav told. `stats/consumer.py` (Azeem's folder) only after his agreement, own commit. `web/` route
  changes in their own commits, Arnav and Azeem. `web/package-lock.json` regenerated by npm only.
- **Conflict scan result:**

| Overlapping file or contract | Other plan / PR / branch | Its owner | Resolution (order, split, or agreed shared edit) | Status |
|---|---|---|---|---|
| `infra/modules/event-hubs.bicep`, Event Hubs sections of `infra/specs/` | `plans/active/PLAN_infra_event-hubs.md` (untracked local draft, 14 Oct, never committed) | Arnav | This plan supersedes it; Arnav decides whether the draft is deleted or kept for reference | Pending · Arnav |
| `functions/function_app.py`, `functions/package.py` | `PLAN_functions_screen-relay` (S3 status line stale), `PLAN_agents_azure-readiness` (done) | Arnav | Not changed by this plan (settings only); status lines updated in A8 | Agreed (same owner) |
| `infra/modules/cosmos.bicep`, `storage.bicep`, `identity.bicep` | `PLAN_archiver_archive-flow` A3 | Arnav (Pranav helping) | This plan delivers archiver A3; its status updated in A8 | Agreed (same owner) |
| Stats Azure hosting | `PLAN_stats_engine` S4 ("this plan supplies the container and settings") | Azeem | This plan writes the container file in `infra/containers/`; the `stats/consumer.py` change needs Azeem's agreement | Pending · Azeem |
| `web/src/app/api/...` snapshot and start-match | `PLAN_web_live-home` §4 lists both as not done | Arnav, Azeem | This plan does them; live-home status updated in A8 | Pending · Azeem |
| `azure.yaml`, `infra/main.bicep` | Hot files (`plans/REGISTRY.md`) | Arnav, Pranav | Dedicated commits | Pending · tell Pranav |
| `.github/workflows/infra.yml` | `PLAN_ci_pr-checks` (M3 open) | Arnav | Used unchanged | No overlap |

  Open PRs: none. Remote branches ahead of main: `agents/delivery` (no file changes), `generator/world-spec`
  (`generator/specs/world.md`), `mock/live-viewer` (`mock/` only): none overlap. One more remote branch sits at the same commit as main (no overlap).
  **Scanned at `0c73c59` on 23 Oct 2026. Sources checked: plans ✓ · PRs ✓ · branches ✓ · hot files ✓.**

- **Integration procedure:** `azd auth login` → `azd env new overlap` → `azd up` deploys everything; teammates redeploy
  one service with `azd deploy <functions|stats|web|generator>`. Laptop tests against Azure set the Azure column of
  `local-development.md` §4 and sign in with `az login`.
- **Configuration or setup changes:** Azure settings are app settings written by Bicep (names only, as in
  `local-development.md` §4: `EVENTHUBS__fullyQualifiedNamespace`, `COSMOS__accountEndpoint`,
  `AzureWebJobsStorage__accountName`, `OVERLAP_*`). `azd` environment files stay out of git (`.azure/` ignored).
- **Deployment or data changes, if applicable:** one resource group; all data is synthetic test data; reversible with
  `azd down --purge`. Cosmos free tier can only be claimed once per subscription: deleting and recreating the account
  re-claims it only after the old one is gone.
- **Documentation updates:** the three infra specs, `local-development.md`, `infra/README.md`, `functions/README.md`,
  `web/specs/realtime.md`, the Graphify notes in §8, and Lucid page 6 (on Arnav's word).

## 14. Risks and decisions needed from the team

| ID | Risk, assumption, or unresolved decision | Consequence if wrong or delayed | Owner / decision maker | Resolution or fallback | Blocks which work? |
|---|---|---|---|---|---|
| R-01 | Subscription and total budget unknown (D-01) | Nothing can be deployed; or spend exceeds what Arnav expects | Arnav | Decide subscription and a total cap; alerts at 50/80/100 % | A0 |
| R-02 | Region lacks one service or the model (D-02) | Redeploy elsewhere | Arnav | Check every service with `az` in A0 before deploying | A0 |
| R-03 | Functions on Flex Consumption would split the relay's in-memory state across instances | Frames bundled but never flushed, `seq` from two writers | Arnav | Dedicated plan or Container Apps, 1 instance (D-03) | A6 |
| R-04 | Cosmos free tier already used in this subscription | ~$58/month for 1,000 RU/s provisioned, or serverless | Arnav | Serverless (pay per use) | A2 |
| R-05 | Identity cannot create containers or leases (A-03, A-04) | Startup errors | Arnav | Bicep pre-creates all; skip create calls on Azure if needed | A2, A6 |
| R-06 | Azeem's agreement on `stats/consumer.py` and the generator job comes late | Stats or generator only on the laptop | Azeem | Laptop-hosted stats/generator against Azure as a stopgap (needs the checkpoint change anyway for stats) | A7, A10 |
| R-07 | A6–A10 and A8 fall inside the 25–26 Oct feature freeze | Rushed deploy or late link | Arnav | Decide whether deployment is allowed in the freeze | A6–A8 |
| R-08 | Model quota for the chosen mini model is low or zero in the region | No AI cards on Azure | Arnav | Request quota in A0; templates meanwhile; another region for Foundry only | A4 |
| R-09 | Price estimates (A-01) are off | Budget alerts fire early | Arnav | Check pricing pages in A0; record actual cost after A8 | A0, A8 |

**Decisions requested from Arnav or affected owners:**

1. **D-01 Subscription and budget:** which subscription, whether it has credits, and a total spending cap (beyond the
   $25 model cap) with who gets the alerts. Recommendation: a cap around $150 to 10 Nov, alerts to Arnav.
2. **D-02 Region:** Sweden Central or East US 2 (recommended, pending the `az` availability check), or Central India.
3. **D-03 Functions hosting:** dedicated App Service plan, 1 instance (recommended), or Functions on Container Apps with
   one replica. Flex Consumption is not recommended (R-03).
4. **D-04 Web app hosting:** Container Apps (recommended) or App Service.
5. **D-05 Web PubSub tier:** Standard S1 from the start (recommended).
6. **D-06 Event Hubs tier:** Standard 1 TU (recommended; Basic cannot hold the consumer groups).
7. **D-07 Environments:** one environment for development and judging (recommended).
8. **D-08 Live matches for judges:** start-match button with a rate limit (recommended), a schedule, or both.
9. **D-09 Model:** GPT-5 mini or the closest current mini model, checked at deployment.
10. **D-10 Tools:** OK to install Azure CLI, `azd` and Bicep with winget; Arnav signs in himself.
11. **D-11 Key Vault:** not deployed (decided by Arnav, 23 Oct).
12. **Azeem:** agree the `stats/consumer.py` checkpoint change (A7) and running the generator as a Container Apps job
    from a container file in `infra/containers/` (A10).
13. **Calendar:** whether deployment work may continue during the 25–26 Oct freeze (R-07).

## 15. Review, agreement, and handover

### Author's submission checklist

- [x] The intended outcome and scope are clear.
- [x] Current repository/spec references are identified.
- [x] Ownership, dependencies, and shared files are named.
- [x] Interface changes and representative examples are linked (none to shared messages; two route behaviours named).
- [x] Assumptions and unresolved decisions are visible.
- [x] Applicable failure, access, cost, and operational concerns are addressed.
- [x] Acceptance criteria and an early integration checkpoint are defined.
- [x] Milestones describe working outcomes and realistic dependencies.
- [x] No secret values or private credentials are included.

### Review record

| Reviewer | Proposal version | Finding / required change | Outcome | Date and reference |
|---|---|---|---|---|
| Arnav | v1 | D-01: Azure free account ($200 credit). D-03: dedicated plan, 1 instance. D-10: install tools. D-02: Sweden Central for every resource (after a comparison with Central India). "Lets start sprint A0" | Go for A0 | 23 Oct · conversation |

**Implementation readiness:** A0 under way (go from Arnav, 23 Oct). D-01, D-02, D-03, D-10, D-11 decided.

**Football revamp handover (23 Oct):** Azeem handed his remaining work to Arnav (`PLAN_web_football-revamp` §15,
PRs #86–#88). The Azure items in it are covered here: stats engine S4 and the first real Cosmos `moments` write (A7),
and the web app deployed with `web/data/season/season-S1.json` (A9). Because Azeem handed stats S4 to Arnav, the
`stats/consumer.py` checkpoint change in A7 no longer waits on him; the generator job (A10) still touches only
`infra/containers/`.
**Relevant specification agreement:** pending (`infra/specs/resources.md`, `security.md`, `costs.md` are A0's first PR).
**Next action and owner:** Arnav decides D-01–D-13 and says **go** for A0 · Arnav.

### Handover after implementation

**A0 (24 Oct, #89):** resource group `rg-overlap` (Sweden Central), four identities, storage (shared keys off),
monitoring (0.5 GB/day cap); provision twice with no changes (AC-02); storage reachable by Entra sign-in only.

**A1 + A2 (24 Oct, branch `infra/azure-data`):**
- **Deployed:** Event Hubs Standard (1 TU, local auth off, TLS 1.2), `match-events` and `match-tracking` with 4
  partitions and the `relay`, `stats`, `archiver` groups; Cosmos DB free tier (local auth off), database `live` at
  1,000 RU/s shared, the 7 match containers on `/match_id` and `leases` on `/id`; data roles per `security.md` §1.
  Second `azd provision`: no changes.
- **AC-03 (A1):** the laptop generator streamed SYN-2501 at 20× into Azure Event Hubs with a developer sign-in (no
  keys); the laptop relay, stats engine and archiver read it from Azure with settings changed only (namespace instead
  of the emulator connection). 32,983 messages sent; 0 invalid at every reader.
- **AC-04 (A2):** the archiver wrote SYN-2501 to Azure Cosmos (`matches`, `events`, `stats`) and Azure Blob
  (`tracking`) with Entra sign-in; `archiver/tests/check_archive.py SYN-2501` against Azure: identical to the
  recording (2,363 events, 30,619 frames, 6–0, finished, no problems).
- **Found:**
  - The generator's Azure path (`azure.identity.aio`) needs `aiohttp`, which is not in `generator/pyproject.toml`; the
    run used `uv run --with aiohttp`. Needed before A10 (generator job); generator folder owner's agreement.
  - From the laptop (India to Sweden, ~150 ms per send) the generator runs nearer 12× than 20×, and the stats engine's
    one-by-one panel sends fall behind (1,476 queued at the 55% mark). Inside Azure (A6, A7) this latency is gone;
    re-measure in A8.

**Wave 1, A3–A5 (24 Oct, branch `infra/azure-wave1`):**
- **Deployed:** Web PubSub Standard S1 (hub `live`, local auth off); Foundry (AIServices) with project `overlap` and
  gpt-5-mini (GlobalStandard 2025-08-07, 100K TPM) plus its $25 budget; Translator F0 on a custom subdomain.
- **A3:** the relay code writes to Azure Cosmos DB and Web PubSub with Entra sign-in; the web app issues real Web
  PubSub tokens and lists matches from the Azure archive.
- **A4:** `Models.ask` answered from gpt-5-mini (3.0 s from the laptop) after two fixes: GPT-5 rejects `temperature`
  (the agents now send `reasoning_effort`), and `max_tokens` is already translated by the framework.
- **A5:** es, hi, fr translations with club names kept, after pinning `azure-ai-translation-text` to 1.0.1 (2.0 only
  speaks an API version the custom domain answers with 404) and reading 1.0's `to` field.

**Wave 2, A6–A10 (24 Oct, branch `infra/azure-wave2`):**
- **Deployed:** a B3 plan (1 instance) with two Functions apps from one zip: `func-overlap-<token>` runs the relay
  alone, `func-overlap-insights-<token>` the archiver and agents; Container Apps: the web app (public link), the stats
  engine (1 replica) and the generator as a manual job; a Basic registry; three images built with `az acr build`.
- **A9:** public link `https://ca-overlap-web.agreeablestone-46edcfef.swedencentral.azurecontainerapps.io`.
- **A10:** **Start a live match** on that page starts the generator job (202 `SYN-3000`); a second press while it
  plays answers 429 `match_running`; the fourth from one address in an hour answers 429 `rate_limited`.
- **Fixed on the way** (each one commit on the branch):
  - Cosmos DB at 1,000 RU/s throttled under a 20× match: `COSMOS_THROUGHPUT=4000` for runs (about $0.24 an hour
    above the free 1,000), 1,000 otherwise.
  - The relay sent one Web PubSub message at a time (about 30 frames a second against the 113 a 20× match makes):
    positions and stats now go 8 at once; events and status stay in seq order.
  - One Python worker held the relay, archiver and agents to one core (relay 80–120 s behind): the relay got its own
    app; batches of 300 and 16 worker threads.
  - The agents' MCP server could not import `mcp` (the child Python lacked the build's package path), then took over
    4 s to start from the network share: the apps now run from a zip with Linux packages built and compiled
    beforehand, and `OVERLAP_MCP_TIMEOUT_S=4`.
  - SDK request logging (thousands of lines a minute into Application Insights) is off.

**A8 (24 Oct): full 20× matches entirely on Azure, SYN-3000 to SYN-3008:**
- **Data path:** every match archived **identical** to its recording (`check_archive.py`, nine of nine; SYN-3006
  even with both apps restarted mid-match). Recordings for comparison are made in the generator's Linux image: on
  Windows one seed in nine (SYN-3004) plays differently (floating-point differences between platforms).
- **Latency (SYN-3008, the final run):** every reader 0 s behind Event Hubs at p50, 1 s at p95, 3 s at worst; 3,009
  function runs, none failed. The generator plays a full match in 6 min 40 s (true 20×; about 12× from the laptop).
- **Insights:** 75 moments → about 17–20 cards, 1 recap and 12–15 player tags a match; SYN-3003: 521 deliveries sent,
  45 expired (8%). **Every card is still a checked template**, not a model line: the narrator writes every audience's
  line in one structured call (about 300 tokens, 3–11 s on gpt-5-mini) and at 20× a card is live for only 15 real
  seconds; with a fresh MCP server per job (4–5 s) the job cannot finish inside that. An 8 s model timeout was tried
  (SYN-3008: 1 narrator call of 12 succeeded, more jobs expired) and reverted. Next (agents owner): per-audience
  narrator calls in parallel, a warm MCP server, or a faster model for the narrator. Hindi lines are often dropped by
  the fact-checker on purpose: Translator reorders numbers ("1–0 after 3 minutes" came back as 0–3 after 1 minute).
- **Cost:** Azure's cost data was not yet available for the new subscription; estimate from list prices for the
  whole of 24 Oct is about $3 (Event Hubs, Web PubSub S1, Cosmos above 1,000 RU/s, the plan, about 75K model tokens
  a match).

**Paused after A8 (24 Oct):** Event Hubs, the plan and both Functions apps, the stats engine, the generator job and
the model deployment deleted; Web PubSub Free, Cosmos DB 1,000 RU/s (free tier), the web app at zero replicas
(`LIVE_PIPELINE=false`, `WEB_MIN_REPLICAS=0`, `DEPLOY_MODEL=false`, `WEBPUBSUB_SKU=Free_F1`, `COSMOS_THROUGHPUT=1000`).
The public link still serves the home page and every replay; the start button is hidden. Still billed while paused:
the registry (about $0.17 a day) and storage and log data (cents). Resume: `infra/README.md`.
- **Open:** SYN-2502 and SYN-2503 are aborted laptop test runs still marked live in the archive, so a visitor sees
  "Connecting" for a few seconds before the home page falls back to a replay; removing them needs a decision (it
  deletes data).

