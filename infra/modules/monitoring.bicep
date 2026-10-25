// monitoring.bicep — Log Analytics, Application Insights and the alerts on them
//
// Purpose: one Log Analytics workspace (Container Apps logs), workspace-based Application Insights (Functions apps),
//          and, when a contact email is given, alerts by email when the Functions fail, the model breaker keeps
//          opening, or most cards expire
// Inputs:  location, name token and tags from main.bicep; the alert contact (the budget contact)
// Outputs: workspace id and customer id; Application Insights id and connection string
// Spec:    infra/specs/resources.md §2.8, infra/specs/costs.md §2
//
// The daily cap keeps a runaway log loop from costing more than about $1.15 a day. The Application Insights
// connection string identifies where telemetry goes; it is not a credential (the repository never holds it anyway).
// The alerts read Application Insights, which stays while the pipeline is paused; with nothing running they never
// fire.

@description('Azure region for monitoring.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to every monitoring resource.')
param tags object

@description('Log Analytics daily ingestion cap in GB.')
param dailyQuotaGb string = '0.5'

@description('Email for the alerts (empty to skip them). The budget contact, kept out of the repository.')
param alertEmail string = ''

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

// --- Alerts (infra/specs/resources.md §2.8) ---------------------------------------------------------------------

var alertsOn = !empty(alertEmail)

resource alertGroup 'Microsoft.Insights/actionGroups@2023-01-01' = if (alertsOn) {
  name: 'ag-overlap-${token}'
  location: 'Global'
  tags: tags
  properties: {
    groupShortName: 'overlap'
    enabled: true
    emailReceivers: [
      {
        name: 'contact'
        emailAddress: alertEmail
        useCommonAlertSchema: true
      }
    ]
  }
}

// Each alert counts rows in Application Insights over its window and emails once when the count passes the threshold
var alertRules = [
  {
    name: 'functions-failing'
    severity: 2
    description: 'Function runs are failing (relay, archiver, moment trigger, recap trigger or publisher).'
    query: 'requests | where cloud_RoleName startswith "func-overlap" and success == false'
    threshold: 3
    window: 'PT5M'
  }
  {
    name: 'model-breaker-open'
    severity: 3
    description: 'The model breaker keeps opening: model calls are being skipped and cards fall back to templates.'
    query: 'dependencies | where name startswith "overlap.model_call" and tostring(customDimensions["overlap.reason"]) == "breaker_open"'
    threshold: 10
    window: 'PT10M'
  }
  {
    name: 'cards-expiring'
    severity: 3
    description: 'Most cards are expiring before they are shown (more expired than sent over 15 minutes).'
    // The publisher logs its totals as a Python dict: "insights publisher: {'sent': 3, 'expired': 1}"
    query: 'traces | where message startswith "insights publisher:" | extend t = parse_json(replace_string(substring(message, 20), "\'", \'"\')) | summarize sent = sum(toint(t.sent)), expired = sum(toint(t.expired)) | where expired >= 20 and expired > sent'
    threshold: 0
    window: 'PT15M'
  }
]

resource alerts 'Microsoft.Insights/scheduledQueryRules@2023-12-01' = [for r in alertRules: if (alertsOn) {
  name: 'alert-overlap-${r.name}-${token}'
  location: location
  tags: tags
  kind: 'LogAlert'
  properties: {
    displayName: 'Overlap: ${r.name}'
    description: r.description
    severity: r.severity
    enabled: true
    scopes: [
      appInsights.id
    ]
    evaluationFrequency: 'PT5M'
    windowSize: r.window
    criteria: {
      allOf: [
        {
          query: r.query
          timeAggregation: 'Count'
          operator: 'GreaterThan'
          threshold: r.threshold
          failingPeriods: {
            numberOfEvaluationPeriods: 1
            minFailingPeriodsToAlert: 1
          }
        }
      ]
    }
    autoMitigate: true
    actions: {
      actionGroups: [
        alertGroup.id
      ]
    }
  }
}]

output workspaceId string = workspace.id
output workspaceName string = workspace.name
output workspaceCustomerId string = workspace.properties.customerId
output appInsightsId string = appInsights.id
output appInsightsConnectionString string = appInsights.properties.ConnectionString
