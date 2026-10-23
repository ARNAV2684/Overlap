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
| `modules/container-apps.bicep` | Container Apps environment and apps |
| `modules/functions.bicep` | Functions app |
| `modules/foundry.bicep` | Microsoft Foundry project and model deployments |
| `modules/storage.bicep` | Storage account (shared keys off): `tracking`, `stats-checkpoints`, Functions host containers |
| `modules/key-vault.bicep` | Nothing: Key Vault is not deployed (no secrets; `specs/resources.md` §2.11) |
| `modules/monitoring.bicep` | Application Insights and Log Analytics |
| `modules/identity.bicep` | The four managed identities (functions, stats, generator, web); each module assigns its own roles |

The `azd` project file is [`azure.yaml`](../azure.yaml) at the repo root.

## Status

Built sprint by sprint ([`PLAN_infra_azure-pass`](../plans/active/PLAN_infra_azure-pass.md)). **A0 deployed (24 Oct):**
resource group `rg-overlap` in Sweden Central with the identities, storage and monitoring. The other modules are still
placeholders until their sprint.

## Deploy

Needs the Azure CLI, `azd` and an Azure sign-in with Contributor on the subscription. From the repository root:

```bash
azd auth login
azd env new overlap --location swedencentral
azd provision
```

`azd provision` is safe to repeat: a second run with no changes reports "no changes to provision". The `.azure/`
folder it creates holds your local environment values and is git-ignored. To remove everything: `azd down --purge`
(only after judging, `specs/costs.md` §3).

