# Infrastructure

Bicep templates deployed with `azd up`, all in one resource group. Services use managed identities; no keys in code.

## Define before you code

| # | Spec | What it decides | Governs |
|---|---|---|---|
| 1 | [`specs/resources.md`](specs/resources.md) | Region, naming, and every resource's tier and settings | `main.bicep`, `modules/*` |
| 2 | [`specs/security.md`](specs/security.md) | Managed identities and roles, secrets, public endpoints and rate limits | `modules/identity.bicep`, `modules/key-vault.bicep` |
| 3 | [`specs/costs.md`](specs/costs.md) | Budgets and alerts, tiers for development vs judging, shutdown after judging | every module |

## Files

| File | Deploys |
|---|---|
| `main.bicep` | Everything, by composing the modules |
| `modules/event-hubs.bicep` | Event Hubs namespace, `match-events` and `match-tracking`, consumer groups |
| `modules/cosmos.bicep` | Cosmos DB account, database `live`, containers |
| `modules/web-pubsub.bicep` | Web PubSub, hub `live` |
| `modules/container-apps.bicep` | Container registry, Container Apps environment, the web app (public link), the stats engine and the generator job |
| `modules/functions.bicep` | Functions plan (B3, 1 instance) with two apps: `live` (screen relay) and `insights` (archiver, agents) |
| `modules/foundry.bicep` | Microsoft Foundry project and model deployments |
| `modules/storage.bicep` | Storage account (shared keys off): `tracking`, `stats-checkpoints`, Functions host containers |
| `modules/key-vault.bicep` | Nothing: Key Vault is not deployed (no secrets; `specs/resources.md` §2.11) |
| `modules/monitoring.bicep` | Application Insights and Log Analytics; the "Overlap live run" workbook; email alerts on function failures, the model breaker and expiring cards (with `BUDGET_CONTACT_EMAIL`) |
| `modules/identity.bicep` | The four managed identities (functions, stats, generator, web); each module assigns its own roles |
| `containers/*.Dockerfile` | The web, stats and generator images (built in the registry with `az acr build`) |

The `azd` project file is [`azure.yaml`](../azure.yaml) at the repo root.

## Status

Built sprint by sprint ([`PLAN_infra_azure-pass`](../plans/active/PLAN_infra_azure-pass.md)); every module is deployed
(24 Oct). A full 20× match runs entirely on Azure: the web app's start button starts the generator job, and the relay,
stats engine, archiver and agents run in Sweden Central. Results are in the plan's handover.

## Deploy

Needs the Azure CLI, `azd`, Docker and an Azure sign-in with Owner on the subscription (the web app gets a custom role
to start the generator job). From the repository root:

```bash
azd auth login
azd env new overlap --location swedencentral
azd env set BUDGET_CONTACT_EMAIL <your email>     # model budget alerts; kept out of the repo
azd env set COSMOS_THROUGHPUT 4000                # 1,000 RU/s (free) is too little for a 20x match
azd provision                                     # first run: the apps start on a placeholder image
```

Images (tag = the commit), then point the apps at them:

```bash
TAG=$(git rev-parse --short HEAD); R=<AZURE_CONTAINER_REGISTRY_NAME>
az acr build -r $R -t web:$TAG -f infra/containers/web.Dockerfile web
az acr build -r $R -t stats:$TAG -f infra/containers/stats.Dockerfile stats
az acr build -r $R -t generator:$TAG -f infra/containers/generator.Dockerfile generator
azd env set WEB_IMAGE $R.azurecr.io/web:$TAG       # and STATS_IMAGE, GENERATOR_IMAGE the same way
azd provision
```

Functions code: one zip with the packages built for Linux and compiled, deployed to both apps (they run from the zip):

```bash
python functions/package.py
docker run --rm -v "$PWD/functions/dist:/pkg" python:3.12-slim sh -c   "pip install -q -r /pkg/requirements.txt --target /pkg/.python_packages/lib/site-packages && python -m compileall -q /pkg"
(cd functions/dist && zip -qr ../functions.zip . -x local.settings.json)
az functionapp deployment source config-zip -g rg-overlap -n <AZURE_FUNCTIONS_APP_NAME> --src functions/functions.zip
az functionapp deployment source config-zip -g rg-overlap -n <AZURE_FUNCTIONS_INSIGHTS_APP_NAME> --src functions/functions.zip
```

`azd provision` is safe to repeat. The `.azure/` folder holds your local environment values and is git-ignored.

## Run a match

Open `OVERLAP_WEB_URL` and press **Start a live match** (3 starts per visitor per hour, one match at a time). It plays
`SYN-3000` upwards at 20× (about 7 minutes); the home page switches to it when its first frames arrive.

**Watch it:** in the portal, open the Application Insights resource `appi-overlap-<token>` → Workbooks → **Overlap live
run**, and pick a time range that covers the match: cards sent and expired, function runs and failures, relay and
archiver batch time, each agent's stage time, model calls by outcome and MCP calls. Alerts email the budget contact
when function runs fail, the model breaker keeps opening, or most cards expire. Function runs are exact; card,
agent and model counts are sampled under load, so at 20× read them as rates and shares
([`specs/resources.md`](specs/resources.md) §2.8).

## Pause (after a run) and resume

Pausing removes everything billed by the hour and keeps the public link with its replays (Cosmos DB, storage, the web
app, the registry). The web app keeps **one replica** while paused (`WEB_MIN_REPLICAS` stays `1`), so the judges' link
never waits for a cold start (about 25 s from zero); it costs at most about $1.30 a day (0.5 vCPU and 1 GiB at the
active rate, less when idle):

```bash
azd env set LIVE_PIPELINE false; azd env set DEPLOY_MODEL false
azd env set WEBPUBSUB_SKU Free_F1; azd env set COSMOS_THROUGHPUT 1000
azd provision                                      # never deletes, so then:
az functionapp delete -g rg-overlap -n <AZURE_FUNCTIONS_APP_NAME>
az functionapp delete -g rg-overlap -n <AZURE_FUNCTIONS_INSIGHTS_APP_NAME>
az appservice plan delete -g rg-overlap -n asp-overlap-<token> --yes
az containerapp delete -g rg-overlap -n ca-overlap-stats --yes
az containerapp job delete -g rg-overlap -n caj-overlap-generator --yes
az eventhubs namespace delete -g rg-overlap -n evhns-overlap-<token>
# The checkpoints name the namespace, which resume recreates empty with the same name: delete them too, or the
# relay, archiver and stats engine keep failing on every partition that has one ("supplied offset is invalid",
# seen on SYN-3013, 26 Oct) and a match on that partition never reaches the screen or the archive
az storage blob delete-batch --account-name <AZURE_STORAGE_ACCOUNT> -s azure-webjobs-eventhub --auth-mode login
az storage blob delete-batch --account-name <AZURE_STORAGE_ACCOUNT> -s stats-checkpoints --auth-mode login
```

To resume, set those four values back (`true`, `true`, `Standard_S1`, `4000`), `azd provision`, and deploy the
Functions zip again. To remove everything: `azd down --purge` (only after judging, `specs/costs.md` §3).

## Local release patch: prerequisites before enabling starts
The patch adds `match-control` and a container-scoped web writer role. Provision these through reviewed Bicep before
deploying the patched web image. Container Apps sets `OVERLAP_LIVE_ENABLED` from deployLive; keep it false while
paused. The web's existence probe does not establish full pipeline health; run the normal end-to-end acceptance
check before a demonstration. No resources were deployed by the local patch.
For an unknown start outcome, investigate job executions and the pending record under a Blob lease; never delete
starts.json, reset its counter, or release it on a timeout alone. Retain audit/quota history and last allocated ID.
