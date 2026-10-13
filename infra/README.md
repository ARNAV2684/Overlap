# Infrastructure

Bicep templates deployed with `azd up`, all in one resource group:

- Event Hubs namespace (Standard) with `match-events` and `match-tracking`, 4 partitions each
- Cosmos DB (NoSQL, database `live`, shared throughput)
- Web PubSub (hub `live`)
- Container Apps environment
- Functions app
- Microsoft Foundry project and model deployments
- Storage, Key Vault, Application Insights
- Managed identities for every service; no keys in code

Templates come once the Azure subscription, budgets and model quota are set up.
