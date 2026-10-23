// cosmos.bicep — Cosmos DB account, database and containers
//
// Purpose: the free-tier NoSQL account, database `live` with shared throughput, every container the services use,
//          and who may read or write them
// Inputs:  location, name token, tags and principal ids from main.bicep
// Outputs: account name and endpoint
// Spec:    infra/specs/resources.md §2.3, infra/specs/security.md §1, CONTRACTS.md §4, archiver/specs/storage.md
//
// Local (key) auth is off, so the services cannot create containers: every container is created here. Data access
// uses Cosmos DB's own SQL role assignments (not Azure RBAC), scoped to the database.

@description('Azure region for the account.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to the account.')
param tags object

@description('Principal id of the Functions app identity (relay, archiver, agents, MCP server).')
param functionsPrincipalId string

@description('Principal id of the stats engine identity.')
param statsPrincipalId string

@description('Principal id of the web app identity (read only).')
param webPrincipalId string

@description('Principal id of the developer running azd (empty to skip).')
param developerPrincipalId string = ''

@description('Shared throughput for database live in RU/s (the free tier covers 1,000).')
param throughput int = 1000

var matchContainers = [
  'screen'
  'matches'
  'events'
  'stats'
  'match_state'
  'moments'
  'overlays'
]
var dataReader = '00000000-0000-0000-0000-000000000001'
var dataContributor = '00000000-0000-0000-0000-000000000002'

resource account 'Microsoft.DocumentDB/databaseAccounts@2024-11-15' = {
  name: 'cosmos-overlap-${token}'
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    enableFreeTier: true
    disableLocalAuth: true
    minimalTlsVersion: 'Tls12'
    publicNetworkAccess: 'Enabled'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-11-15' = {
  parent: account
  name: 'live'
  properties: {
    resource: {
      id: 'live'
    }
    options: {
      throughput: throughput
    }
  }
}

resource containers 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = [for c in matchContainers: {
  parent: database
  name: c
  properties: {
    resource: {
      id: c
      partitionKey: {
        paths: [
          '/match_id'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}]

// The Functions runtime's lease container for the change-feed triggers (moment_trigger, recap_trigger)
resource leases 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-11-15' = {
  parent: database
  name: 'leases'
  properties: {
    resource: {
      id: 'leases'
      partitionKey: {
        paths: [
          '/id'
        ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

var databaseScope = '${account.id}/dbs/live'
var writers = concat([
  functionsPrincipalId
  statsPrincipalId
], empty(developerPrincipalId) ? [] : [
  developerPrincipalId
])

resource writerRoles 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = [for p in writers: {
  parent: account
  name: guid(databaseScope, p, dataContributor)
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataContributor}'
    principalId: p
    scope: databaseScope
  }
  dependsOn: [
    database
  ]
}]

resource webReader 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-11-15' = {
  parent: account
  name: guid(databaseScope, webPrincipalId, dataReader)
  properties: {
    roleDefinitionId: '${account.id}/sqlRoleDefinitions/${dataReader}'
    principalId: webPrincipalId
    scope: databaseScope
  }
  dependsOn: [
    database
  ]
}

output name string = account.name
output endpoint string = account.properties.documentEndpoint
