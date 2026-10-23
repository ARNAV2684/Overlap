// event-hubs.bicep — Event Hubs namespace, hubs and consumer groups
//
// Purpose: the live pipe: match-events and match-tracking, 4 partitions each (key match_id, CONTRACTS.md §1.4), one
//          consumer group per reader, and who may send or receive
// Inputs:  location, name token, tags and principal ids from main.bicep
// Outputs: namespace name and fully qualified host name
// Spec:    infra/specs/resources.md §2.1, infra/specs/security.md §1, infra/specs/local-development.md §2
//
// Local (SAS key) auth is off: producers and consumers sign in with Entra ID. Standard tier, because Basic allows only
// $Default and each reader needs its own group.

@description('Azure region for the namespace.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to the namespace.')
param tags object

@description('Principal id of the Functions app identity (relay, archiver).')
param functionsPrincipalId string

@description('Principal id of the stats engine identity.')
param statsPrincipalId string

@description('Principal id of the generator identity.')
param generatorPrincipalId string

@description('Principal id of the developer running azd (empty to skip).')
param developerPrincipalId string = ''

@description('Principal type of the developer.')
@allowed([
  'User'
  'ServicePrincipal'
])
param developerPrincipalType string = 'User'

var hubNames = [
  'match-events'
  'match-tracking'
]
var consumerGroups = [
  'relay'
  'stats'
  'archiver'
]
var dataOwner = 'f526a384-b230-433a-b45c-95f59c4a2dec'
var dataReceiver = 'a638d3c7-ab3a-418d-83e6-5f17a39d4fde'
var dataSender = '2b629674-e913-4c01-ae53-ef4638d8f975'

resource namespace 'Microsoft.EventHub/namespaces@2024-01-01' = {
  name: 'evhns-overlap-${token}'
  location: location
  tags: tags
  sku: {
    name: 'Standard'
    tier: 'Standard'
    capacity: 1
  }
  properties: {
    disableLocalAuth: true
    isAutoInflateEnabled: false
    minimumTlsVersion: '1.2'
    publicNetworkAccess: 'Enabled'
  }
}

resource hubs 'Microsoft.EventHub/namespaces/eventhubs@2024-01-01' = [for h in hubNames: {
  parent: namespace
  name: h
  properties: {
    partitionCount: 4
    messageRetentionInDays: 1
  }
}]

// $Default exists on every hub; relay, stats and archiver each get their own group on both hubs
resource eventsGroups 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2024-01-01' = [for g in consumerGroups: {
  parent: hubs[0]
  name: g
}]

resource trackingGroups 'Microsoft.EventHub/namespaces/eventhubs/consumergroups@2024-01-01' = [for g in consumerGroups: {
  parent: hubs[1]
  name: g
}]

// Receivers on both hubs: the Functions app (relay, archiver) and the stats engine
resource functionsReceive 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (h, i) in hubNames: {
  name: guid(hubs[i].id, functionsPrincipalId, dataReceiver)
  scope: hubs[i]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataReceiver)
    principalId: functionsPrincipalId
    principalType: 'ServicePrincipal'
  }
}]

resource statsReceive 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (h, i) in hubNames: {
  name: guid(hubs[i].id, statsPrincipalId, dataReceiver)
  scope: hubs[i]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataReceiver)
    principalId: statsPrincipalId
    principalType: 'ServicePrincipal'
  }
}]

// The stats engine sends its stat panels on match-events
resource statsSend 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(hubs[0].id, statsPrincipalId, dataSender)
  scope: hubs[0]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataSender)
    principalId: statsPrincipalId
    principalType: 'ServicePrincipal'
  }
}

// The generator sends on both hubs
resource generatorSend 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for (h, i) in hubNames: {
  name: guid(hubs[i].id, generatorPrincipalId, dataSender)
  scope: hubs[i]
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataSender)
    principalId: generatorPrincipalId
    principalType: 'ServicePrincipal'
  }
}]

// Developer: send and receive on the whole namespace, for laptop runs against Azure
resource developer 'Microsoft.Authorization/roleAssignments@2022-04-01' = if (!empty(developerPrincipalId)) {
  name: guid(namespace.id, developerPrincipalId, dataOwner)
  scope: namespace
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', dataOwner)
    principalId: developerPrincipalId
    principalType: developerPrincipalType
  }
}

output name string = namespace.name
output fullyQualifiedNamespace string = '${namespace.name}.servicebus.windows.net'
