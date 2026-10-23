// monitoring.bicep — Log Analytics and Application Insights
//
// Purpose: one Log Analytics workspace (Container Apps logs) and workspace-based Application Insights (Functions app)
// Inputs:  location, name token and tags from main.bicep
// Outputs: workspace id and customer id; Application Insights id and connection string
// Spec:    infra/specs/resources.md §2.8, infra/specs/costs.md §2
//
// The daily cap keeps a runaway log loop from costing more than about $1.15 a day. The Application Insights
// connection string identifies where telemetry goes; it is not a credential (the repository never holds it anyway).

@description('Azure region for monitoring.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to every monitoring resource.')
param tags object

@description('Log Analytics daily ingestion cap in GB.')
param dailyQuotaGb string = '0.5'

resource workspace 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'log-overlap-${token}'
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
    workspaceCapping: {
      dailyQuotaGb: json(dailyQuotaGb)
    }
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: 'appi-overlap-${token}'
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: workspace.id
  }
}

output workspaceId string = workspace.id
output workspaceCustomerId string = workspace.properties.customerId
output appInsightsId string = appInsights.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
