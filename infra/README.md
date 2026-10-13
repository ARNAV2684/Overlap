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
| `modules/storage.bicep` | Checkpoints, tracking chunks, seasons |
| `modules/key-vault.bicep` | Key Vault |
| `modules/monitoring.bicep` | Application Insights and Log Analytics |
| `modules/identity.bicep` | Managed identities and role assignments |

The `azd` project file is [`azure.yaml`](../azure.yaml) at the repo root.
