// functions.bicep — Functions app
//
// Purpose: the Python Functions app that runs the relay, the archiver, the moment and recap triggers and the insights
//          publisher, on a dedicated plan with exactly one instance
// Inputs:  location, name token, tags, the functions identity and every service endpoint from main.bicep
// Outputs: app name and default host name
// Spec:    infra/specs/resources.md §2.6, infra/specs/security.md §1–§2, functions/specs/
//
// One instance, never scaled out: the relay keeps its per-match state in one process (resources.md §2.6). Every
// connection signs in with the functions identity; no connection string or key is stored. The code is deployed
// separately (functions/package.py, then `func azure functionapp publish`), so a provision never touches it.

@description('Azure region for the plan and app.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to the plan and app.')
param tags object

@description('The functions identity: id, principalId, clientId.')
param identity object

@description('Storage account for the Functions host (AzureWebJobsStorage, identity-based).')
param storageAccountName string

@description('Archive Blob endpoint (tracking chunks).')
param archiveBlobEndpoint string

@description('Event Hubs namespace host name (<name>.servicebus.windows.net).')
param eventHubsNamespace string

@description('Cosmos DB endpoint.')
param cosmosEndpoint string

@description('Web PubSub endpoint.')
param webPubSubEndpoint string

@description('Azure OpenAI endpoint and deployment; an empty deployment turns the model off (checked templates only).')
param openAiEndpoint string
param openAiDeployment string

@description('Translator endpoint (custom subdomain).')
param translatorEndpoint string

@description('Application Insights connection string.')
param appInsightsConnectionString string

@description('App Service plan SKU: B2 (2 cores) holds the relay and the agents at 20x.')
param planSku string = 'B2'

resource plan 'Microsoft.Web/serverfarms@2024-04-01' = {
  name: 'asp-overlap-${token}'
  location: location
  tags: tags
  kind: 'linux'
  sku: {
    name: planSku
    capacity: 1
  }
  properties: {
    reserved: true
  }
}

var identitySettings = {
  credential: 'managedidentity'
  clientId: identity.clientId
}

resource app 'Microsoft.Web/sites@2024-04-01' = {
  name: 'func-overlap-${token}'
  location: location
  tags: union(tags, { 'azd-service-name': 'functions' })
  kind: 'functionapp,linux'
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${identity.id}': {}
    }
  }
  properties: {
    serverFarmId: plan.id
    httpsOnly: true
    siteConfig: {
      linuxFxVersion: 'Python|3.12'
      alwaysOn: true
      minTlsVersion: '1.2'
      ftpsState: 'Disabled'
      appSettings: [
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'python' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'true' }
        // The relay, archiver and timers are synchronous and mostly wait on the network; the default pool (CPUs + 4,
        // so 6 on B2) queued relay batches behind archive batches during a 20x match
        { name: 'PYTHON_THREADPOOL_THREAD_COUNT', value: '16' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        { name: 'AZURE_CLIENT_ID', value: identity.clientId }
        // Host storage and trigger connections, identity-based (no keys)
        { name: 'AzureWebJobsStorage__accountName', value: storageAccountName }
        { name: 'AzureWebJobsStorage__credential', value: identitySettings.credential }
        { name: 'AzureWebJobsStorage__clientId', value: identitySettings.clientId }
        { name: 'EVENTHUBS__fullyQualifiedNamespace', value: eventHubsNamespace }
        { name: 'EVENTHUBS__credential', value: identitySettings.credential }
        { name: 'EVENTHUBS__clientId', value: identitySettings.clientId }
        { name: 'COSMOS__accountEndpoint', value: cosmosEndpoint }
        { name: 'COSMOS__credential', value: identitySettings.credential }
        { name: 'COSMOS__clientId', value: identitySettings.clientId }
        // The code's own settings (functions/local.settings.example.json lists the local equivalents)
        { name: 'OVERLAP_EVENTS_HUB', value: 'match-events' }
        { name: 'OVERLAP_TRACKING_HUB', value: 'match-tracking' }
        { name: 'OVERLAP_RELAY_CONSUMER_GROUP', value: 'relay' }
        { name: 'OVERLAP_ARCHIVER_CONSUMER_GROUP', value: 'archiver' }
        { name: 'OVERLAP_ARCHIVE_BLOB_ENDPOINT', value: archiveBlobEndpoint }
        { name: 'OVERLAP_COSMOS_ENDPOINT', value: cosmosEndpoint }
        { name: 'OVERLAP_COSMOS_DATABASE', value: 'live' }
        { name: 'OVERLAP_COSMOS_CONTAINER', value: 'screen' }
        { name: 'OVERLAP_WEBPUBSUB_ENDPOINT', value: webPubSubEndpoint }
        { name: 'OVERLAP_WEBPUBSUB_HUB', value: 'live' }
        { name: 'OVERLAP_MODEL_PROVIDER', value: empty(openAiDeployment) ? 'off' : 'azure' }
        { name: 'OVERLAP_AZURE_OPENAI_ENDPOINT', value: openAiEndpoint }
        { name: 'OVERLAP_AZURE_OPENAI_DEPLOYMENT', value: openAiDeployment }
        // In-region calls with minimal reasoning stay inside the 4 s request timeout (agents/specs/workflow.md §3)
        { name: 'OVERLAP_REASONING_EFFORT', value: 'minimal' }
        { name: 'OVERLAP_TRANSLATOR', value: 'azure' }
        { name: 'OVERLAP_TRANSLATOR_ENDPOINT', value: translatorEndpoint }
        { name: 'OVERLAP_MCP_SOURCE', value: 'cosmos' }
      ]
    }
  }
}

output name string = app.name
output hostName string = app.properties.defaultHostName
