// main.bicep — Main template
//
// Purpose: create the resource group and compose every module into one deployment (azd provision / azd up)
// Inputs:  environment name, location and the deploying developer's principal id (main.parameters.json, from azd)
// Outputs: resource group, identity client ids, storage and monitoring endpoints (become azd environment values)
// Spec:    infra/specs/resources.md, infra/specs/security.md, infra/specs/costs.md
//
// Built sprint by sprint (plans/active/PLAN_infra_azure-pass.md). A0: identities, storage, monitoring. A1: Event Hubs.
// A2: Cosmos DB. Later sprints add Web PubSub, Foundry and Translator, the Functions app and Container Apps here.
// Key Vault is not deployed (resources.md §2.11). Budgets are on the subscription, outside this template (costs.md §1).

targetScope = 'subscription'

@minLength(1)
@maxLength(32)
@description('azd environment name; the resource group is rg-<name>.')
param environmentName string

@description('Azure region for every resource (resources.md §1).')
param location string = 'swedencentral'

@description('Principal id of the developer running azd, for laptop access to the data services.')
param principalId string = ''

@description('Principal type of principalId.')
@allowed([
  'User'
  'ServicePrincipal'
])
param principalType string = 'User'

var tags = {
  'azd-env-name': environmentName
  project: 'overlap'
}
var token = substring(uniqueString(subscription().id, environmentName, location), 0, 6)

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: 'rg-${environmentName}'
  location: location
  tags: tags
}

module identity 'modules/identity.bicep' = {
  name: 'identity'
  scope: rg
  params: {
    location: location
    tags: tags
  }
}

module monitoring 'modules/monitoring.bicep' = {
  name: 'monitoring'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
  }
}

module storage 'modules/storage.bicep' = {
  name: 'storage'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    functionsPrincipalId: identity.outputs.functions.principalId
    statsPrincipalId: identity.outputs.stats.principalId
    webPrincipalId: identity.outputs.web.principalId
    developerPrincipalId: principalId
    developerPrincipalType: principalType
  }
}

module eventHubs 'modules/event-hubs.bicep' = {
  name: 'event-hubs'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    functionsPrincipalId: identity.outputs.functions.principalId
    statsPrincipalId: identity.outputs.stats.principalId
    generatorPrincipalId: identity.outputs.generator.principalId
    developerPrincipalId: principalId
    developerPrincipalType: principalType
  }
}

module cosmos 'modules/cosmos.bicep' = {
  name: 'cosmos'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    functionsPrincipalId: identity.outputs.functions.principalId
    statsPrincipalId: identity.outputs.stats.principalId
    webPrincipalId: identity.outputs.web.principalId
    developerPrincipalId: principalId
  }
}

output AZURE_LOCATION string = location
output AZURE_RESOURCE_GROUP string = rg.name
output AZURE_FUNCTIONS_CLIENT_ID string = identity.outputs.functions.clientId
output AZURE_STATS_CLIENT_ID string = identity.outputs.stats.clientId
output AZURE_GENERATOR_CLIENT_ID string = identity.outputs.generator.clientId
output AZURE_WEB_CLIENT_ID string = identity.outputs.web.clientId
output AZURE_STORAGE_ACCOUNT string = storage.outputs.name
output OVERLAP_ARCHIVE_BLOB_ENDPOINT string = storage.outputs.blobEndpoint
output AZURE_LOG_ANALYTICS_WORKSPACE_ID string = monitoring.outputs.workspaceId
output OVERLAP_EVENTHUBS_NAMESPACE string = eventHubs.outputs.fullyQualifiedNamespace
output OVERLAP_COSMOS_ENDPOINT string = cosmos.outputs.endpoint
