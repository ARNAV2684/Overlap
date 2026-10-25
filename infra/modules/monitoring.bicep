// monitoring.bicep — Log Analytics, Application Insights and the alerts on them
//
// Purpose: one Log Analytics workspace (Container Apps logs), workspace-based Application Insights (Functions apps),
//          a workbook "Overlap live run" (cards, function runs, relay and archiver batch time, agents, model calls,
//          MCP calls), and, when a contact email is given, alerts by email when the Functions fail, the model breaker
//          keeps opening, or most cards expire
// Inputs:  location, name token and tags from main.bicep; the alert contact (the budget contact)
// Outputs: workspace id and customer id; Application Insights id and connection string; the workbook's id
// Spec:    infra/specs/resources.md §2.8, infra/specs/costs.md §2
//
// The daily cap keeps a runaway log loop from costing more than about $1.15 a day. The Application Insights
// connection string identifies where telemetry goes; it is not a credential (the repository never holds it anyway).
// The alerts read Application Insights, which stays while the pipeline is paused; with nothing running they never
// fire. The Functions host samples telemetry adaptively (host.json sets no samplingSettings, so its defaults apply:
// requests are never sampled, traces and dependencies are under load). The function-failure panel and alert are
// exact; card counts, agent spans and model calls can undercount at 20x, so read them as rates and shares.

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

// --- Workbook: one page for a live run (infra/specs/resources.md §2.8) ---------------------------------------------

// Every panel reads Application Insights for the chosen time range: the Functions host's requests, the agents' spans
// (dependencies, agents/specs/observability.md) and the publisher's log line. Reader lag is not logged; the relay and
// archiver batch times show whether they keep up.
var panels = [
  {
    title: 'Cards sent and expired per minute'
    query: 'traces | where message startswith "insights publisher:" | extend t = parse_json(replace_string(substring(message, 20), "\'", \'"\')) | summarize sent = sum(toint(t.sent)), expired = sum(toint(t.expired)) by bin(timestamp, 1m) | order by timestamp asc'
    visualization: 'timechart'
  }
  {
    title: 'Cards written by the model: jobs by match'
    query: 'dependencies | where name startswith "overlap.job" | extend match = tostring(customDimensions["overlap.match_id"]), verified = tolower(tostring(customDimensions["overlap.verified"])) == "true", fallback = tolower(tostring(customDimensions["overlap.fallback"])) == "true" | summarize jobs = count(), model_written = countif(verified and not(fallback)) by match | extend share_pct = round(100.0 * model_written / jobs, 1) | order by match desc'
    visualization: 'table'
  }
  {
    title: 'Function runs and failures'
    query: 'requests | where cloud_RoleName startswith "func-overlap" | summarize runs = count(), failed = countif(success == false), p50_ms = round(percentile(duration, 50)), p95_ms = round(percentile(duration, 95)) by app = cloud_RoleName, function = operation_Name | order by runs desc'
    visualization: 'table'
  }
  {
    title: 'Relay and archiver batch time, p95 (ms): do they keep up?'
    query: 'requests | where operation_Name in ("relay_events", "relay_tracking", "relay_tick", "archive_events", "archive_tracking") | summarize p95_ms = percentile(duration, 95) by operation_Name, bin(timestamp, 1m) | order by timestamp asc'
    visualization: 'timechart'
  }
  {
    title: 'Agent stage time (ms)'
    query: 'dependencies | where name startswith "overlap.stage" | summarize n = count(), p50_ms = round(percentile(duration, 50)), p95_ms = round(percentile(duration, 95)) by agent = tostring(customDimensions["overlap.agent"]) | order by p95_ms desc'
    visualization: 'table'
  }
  {
    title: 'Model calls by agent and outcome (breaker_open means skipped)'
    query: 'dependencies | where name startswith "overlap.model_call" | extend agent = tostring(customDimensions["overlap.agent"]), outcome = iff(tolower(tostring(customDimensions["overlap.ok"])) == "true", "ok", tostring(customDimensions["overlap.reason"])) | summarize calls = count() by agent, outcome | order by agent asc, calls desc'
    visualization: 'table'
  }
  {
    title: 'MCP tool calls by the analyst'
    query: 'dependencies | where name startswith "overlap.tool_call" | summarize calls = count(), not_ok = countif(tostring(customDimensions["overlap.tool.status"]) != "ok"), p95_ms = round(percentile(duration, 95)) by tool = tostring(customDimensions["gen_ai.tool.name"]) | order by calls desc'
    visualization: 'table'
  }
  {
    title: 'Exceptions'
    query: 'exceptions | summarize n = count() by app = cloud_RoleName, type, problem = problemId | order by n desc | take 20'
    visualization: 'table'
  }
]

var workbookItems = concat([
  {
    type: 1
    name: 'intro'
    content: {
      json: '## Overlap live run\nCards, Functions, the relay and archiver, the seven agents, model and MCP calls, for the time range below. Pick the range that covers the match. Card counts come from the publisher; everything else from the Functions host and the agents\' traces (`agents/specs/observability.md`).'
    }
  }
  {
    type: 9
    name: 'parameters'
    content: {
      version: 'KqlParameterItem/1.0'
      parameters: [
        {
          id: 'time-range'
          version: 'KqlParameterItem/1.0'
          name: 'TimeRange'
          label: 'Time range'
          type: 4
          isRequired: true
          value: {
            durationMs: 3600000
          }
          typeSettings: {
            selectableValues: [
              { durationMs: 900000 }
              { durationMs: 3600000 }
              { durationMs: 14400000 }
              { durationMs: 86400000 }
              { durationMs: 604800000 }
            ]
            allowCustom: true
          }
        }
      ]
    }
  }
], map(range(0, length(panels)), i => {
  type: 3
  name: 'panel-${i}'
  content: {
    version: 'KqlItem/1.0'
    title: panels[i].title
    query: panels[i].query
    size: 0
    timeContextFromParameter: 'TimeRange'
    queryType: 0
    resourceType: 'microsoft.insights/components'
    visualization: panels[i].visualization
  }
}))

resource workbook 'Microsoft.Insights/workbooks@2023-06-01' = {
  name: guid(resourceGroup().id, 'overlap-live-run-workbook')
  location: location
  tags: tags
  kind: 'shared'
  properties: {
    displayName: 'Overlap live run'
    category: 'workbook'
    sourceId: appInsights.id
    version: 'Notebook/1.0'
    serializedData: string({
      version: 'Notebook/1.0'
      items: workbookItems
      fallbackResourceIds: [
        appInsights.id
      ]
      '$schema': 'https://github.com/Microsoft/Application-Insights-Workbooks/blob/master/schema/workbook.json'
    })
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

// Each alert counts rows in Application Insights over its window and emails once when the count is greater than the
// threshold, so a threshold of 2 means "3 or more"
var alertRules = [
  {
    name: 'functions-failing'
    severity: 2
    description: 'Function runs are failing (relay, archiver, moment trigger, recap trigger or publisher).'
    query: 'requests | where cloud_RoleName startswith "func-overlap" and success == false'
    threshold: 2                     // 3 or more failed runs (requests are never sampled)
    window: 'PT5M'
  }
  {
    name: 'model-breaker-open'
    severity: 3
    description: 'The model breaker keeps opening: model calls are being skipped and cards fall back to templates.'
    query: 'dependencies | where name startswith "overlap.model_call" and tostring(customDimensions["overlap.reason"]) == "breaker_open"'
    threshold: 9                     // 10 or more skipped calls (dependencies can be sampled: a floor, not a count)
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
output workbookId string = workbook.id
