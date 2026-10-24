// web-pubsub.bicep — Web PubSub service and hub
//
// Purpose: the broadcast tower: hub `live`, where the relay and the insights publisher send to groups and browsers
//          receive with short-lived, receive-only tokens from the web app
// Inputs:  location, name token, tags and principal ids from main.bicep
// Outputs: service name and endpoint
// Spec:    infra/specs/resources.md §2.4, infra/specs/security.md §1, §3, CONTRACTS.md §7
//
// Local (access key) auth is off: senders and the token issuer sign in with Entra ID. Standard S1, 1 unit (Free's
// 20,000 messages a day run out within a 20× match, and Free → Standard later means an IP change).

@description('Azure region for the service.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to the service.')
param tags object

@description('SKU name: Standard_S1 for real runs, Free_F1 only while paused.')
param skuName string = 'Standard_S1'

@description('Principal id of the Functions app identity (relay, insights publisher).')
param functionsPrincipalId string

@description('Principal id of the web app identity (client tokens).')
param webPrincipalId string

@description('Principal id of the developer running azd (empty to skip).')
param developerPrincipalId string = ''

@description('Principal type of the developer.')
@allowed([
  'User'
  'ServicePrincipal'
])
param developerPrincipalType string = 'User'

var serviceOwner = '12cf5a90-567b-43ae-8102-96cf46c7d9b4'

resource service 'Microsoft.SignalRService/webPubSub@2024-03-01' = {
  name: 'wps-overlap-${token}'
  location: location
  tags: tags
  sku: {
    name: skuName
    capacity: 1
  }
  properties: {
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    tls: {
      clientCertEnabled: false
    }
  }
}

// Browsers only receive; no event handlers, no anonymous connects
resource hub 'Microsoft.SignalRService/webPubSub/hubs@2024-03-01' = {
  parent: service
  name: 'live'
  properties: {
    anonymousConnectPolicy: 'deny'
    eventHandlers: []
  }
}

var owners = concat([
  { id: functionsPrincipalId, type: 'ServicePrincipal' }
  { id: webPrincipalId, type: 'ServicePrincipal' }
], empty(developerPrincipalId) ? [] : [
  { id: developerPrincipalId, type: developerPrincipalType }
])

resource ownerRoles 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for o in owners: {
  name: guid(service.id, o.id, serviceOwner)
  scope: service
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', serviceOwner)
    principalId: o.id
    principalType: o.type
  }
}]

output name string = service.name
output endpoint string = 'https://${service.properties.hostName}'
