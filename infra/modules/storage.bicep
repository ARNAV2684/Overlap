// storage.bicep — Storage account
//
// Purpose: the storage account for archived tracking chunks, the stats engine's checkpoints and the Functions host
// Inputs:  location, name token, tags and principal ids from main.bicep
// Outputs: account name and Blob endpoint
// Spec:    infra/specs/resources.md §2.2, infra/specs/security.md §1–§2
//
// Shared-key access is off: every reader and writer signs in with Entra ID. The Functions host creates its own
// azure-webjobs-* containers, which is why it gets Blob Data Owner on the account.

@description('Azure region for the account.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to the account.')
param tags object

@description('Principal id of the Functions app identity.')
param functionsPrincipalId string

@description('Principal id of the stats engine identity.')
param statsPrincipalId string

@description('Principal id of the web app identity.')
param webPrincipalId string

@description('Principal id of the developer running azd (empty to skip).')
param developerPrincipalId string = ''

@description('Principal type of the developer (User for a person, ServicePrincipal for automation).')
@allowed([
  'User'
  'ServicePrincipal'
])
param developerPrincipalType string = 'User'

var blobDataOwner = 'b7e6dc6d-f1e8-4753-8033-0f276bb0955b'
var blobDataContributor = 'ba92f5b4-2d11-453d-a403-e96b0029c9fe'
var blobDataReader = '2a2b9908-6ea1-4ae2-8e65-a410df84e7d1'

resource account 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'stoverlap${token}'
  location: location
  tags: tags
  kind: 'StorageV2'
  sku: {
    name: 'Standard_LRS'
  }
  properties: {
    accessTier: 'Hot'
    allowSharedKeyAccess: false
    allowBlobPublicAccess: false
    defaultToOAuthAuthentication: true
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    publicNetworkAccess: 'Enabled'
  }
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-05-01' = {
  parent: account
  name: 'default'
}

resource tracking 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'tracking'
  properties: {
    publicAccess: 'None'
  }
}

resource statsCheckpoints 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'stats-checkpoints'
  properties: {
    publicAccess: 'None'
  }
}

// Functions host: its own containers for triggers, timers and Event Hubs checkpoints
resource functionsHost 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(account.id, functionsPrincipalId, blobDataOwner)
  scope: account
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataOwner)
    principalId: functionsPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Archiver (in the Functions app) writes tracking chunks
resource functionsTracking 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(tracking.id, functionsPrincipalId, blobDataContributor)
  scope: tracking
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
    principalId: functionsPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Stats engine saves its reading positions
resource statsCheckpointWriter 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(statsCheckpoints.id, statsPrincipalId, blobDataContributor)
  scope: statsCheckpoints
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
    principalId: statsPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Web app reads tracking chunks for replays
resource webTracking 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(tracking.id, webPrincipalId, blobDataReader)
  scope: tracking
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataReader)
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Durable web admission state is separate from read-only match/tracking archives.
resource matchControl 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-05-01' = {
  parent: blobService
  name: 'match-control'
  properties: { publicAccess: 'None' }
}
resource webStartControl 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(matchControl.id, webPrincipalId, blobDataContributor)
  scope: matchControl
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
    principalId: webPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// Developer: laptop services run against Azure with their own sign-in
resource developer 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(developerPrincipalId)) {
  name: guid(account.id, developerPrincipalId, blobDataContributor)
  scope: account
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', blobDataContributor)
    principalId: developerPrincipalId
    principalType: developerPrincipalType
  }
}

output name string = account.name
output blobEndpoint string = account.properties.primaryEndpoints.blob
