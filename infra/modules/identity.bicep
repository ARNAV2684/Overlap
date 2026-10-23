// identity.bicep — Managed identities
//
// Purpose: one user-assigned managed identity per workload (functions, stats, generator, web)
// Inputs:  location, name token and tags from main.bicep
// Outputs: each identity's resource id, principal id and client id
// Spec:    infra/specs/security.md §1
//
// Role assignments live with the resource they grant access to (storage.bicep, and later event-hubs.bicep,
// cosmos.bicep, web-pubsub.bicep, foundry.bicep, container-apps.bicep), so each module owns its own access rules.

@description('Azure region for the identities.')
param location string

@description('Tags applied to every identity.')
param tags object

var workloads = [
  'functions'
  'stats'
  'generator'
  'web'
]

resource identities 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = [for w in workloads: {
  name: 'id-overlap-${w}'
  location: location
  tags: tags
}]

output functions object = {
  id: identities[0].id
  principalId: identities[0].properties.principalId
  clientId: identities[0].properties.clientId
}
output stats object = {
  id: identities[1].id
  principalId: identities[1].properties.principalId
  clientId: identities[1].properties.clientId
}
output generator object = {
  id: identities[2].id
  principalId: identities[2].properties.principalId
  clientId: identities[2].properties.clientId
}
output web object = {
  id: identities[3].id
  principalId: identities[3].properties.principalId
  clientId: identities[3].properties.clientId
}
