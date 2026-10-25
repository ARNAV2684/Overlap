// foundry.bicep — Microsoft Foundry (model) and Azure AI Translator
//
// Purpose: the AI Services account with a Foundry project and the GPT mini deployment that writes the cards; the
//          free-tier Translator for es / hi / fr; who may call them; the $25 model budget
// Inputs:  location, name token, tags, principal ids and the budget contact from main.bicep
// Outputs: OpenAI endpoint, deployment name, Translator endpoint
// Spec:    infra/specs/resources.md §2.9–§2.10, infra/specs/security.md §1, infra/specs/costs.md §1
//
// Both accounts have a custom subdomain (needed for Entra sign-in) and local (key) auth off. Spending on the model is
// capped in code (the agents' budget settings) and by the deployment's capacity; the budget here only alerts.

@description('Azure region for both accounts.')
param location string

@description('Short unique suffix for globally unique names.')
param token string

@description('Tags applied to every resource.')
param tags object

@description('Model name (resources.md §2.9).')
param modelName string = 'gpt-5-mini'

@description('Model version.')
param modelVersion string = '2025-08-07'

@description('Global Standard capacity in thousands of tokens per minute.')
param capacity int = 100

@description('Set false to remove the model deployment (pause after A8): cards fall back to checked templates.')
param deployModel bool = true

@description('Principal id of the Functions app identity (agents).')
param functionsPrincipalId string

@description('Principal id of the developer running azd (empty to skip).')
param developerPrincipalId string = ''

@description('Principal type of the developer.')
@allowed([
  'User'
  'ServicePrincipal'
])
param developerPrincipalType string = 'User'

@description('Email for the model budget alerts (empty to skip the budget). Kept out of the repository.')
param budgetContactEmail string = ''

@description('First day of the budget period (YYYY-MM-01).')
param budgetStart string = '2026-10-01'

var openAiUser = '5e0bd9bd-7b93-4f28-af87-19fc36ad61bd'
var cognitiveUser = 'a97b65f3-24c7-4388-baec-2e87135dc908'

resource ai 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'aif-overlap-${token}'
  location: location
  tags: tags
  kind: 'AIServices'
  sku: {
    name: 'S0'
  }
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    customSubDomainName: 'aif-overlap-${token}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
    allowProjectManagement: true
  }
}

resource project 'Microsoft.CognitiveServices/accounts/projects@2025-06-01' = {
  parent: ai
  name: 'overlap'
  location: location
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    displayName: 'Overlap'
    description: 'Seven agents that explain a live synthetic football match'
  }
}

resource model 'Microsoft.CognitiveServices/accounts/deployments@2025-06-01' = if (deployModel) {
  parent: ai
  name: modelName
  sku: {
    name: 'GlobalStandard'
    capacity: capacity
  }
  properties: {
    model: {
      format: 'OpenAI'
      name: modelName
      version: modelVersion
    }
    versionUpgradeOption: 'NoAutoUpgrade'
  }
  dependsOn: [
    project
  ]
}

resource translator 'Microsoft.CognitiveServices/accounts@2025-06-01' = {
  name: 'trsl-overlap-${token}'
  location: location
  tags: tags
  kind: 'TextTranslation'
  sku: {
    name: 'F0'
  }
  properties: {
    customSubDomainName: 'trsl-overlap-${token}'
    disableLocalAuth: true
    publicNetworkAccess: 'Enabled'
  }
}

var callers = concat([
  { id: functionsPrincipalId, type: 'ServicePrincipal' }
], empty(developerPrincipalId) ? [] : [
  { id: developerPrincipalId, type: developerPrincipalType }
])

resource modelCallers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for c in callers: {
  name: guid(ai.id, c.id, openAiUser)
  scope: ai
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', openAiUser)
    principalId: c.id
    principalType: c.type
  }
}]

resource translatorCallers 'Microsoft.Authorization/roleAssignments@2022-04-01' = [for c in callers: {
  name: guid(translator.id, c.id, cognitiveUser)
  scope: translator
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', cognitiveUser)
    principalId: c.id
    principalType: c.type
  }
}]

// $25 model cap: alerts at 50 / 80 / 100 % of actual cost on the AI Services account
resource modelBudget 'Microsoft.Consumption/budgets@2023-11-01' = if (!empty(budgetContactEmail)) {
  name: 'overlap-model-budget-025'
  properties: {
    category: 'Cost'
    amount: 25
    timeGrain: 'Quarterly'
    timePeriod: {
      startDate: budgetStart
      endDate: '2027-03-31'
    }
    filter: {
      dimensions: {
        name: 'ResourceId'
        operator: 'In'
        values: [
          ai.id
        ]
      }
    }
    notifications: {
      actual50: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 50
        thresholdType: 'Actual'
        contactEmails: [
          budgetContactEmail
        ]
      }
      actual80: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 80
        thresholdType: 'Actual'
        contactEmails: [
          budgetContactEmail
        ]
      }
      actual100: {
        enabled: true
        operator: 'GreaterThanOrEqualTo'
        threshold: 100
        thresholdType: 'Actual'
        contactEmails: [
          budgetContactEmail
        ]
      }
    }
  }
}

output openAiEndpoint string = 'https://${ai.properties.customSubDomainName}.openai.azure.com/'
output deployment string = modelName
// No region output: with Entra sign-in on the custom domain the SDK must not be given a region
output translatorEndpoint string = 'https://${translator.properties.customSubDomainName}.cognitiveservices.azure.com/'
