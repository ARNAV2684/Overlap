// functions.bicep — Functions apps
//
// Purpose: the Python Functions code on a dedicated plan with exactly one instance, as two apps: `live` runs the screen
//          relay alone; `insights` runs the archiver, the moment and recap triggers and the insights publisher
// Inputs:  location, name token, tags, the functions identity and every service endpoint from main.bicep
// Outputs: both app names
// Spec:    infra/specs/resources.md §2.6, infra/specs/security.md §1–§2, functions/specs/
//
// Both apps get the same package (functions/package.py) and each switches off the other's functions
// (AzureWebJobs.<name>.Disabled). Two apps means two Python worker processes: in one, the agents' work and the archiver
// held the relay to one core and it fell 80–120 s behind a 20x match (24 Oct). The relay stays in one process, so its
// per-match lock still keeps each match's envelopes in order. One instance, never scaled out (resources.md §2.6). Every
// connection signs in with the functions identity; no connection string or key is stored. The code is deployed
// separately (a zip with Linux packages, az functionapp deployment source config-zip, infra/README.md), so a
// provision never touches it.

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

@description('App Service plan SKU: B3 (4 cores, 7 GB) holds both apps and the MCP server processes of the agents at 20x.')
param planSku string = 'B3'

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

var relayFunctions = ['relay_events', 'relay_tracking', 'relay_tick']
var insightsFunctions = ['archive_events', 'archive_tracking', 'moment_trigger', 'recap_trigger', 'insights_publisher']
var appsToRun = [
  { name: 'func-overlap-${token}', service: 'functions', off: insightsFunctions }
  { name: 'func-overlap-insights-${token}', service: 'functions-insights', off: relayFunctions }
]

resource apps 'Microsoft.Web/sites@2024-04-01' = [for a in appsToRun: {
  name: a.name
  location: location
  tags: union(tags, { 'azd-service-name': a.service })
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
      appSettings: concat([
        { name: 'FUNCTIONS_EXTENSION_VERSION', value: '~4' }
        { name: 'FUNCTIONS_WORKER_RUNTIME', value: 'python' }
        // Run from the deployed zip (packages built for Linux beforehand, infra/README.md), mounted locally: from the
        // network share the agents' MCP server took over 4 s to import its packages and every card fell back (24 Oct)
        { name: 'WEBSITE_RUN_FROM_PACKAGE', value: '1' }
        { name: 'SCM_DO_BUILD_DURING_DEPLOYMENT', value: 'false' }
        // The relay, archiver and timers are synchronous and mostly wait on the network; the default pool (CPUs + 4,
        // so 6 on B2) queued relay batches behind archive batches during a 20x match
        { name: 'PYTHON_THREADPOOL_THREAD_COUNT', value: '16' }
        { name: 'APPLICATIONINSIGHTS_CONNECTION_STRING', value: appInsightsConnectionString }
        // One trace per card in Application Insights: every agent stage, model call and MCP call, no line text
        // (agents/specs/observability.md). Only the agents start tracing, so the relay app ignores it
        { name: 'OVERLAP_TRACING', value: 'azure' }
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
        // A fresh MCP server process per job needs 4-5 s to start on Azure under match load; its request timeout is
        // twice this (default 2 s), so 4 s lets it answer while the job stays inside its 15 s deadline
        { name: 'OVERLAP_MCP_TIMEOUT_S', value: '4' }
        // A 20x match makes about 40 moments; the default 12 model jobs capped the model-written share near 30%. About
        // $0.10-0.15 a match on gpt-5-mini; the $25 model budget still caps everything (agents/specs/workflow.md §3)
        { name: 'OVERLAP_MAX_MODEL_JOBS_PER_MATCH', value: '30' }
        { name: 'OVERLAP_MAX_CALLS_PER_MATCH', value: '300' }
        { name: 'OVERLAP_MAX_TOKENS_PER_MATCH', value: '900000' }
        // In-process MCP freed 4-5 s per job; 6 s lets the narrator, fact-checker and translator calls finish
        // (narrator p50 2.7 s, max 3.7 s on 25 Oct) while the 15 s job deadline still bounds every card
        { name: 'OVERLAP_MODEL_TIMEOUT_S', value: '6' }
        // Two jobs per match share one breaker. At 3 failures and 60 s it paused the model for most of a match on
        // 25 Oct (SYN-3012: 41 calls skipped as breaker_open); a real outage still pauses it after 5 (workflow.md §3)
        { name: 'OVERLAP_MODEL_BREAKER_FAILURES', value: '5' }
        { name: 'OVERLAP_MODEL_BREAKER_COOLDOWN_S', value: '20' }
      ], map(a.off, f => { name: 'AzureWebJobs.${f}.Disabled', value: 'true' }))
    }
  }
}]

output name string = apps[0].name
output insightsName string = apps[1].name
