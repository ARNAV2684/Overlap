// container-apps.bicep — Container registry, Container Apps environment, the web app, the stats engine and the
//                        generator job
//
// Purpose: run the three containers: the public web app (the judging link), the always-on stats engine, and the
//          generator as a manual job that the web app's start button starts once per match
// Inputs:  location, name token, tags, the web, stats and generator identities, the service endpoints and the image
//          names from main.bicep
// Outputs: registry name and login server, web app URL, generator job id
// Spec:    infra/specs/resources.md §2.7–§2.9, infra/specs/security.md §1, §3; web/specs/realtime.md §8
//
// Images are pulled with each app's own identity (AcrPull, no admin user). Before the first image push the apps run a
// public placeholder image. With deployLive false (paused after A8) the stats engine and the generator job are not
// deployed and the web app scales to zero between visitors; replays keep working from Cosmos DB and Blob Storage.

@description('Azure region for every resource here.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to every resource here.')
param tags object

@description('The web, stats and generator identities: id, principalId, clientId.')
param webIdentity object
param statsIdentity object
param generatorIdentity object

@description('Log Analytics workspace name (container logs).')
param workspaceName string

@description('Deploy the stats engine and the generator job (false while paused).')
param deployLive bool = true

@description('Web app minimum replicas: 1 during a run, 0 while paused.')
param webMinReplicas int = 1

@description('Images; empty means the public placeholder (before the first push).')
param webImage string = ''
param statsImage string = ''
param generatorImage string = ''

@description('Service endpoints.')
param eventHubsNamespace string
param cosmosEndpoint string
param webPubSubEndpoint string
param archiveBlobEndpoint string

var placeholder = 'mcr.microsoft.com/k8se/quickstart:latest'
var acrPull = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' existing = {
  name: workspaceName
}

resource registry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'croverlap${token}'
  location: location
  tags: tags
  sku: {
    name: 'Basic'
  }
  properties: {
    adminUserEnabled: false
  }
}

resource pulls 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for p in [webIdentity, statsIdentity, generatorIdentity]: {
  name: guid(registry.id, p.principalId, acrPull)
  scope: registry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPull)
    principalId: p.principalId
    principalType: 'ServicePrincipal'
  }
}]

resource env 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'cae-overlap-${token}'
  location: location
  tags: tags
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: workspace.properties.customerId
        sharedKey: workspace.listKeys().primarySharedKey
      }
    }
    workloadProfiles: [
      {
        name: 'Consumption'
        workloadProfileType: 'Consumption'
      }
    ]
  }
}

func registryFor(image string, server string, identityId string) array => empty(image) ? [] : [
  {
    server: server
    identity: identityId
  }
]

// --- Web app: the public site and the judging link ---

resource web 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'ca-overlap-web'
  location: location
  tags: union(tags, { 'azd-service-name': 'web' })
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${webIdentity.id}': {}
    }
  }
  dependsOn: [pulls]
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      ingress: {
        external: true
        targetPort: empty(webImage) ? 80 : 3000
        transport: 'auto'
        allowInsecure: false
      }
      registries: registryFor(webImage, registry.properties.loginServer, webIdentity.id)
    }
    template: {
      containers: [
        {
          name: 'web'
          image: empty(webImage) ? placeholder : webImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID', value: webIdentity.clientId }
            { name: 'OVERLAP_COSMOS_ENDPOINT', value: cosmosEndpoint }
            { name: 'OVERLAP_COSMOS_DATABASE', value: 'live' }
            { name: 'OVERLAP_COSMOS_CONTAINER', value: 'screen' }
            { name: 'OVERLAP_WEBPUBSUB_ENDPOINT', value: webPubSubEndpoint }
            { name: 'OVERLAP_WEBPUBSUB_HUB', value: 'live' }
            { name: 'OVERLAP_ARCHIVE_BLOB_ENDPOINT', value: archiveBlobEndpoint }
            // The start button: present only while the generator job exists
            { name: 'OVERLAP_GENERATOR_JOB_ID', value: deployLive ? generatorJobId : '' }
          ]
        }
      ]
      scale: {
        minReplicas: webMinReplicas
        maxReplicas: 3
        rules: [
          {
            name: 'http'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
    }
  }
}

// --- Stats engine: always on during a run, exactly one replica (one reader per consumer group) ---

resource stats 'Microsoft.App/containerApps@2024-03-01' = if (deployLive) {
  name: 'ca-overlap-stats'
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${statsIdentity.id}': {}
    }
  }
  dependsOn: [pulls]
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      registries: registryFor(statsImage, registry.properties.loginServer, statsIdentity.id)
    }
    template: {
      containers: [
        {
          name: 'stats'
          image: empty(statsImage) ? placeholder : statsImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID', value: statsIdentity.clientId }
            { name: 'OVERLAP_EVENTHUBS_NAMESPACE', value: eventHubsNamespace }
            { name: 'OVERLAP_COSMOS_ENDPOINT', value: cosmosEndpoint }
            { name: 'OVERLAP_COSMOS_DATABASE', value: 'live' }
            { name: 'OVERLAP_CHECKPOINT_BLOB_ENDPOINT', value: archiveBlobEndpoint }
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 1
      }
    }
  }
}

// --- Generator: one execution plays one match; started by the web app (/api/start-match) ---

var generatorJobName = 'caj-overlap-generator'
var generatorJobId = resourceId('Microsoft.App/jobs', generatorJobName)

resource generator 'Microsoft.App/jobs@2024-03-01' = if (deployLive) {
  name: generatorJobName
  location: location
  tags: tags
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${generatorIdentity.id}': {}
    }
  }
  dependsOn: [pulls]
  properties: {
    environmentId: env.id
    workloadProfileName: 'Consumption'
    configuration: {
      triggerType: 'Manual'
      replicaTimeout: 1800
      replicaRetryLimit: 0
      manualTriggerConfig: {
        parallelism: 1
        replicaCompletionCount: 1
      }
      registries: registryFor(generatorImage, registry.properties.loginServer, generatorIdentity.id)
    }
    template: {
      containers: [
        {
          name: 'generator'
          image: empty(generatorImage) ? placeholder : generatorImage
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'AZURE_CLIENT_ID', value: generatorIdentity.clientId }
            { name: 'OVERLAP_EVENTHUBS_NAMESPACE', value: eventHubsNamespace }
          ]
        }
      ]
    }
  }
}

// The web app may start the job and read its executions, nothing else (security.md §3)
resource jobStarter 'Microsoft.Authorization/roleDefinitions@2022-04-01' = {
  name: guid(resourceGroup().id, 'overlap-generator-job-starter')
  properties: {
    roleName: 'Overlap generator job starter (${resourceGroup().name})'
    description: 'Start the generator Container Apps job and read its executions.'
    type: 'CustomRole'
    assignableScopes: [resourceGroup().id]
    permissions: [
      {
        actions: [
          'Microsoft.App/jobs/read'
          'Microsoft.App/jobs/start/action'
          'Microsoft.App/jobs/executions/read'
        ]
        notActions: []
      }
    ]
  }
}

resource webStartsJob 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (deployLive) {
  name: guid(generatorJobId, webIdentity.principalId, jobStarter.id)
  scope: generator
  properties: {
    roleDefinitionId: jobStarter.id
    principalId: webIdentity.principalId
    principalType: 'ServicePrincipal'
  }
}

output registryName string = registry.name
output registryServer string = registry.properties.loginServer
output webUrl string = 'https://${web.properties.configuration.ingress.fqdn}'
output generatorJobId string = deployLive ? generatorJobId : ''
