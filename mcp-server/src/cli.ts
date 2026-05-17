#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { createCortexMCPServer } from './server.js'
import { detectCortexDbPath } from './utils/paths.js'
import { printConfigGuide } from './config-generator.js'
import { log } from './utils/logger.js'
import type { AppInsightsConfig, AppInsightsAuth } from './tools/azure-appinsights.js'

interface CliArgs {
  dbPath?: string
  projectId?: string
  appInsightsAppId?: string
  appInsightsApiKey?: string
  appInsightsTenantId?: string
  appInsightsClientId?: string
  appInsightsClientSecret?: string
  appInsightsTimespan?: string
  appInsightsAuth?: string
  help: boolean
  config: boolean
}

function parseArgs(argv: string[]): CliArgs {
  const result: CliArgs = { help: false, config: false }

  const flagMap: Record<string, keyof CliArgs> = {
    '--db-path': 'dbPath',
    '--project-id': 'projectId',
    '--project': 'projectId',
    '--appinsights-app-id': 'appInsightsAppId',
    '--appinsights-api-key': 'appInsightsApiKey',
    '--appinsights-tenant-id': 'appInsightsTenantId',
    '--appinsights-client-id': 'appInsightsClientId',
    '--appinsights-client-secret': 'appInsightsClientSecret',
    '--appinsights-timespan': 'appInsightsTimespan',
    '--appinsights-auth': 'appInsightsAuth',
  }

  for (const arg of argv.slice(2)) {
    if (arg === '--help' || arg === '-h') { result.help = true; continue }
    if (arg === '--config') { result.config = true; continue }

    const eqIdx = arg.indexOf('=')
    if (eqIdx === -1) continue
    const key = arg.slice(0, eqIdx)
    const val = arg.slice(eqIdx + 1)
    const field = flagMap[key]
    if (field) (result as unknown as Record<string, unknown>)[field] = val
  }

  const envMap: Record<string, keyof CliArgs> = {
    APPINSIGHTS_APP_ID: 'appInsightsAppId',
    APPINSIGHTS_API_KEY: 'appInsightsApiKey',
    APPINSIGHTS_TENANT_ID: 'appInsightsTenantId',
    APPINSIGHTS_CLIENT_ID: 'appInsightsClientId',
    APPINSIGHTS_CLIENT_SECRET: 'appInsightsClientSecret',
    APPINSIGHTS_TIMESPAN: 'appInsightsTimespan',
    APPINSIGHTS_AUTH: 'appInsightsAuth',
  }

  for (const [envKey, field] of Object.entries(envMap)) {
    if (!result[field] && process.env[envKey]) {
      (result as unknown as Record<string, unknown>)[field] = process.env[envKey]
    }
  }

  return result
}

function printUsage(): void {
  console.error(`
cortex-brain - MCP Server for Cortex Brain

Usage:
  cortex-brain [options]

Options:
  --db-path=PATH                       Path to Cortex SQLite database
  --project-id=ID                      Default project ID for all tool calls
  --project=ID                         Alias for --project-id
  --config                             Print MCP config snippets
  -h, --help                           Show this help message

Azure Application Insights (choose ONE auth method):

  Method 1 — Azure CLI (easiest, no special permissions needed):
    --appinsights-app-id=ID              Application Insights Application ID
    --appinsights-auth=azurecli          Use 'az login' token (default when no key/SP)
    Prerequisite: az login

  Method 2 — Service Principal:
    --appinsights-app-id=ID              Application Insights Application ID
    --appinsights-tenant-id=ID           Azure AD / Entra ID Tenant ID
    --appinsights-client-id=ID           Service Principal Client ID
    --appinsights-client-secret=SECRET   Service Principal Client Secret

  Method 3 — API Key (legacy, may fail on newer resources):
    --appinsights-app-id=ID              Application Insights Application ID
    --appinsights-api-key=KEY            API Key

  Common:
    --appinsights-timespan=DURATION      Default timespan, ISO 8601 (default: PT24H)

Examples:
  cortex-brain --project-id=abc123

  # Azure CLI auth (easiest — just az login first)
  cortex-brain --project-id=abc123 \\
    --appinsights-app-id=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX

  # Service Principal auth
  cortex-brain --project-id=abc123 \\
    --appinsights-app-id=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX \\
    --appinsights-tenant-id=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX \\
    --appinsights-client-id=XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX \\
    --appinsights-client-secret=YOUR_SECRET

Environment variables (alternative to flags):
  APPINSIGHTS_APP_ID, APPINSIGHTS_AUTH, APPINSIGHTS_TENANT_ID,
  APPINSIGHTS_CLIENT_ID, APPINSIGHTS_CLIENT_SECRET,
  APPINSIGHTS_API_KEY, APPINSIGHTS_TIMESPAN
`)
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv)

  if (args.help) {
    printUsage()
    process.exit(0)
  }

  if (args.config) {
    console.log(printConfigGuide({ dbPath: args.dbPath, projectId: args.projectId }))
    process.exit(0)
  }

  const dbPath = args.dbPath || detectCortexDbPath()
  if (!dbPath) {
    log('error', 'Cortex database not found. Is Cortex Desktop installed?')
    log('error', 'Use --db-path=/path/to/cortex.db to specify manually.')
    process.exit(1)
  }

  log('info', `Starting Cortex Brain MCP Server`)
  log('info', `DB: ${dbPath}`)
  if (args.projectId) log('info', `Default project: ${args.projectId}`)

  let appInsightsConfig: AppInsightsConfig | undefined
  if (args.appInsightsAppId) {
    const appId = args.appInsightsAppId
    const timespan = args.appInsightsTimespan
    let auth: AppInsightsAuth

    if (args.appInsightsTenantId && args.appInsightsClientId && args.appInsightsClientSecret) {
      auth = {
        method: 'serviceprincipal',
        appId,
        tenantId: args.appInsightsTenantId,
        clientId: args.appInsightsClientId,
        clientSecret: args.appInsightsClientSecret,
      }
      log('info', `Azure AppInsights: Service Principal auth, app ${appId.slice(0, 8)}...`)
    } else if (args.appInsightsApiKey) {
      auth = { method: 'apikey', appId, apiKey: args.appInsightsApiKey }
      log('info', `Azure AppInsights: API Key auth, app ${appId.slice(0, 8)}...`)
    } else {
      auth = { method: 'azurecli', appId }
      log('info', `Azure AppInsights: Azure CLI auth, app ${appId.slice(0, 8)}... (requires: az login)`)
    }

    appInsightsConfig = { auth, defaultTimespan: timespan }
    log('info', `Azure AppInsights timespan: ${timespan ?? 'PT24H'}`)
  }

  const { server, reader } = createCortexMCPServer({
    dbPath,
    projectId: args.projectId,
    appInsights: appInsightsConfig,
  })

  const transport = new StdioServerTransport()

  process.on('SIGINT', () => {
    log('info', 'Shutting down...')
    reader.close()
    process.exit(0)
  })

  process.on('SIGTERM', () => {
    reader.close()
    process.exit(0)
  })

  await server.connect(transport)
  log('info', 'MCP Server running on stdio')
}

main().catch((err) => {
  log('error', 'Fatal:', err)
  process.exit(1)
})
