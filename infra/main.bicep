// main.bicep — Main template
//
// Purpose: create the resource group and compose every module into one deployment (azd provision / azd up)
// Inputs:  environment name, location and the deploying developer's principal id (main.parameters.json, from azd)
// Outputs: resource group, identity client ids, storage and monitoring endpoints (become azd environment values)
// Spec:    infra/specs/resources.md, infra/specs/security.md, infra/specs/costs.md
//
// Built sprint by sprint (plans/active/PLAN_infra_azure-pass.md). A0: identities, storage, monitoring. A1: Event Hubs.
// A2: Cosmos DB. A3: Web PubSub. A4, A5: Foundry (model) and Translator. Wave 2: the Functions app and Container Apps.
// LIVE_PIPELINE=false (paused after A8) leaves out everything billed by the hour: Event Hubs, the Functions plan, the
// stats engine and the generator job. azd provision never deletes, so pausing also deletes those resources by hand
// (infra/README.md); the flag keeps the next provision from bringing them back.
// Key Vault is not deployed (resources.md §2.11). The overall budgets are on the subscription, outside this template;
// the $25 model budget is in foundry.bicep (costs.md §1).

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

@description('Email for the model budget alerts; set in the azd environment (BUDGET_CONTACT_EMAIL), never in the repo.')
param budgetContactEmail string = ''

@description('Deploy the model: "true", or "false" while paused after A8 (cards fall back to checked templates).')
@allowed([
  'true'
  'false'
])
param deployModel string = 'true'

@description('Web PubSub SKU: Standard_S1 for real runs, Free_F1 while paused.')
param webPubSubSku string = 'Standard_S1'

@description('Run the live pipeline: "true", or "false" while paused (no Event Hubs, Functions, stats or generator).')
@allowed([
  'true'
  'false'
])
param livePipeline string = 'true'

@description('Web app minimum replicas: "1" during a run, "0" while paused (first visit then waits for a cold start).')
@allowed([
  '0'
  '1'
])
param webMinReplicas string = '1'

@description('Cosmos DB shared RU/s: "4000" during a live run (about $0.24 an hour above the free 1,000), "1000" otherwise.')
param cosmosThroughput string = '1000'

@description('Container images (<registry>/<name>:<tag>); empty runs the public placeholder until the first push.')
param webImage string = ''
param statsImage string = ''
param generatorImage string = ''

var tags = {
  'azd-env-name': environmentName
  project: 'overlap'
}
var token = substring(uniqueString(subscription().id, environmentName, location), 0, 6)
var live = livePipeline == 'true'
var eventHubsNamespace = 'evhns-overlap-${token}.servicebus.windows.net'

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
    alertEmail: budgetContactEmail
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

module eventHubs 'modules/event-hubs.bicep' = if (live) {
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
    throughput: int(cosmosThroughput)
  }
}

module webPubSub 'modules/web-pubsub.bicep' = {
  name: 'web-pubsub'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    skuName: webPubSubSku
    functionsPrincipalId: identity.outputs.functions.principalId
    webPrincipalId: identity.outputs.web.principalId
    developerPrincipalId: principalId
    developerPrincipalType: principalType
  }
}

module foundry 'modules/foundry.bicep' = {
  name: 'foundry'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    deployModel: deployModel == 'true'
    functionsPrincipalId: identity.outputs.functions.principalId
    developerPrincipalId: principalId
    developerPrincipalType: principalType
    budgetContactEmail: budgetContactEmail
  }
}

module functions 'modules/functions.bicep' = if (live) {
  name: 'functions'
  scope: rg
  dependsOn: [eventHubs]
  params: {
    location: location
    token: token
    tags: tags
    identity: identity.outputs.functions
    storageAccountName: storage.outputs.name
    archiveBlobEndpoint: storage.outputs.blobEndpoint
    eventHubsNamespace: eventHubsNamespace
    cosmosEndpoint: cosmos.outputs.endpoint
    webPubSubEndpoint: webPubSub.outputs.endpoint
    openAiEndpoint: foundry.outputs.openAiEndpoint
    openAiDeployment: deployModel == 'true' ? foundry.outputs.deployment : ''
    translatorEndpoint: foundry.outputs.translatorEndpoint
    appInsightsConnectionString: monitoring.outputs.appInsightsConnectionString
  }
}

module containerApps 'modules/container-apps.bicep' = {
  name: 'container-apps'
  scope: rg
  params: {
    location: location
    token: token
    tags: tags
    webIdentity: identity.outputs.web
    statsIdentity: identity.outputs.stats
    generatorIdentity: identity.outputs.generator
    workspaceName: monitoring.outputs.workspaceName
    deployLive: live
    webMinReplicas: int(webMinReplicas)
    webImage: webImage
    statsImage: statsImage
    generatorImage: generatorImage
    eventHubsNamespace: eventHubsNamespace
    cosmosEndpoint: cosmos.outputs.endpoint
    webPubSubEndpoint: webPubSub.outputs.endpoint
    archiveBlobEndpoint: storage.outputs.blobEndpoint
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
output OVERLAP_EVENTHUBS_NAMESPACE string = live ? eventHubsNamespace : ''
output OVERLAP_COSMOS_ENDPOINT string = cosmos.outputs.endpoint
output OVERLAP_WEBPUBSUB_ENDPOINT string = webPubSub.outputs.endpoint
output OVERLAP_AZURE_OPENAI_ENDPOINT string = foundry.outputs.openAiEndpoint
output OVERLAP_AZURE_OPENAI_DEPLOYMENT string = foundry.outputs.deployment
output OVERLAP_TRANSLATOR_ENDPOINT string = foundry.outputs.translatorEndpoint
output AZURE_CONTAINER_REGISTRY_NAME string = containerApps.outputs.registryName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = containerApps.outputs.registryServer
output AZURE_FUNCTIONS_APP_NAME string = live ? 'func-overlap-${token}' : ''
output AZURE_FUNCTIONS_INSIGHTS_APP_NAME string = live ? 'func-overlap-insights-${token}' : ''
output OVERLAP_WEB_URL string = containerApps.outputs.webUrl
output OVERLAP_GENERATOR_JOB_ID string = containerApps.outputs.generatorJobId
