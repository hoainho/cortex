import { execFile } from 'child_process'
import { promisify } from 'util'
import type { MCPToolDefinition } from '../mcp/mcp-manager'
import { getServiceConfig } from '../../settings-service'

const execFileAsync = promisify(execFile)

const TOKEN_RESOURCE = 'https://api.applicationinsights.io'
const TOKEN_SCOPE = `${TOKEN_RESOURCE}/.default`
const KEEP_ALIVE_INTERVAL_MS = 5 * 60 * 1000
const TOKEN_REFRESH_BUFFER_MS = 10 * 60 * 1000

let cachedToken = { accessToken: '', expiresAt: 0 }
let keepAliveTimer: ReturnType<typeof setInterval> | null = null
let lastError = ''

function isTokenValid(): boolean {
  return !!cachedToken.accessToken && Date.now() < cachedToken.expiresAt - 60_000
}

function isTokenExpiringSoon(): boolean {
  return !!cachedToken.accessToken && Date.now() > cachedToken.expiresAt - TOKEN_REFRESH_BUFFER_MS
}

export function getConnectionStatus(): { connected: boolean; expiresAt: number; authMethod: string; error?: string } {
  const config = getConfig()
  if (!config) return { connected: false, expiresAt: 0, authMethod: 'none', error: 'Chưa cấu hình' }

  const authMethod = config.tenant_id && config.client_id ? 'serviceprincipal'
    : config.api_key ? 'apikey'
    : 'azurecli'

  if (authMethod === 'apikey') {
    return { connected: true, expiresAt: 0, authMethod }
  }

  return {
    connected: isTokenValid(),
    expiresAt: cachedToken.expiresAt,
    authMethod,
    error: lastError || undefined,
  }
}

export async function refreshTokenNow(): Promise<void> {
  const config = getConfig()
  if (!config) throw new Error('Chưa cấu hình AppInsights')
  if (config.api_key) return

  try {
    lastError = ''
    await acquireToken(config)
    console.log(`[AppInsights] Token refreshed, expires at ${new Date(cachedToken.expiresAt).toISOString()}`)
  } catch (err) {
    lastError = err instanceof Error ? err.message : String(err)
    console.warn(`[AppInsights] Token refresh failed: ${lastError}`)
    throw err
  }
}

async function keepAliveCheck(): Promise<void> {
  const config = getConfig()
  if (!config || config.api_key) return

  if (!isTokenValid() || isTokenExpiringSoon()) {
    try {
      await refreshTokenNow()
    } catch {}
  }
}

export function startKeepAlive(): void {
  stopKeepAlive()
  console.log('[AppInsights] Starting keep-alive (every 5 min)')
  keepAliveCheck()
  keepAliveTimer = setInterval(keepAliveCheck, KEEP_ALIVE_INTERVAL_MS)
}

export function stopKeepAlive(): void {
  if (keepAliveTimer) {
    clearInterval(keepAliveTimer)
    keepAliveTimer = null
    console.log('[AppInsights] Stopped keep-alive')
  }
  cachedToken = { accessToken: '', expiresAt: 0 }
  lastError = ''
}

interface QueryResponse {
  tables: Array<{
    name: string
    columns: Array<{ name: string; type: string }>
    rows: unknown[][]
  }>
}

function getConfig() {
  const config = getServiceConfig('appinsights')
  if (!config?.app_id) return null
  return config
}

async function acquireToken(config: Record<string, string>): Promise<string> {
  if (isTokenValid()) return cachedToken.accessToken

  if (config.tenant_id && config.client_id && config.client_secret) {
    const tokenUrl = `https://login.microsoftonline.com/${config.tenant_id}/oauth2/v2.0/token`
    const params = new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: config.client_id,
      client_secret: config.client_secret,
      scope: TOKEN_SCOPE,
    })
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    })
    if (!response.ok) throw new Error(`Azure AD token error ${response.status}: ${await response.text()}`)
    const data = (await response.json()) as { access_token: string; expires_in: number }
    cachedToken = { accessToken: data.access_token, expiresAt: Date.now() + data.expires_in * 1000 }
    return cachedToken.accessToken
  }

  if (config.api_key) {
    return ''
  }

  const { stdout } = await execFileAsync('az', [
    'account', 'get-access-token', '--resource', TOKEN_RESOURCE, '--output', 'json',
  ], { timeout: 15_000 })
  const data = JSON.parse(stdout) as { accessToken: string; expiresOn: string }
  cachedToken = { accessToken: data.accessToken, expiresAt: new Date(data.expiresOn).getTime() }
  return cachedToken.accessToken
}

async function appInsightsQuery(kql: string, timespan: string): Promise<QueryResponse> {
  const config = getConfig()
  if (!config) throw new Error('Azure Application Insights is not configured. Go to Settings to configure.')

  const headers: Record<string, string> = { 'Content-Type': 'application/json', Accept: 'application/json' }

  if (config.api_key) {
    headers['x-api-key'] = config.api_key
  } else {
    const token = await acquireToken(config)
    headers['Authorization'] = `Bearer ${token}`
  }

  const url = `${TOKEN_RESOURCE}/v1/apps/${config.app_id}/query`
  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ query: kql, timespan }),
  })

  if (!response.ok) throw new Error(`AppInsights API error ${response.status}: ${await response.text()}`)
  return response.json() as Promise<QueryResponse>
}

function tableToObjects(table: QueryResponse['tables'][0]): Record<string, unknown>[] {
  return table.rows.map((row) => {
    const obj: Record<string, unknown> = {}
    table.columns.forEach((col, i) => { obj[col.name] = row[i] })
    return obj
  })
}

function formatResult(response: QueryResponse): string {
  const result = {
    totalRows: response.tables.reduce((sum, t) => sum + t.rows.length, 0),
    tables: response.tables.map((t) => ({ name: t.name, rows: tableToObjects(t) })),
  }
  return JSON.stringify(result, null, 2)
}

const TOOL_DEFINITIONS: MCPToolDefinition[] = [
  {
    type: 'function',
    function: {
      name: 'cortex_appinsights_e2e_transaction',
      description: 'Get end-to-end transaction details for an Azure Application Insights operation. Returns a full timeline of all telemetry events (requests, dependencies, traces, exceptions, custom events) sharing the same operation_Id.',
      parameters: {
        type: 'object',
        properties: {
          operationId: { type: 'string', description: 'The operation_Id to trace' },
          timespan: { type: 'string', description: 'ISO 8601 duration (default: PT24H). Examples: PT1H, PT6H, P7D' },
        },
        required: ['operationId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cortex_appinsights_kql_query',
      description: 'Run a custom KQL (Kusto) query against Azure Application Insights. Tables: requests, dependencies, traces, exceptions, customEvents, pageViews, availabilityResults, customMetrics, performanceCounters.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'KQL query string' },
          timespan: { type: 'string', description: 'ISO 8601 duration (default: PT24H)' },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cortex_appinsights_recent_exceptions',
      description: 'Retrieve the most recent exceptions and errors from Azure Application Insights with type, message, method, operation_Id, and cloud role.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max exceptions to return (default: 20)' },
          timespan: { type: 'string', description: 'ISO 8601 duration (default: PT24H)' },
          filter: { type: 'string', description: 'KQL filter expression, e.g.: type contains "NullReference"' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cortex_appinsights_request_search',
      description: 'Search HTTP requests in Azure Application Insights. Filter by URL pattern, HTTP status code, duration range, or operation name.',
      parameters: {
        type: 'object',
        properties: {
          urlFilter: { type: 'string', description: 'Substring to match in URL' },
          resultCode: { type: 'string', description: 'HTTP status code (e.g. "500")' },
          minDurationMs: { type: 'number', description: 'Minimum duration in ms' },
          maxDurationMs: { type: 'number', description: 'Maximum duration in ms' },
          operationName: { type: 'string', description: 'Partial match on operation name' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
          timespan: { type: 'string', description: 'ISO 8601 duration (default: PT24H)' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'cortex_appinsights_dependency_failures',
      description: 'Get failed dependency calls (HTTP, SQL, Redis, Service Bus) from Azure Application Insights with type, target, error code, duration, and operation_Id.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', description: 'Dependency type filter (e.g. "HTTP", "SQL")' },
          target: { type: 'string', description: 'Target host or service name filter' },
          limit: { type: 'number', description: 'Max results (default: 50)' },
          timespan: { type: 'string', description: 'ISO 8601 duration (default: PT24H)' },
        },
        required: [],
      },
    },
  },
]

export function getAppInsightsToolDefinitions(): MCPToolDefinition[] {
  if (!getConfig()) return []
  return TOOL_DEFINITIONS
}

async function handleE2ETransaction(args: Record<string, unknown>): Promise<string> {
  const operationId = args.operationId as string
  const timespan = (args.timespan as string) || 'PT24H'
  const kql = `
union
  (requests    | where operation_Id == "${operationId}" | extend itemType = "request",    duration_ms = duration, success_val = success, result = tostring(resultCode), url_val = url, target_val = "", type_val = "", sev = -1, msg = ""),
  (dependencies | where operation_Id == "${operationId}" | extend itemType = "dependency", duration_ms = duration, success_val = success, result = tostring(resultCode), url_val = data, target_val = target, type_val = type, sev = -1, msg = ""),
  (traces       | where operation_Id == "${operationId}" | extend itemType = "trace",      duration_ms = 0.0, success_val = true, result = "", url_val = "", target_val = "", type_val = "", sev = severityLevel, msg = message),
  (exceptions   | where operation_Id == "${operationId}" | extend itemType = "exception",  duration_ms = 0.0, success_val = false, result = type, url_val = "", target_val = "", type_val = type, sev = severityLevel, msg = outerMessage),
  (customEvents | where operation_Id == "${operationId}" | extend itemType = "customEvent", duration_ms = 0.0, success_val = true, result = "", url_val = "", target_val = "", type_val = "", sev = -1, msg = ""),
  (pageViews    | where operation_Id == "${operationId}" | extend itemType = "pageView",   duration_ms = duration, success_val = true, result = "", url_val = url, target_val = "", type_val = "", sev = -1, msg = name)
| project timestamp, itemType, name, id, operation_Id, operation_ParentId, duration_ms, success_val, result, url_val, target_val, type_val, sev, msg, cloud_RoleName, appName
| order by timestamp asc`.trim()
  const response = await appInsightsQuery(kql, timespan)
  return formatResult(response)
}

async function handleKqlQuery(args: Record<string, unknown>): Promise<string> {
  const query = args.query as string
  const timespan = (args.timespan as string) || 'PT24H'
  const response = await appInsightsQuery(query, timespan)
  return formatResult(response)
}

async function handleRecentExceptions(args: Record<string, unknown>): Promise<string> {
  const limit = (args.limit as number) || 20
  const timespan = (args.timespan as string) || 'PT24H'
  const filter = args.filter as string | undefined
  const where = filter ? `| where ${filter}` : ''
  const kql = `
exceptions
${where}
| project timestamp, type, outerMessage, innermostMessage, method = outerMethod, assembly = outerAssembly, operation_Id, operation_Name, cloud_RoleName, user_Id, client_City, client_CountryOrRegion, details = customDimensions, problemId
| order by timestamp desc
| take ${limit}`.trim()
  const response = await appInsightsQuery(kql, timespan)
  return formatResult(response)
}

async function handleRequestSearch(args: Record<string, unknown>): Promise<string> {
  const limit = (args.limit as number) || 50
  const timespan = (args.timespan as string) || 'PT24H'
  const filters: string[] = []
  if (args.urlFilter) filters.push(`url contains "${args.urlFilter}"`)
  if (args.resultCode) filters.push(`resultCode == "${args.resultCode}"`)
  if (args.minDurationMs !== undefined) filters.push(`duration >= ${args.minDurationMs}`)
  if (args.maxDurationMs !== undefined) filters.push(`duration <= ${args.maxDurationMs}`)
  if (args.operationName) filters.push(`operation_Name contains "${args.operationName}"`)
  const whereClause = filters.length > 0 ? `| where ${filters.join(' and ')}` : ''
  const kql = `
requests
${whereClause}
| project timestamp, name, url, duration, resultCode, success, operation_Id, operation_Name, cloud_RoleName, client_City, client_CountryOrRegion, user_Id, customDimensions
| order by timestamp desc
| take ${limit}`.trim()
  const response = await appInsightsQuery(kql, timespan)
  return formatResult(response)
}

async function handleDependencyFailures(args: Record<string, unknown>): Promise<string> {
  const limit = (args.limit as number) || 50
  const timespan = (args.timespan as string) || 'PT24H'
  const filters: string[] = ['success == false']
  if (args.type) filters.push(`type contains "${args.type}"`)
  if (args.target) filters.push(`target contains "${args.target}"`)
  const kql = `
dependencies
| where ${filters.join(' and ')}
| project timestamp, name, type, target, data, duration, resultCode, success, operation_Id, operation_Name, cloud_RoleName, customDimensions
| order by timestamp desc
| take ${limit}`.trim()
  const response = await appInsightsQuery(kql, timespan)
  return formatResult(response)
}

export async function executeAppInsightsTool(
  toolName: string,
  argsJson: string
): Promise<{ content: string; isError: boolean }> {
  let args: Record<string, unknown>
  try {
    args = JSON.parse(argsJson)
  } catch {
    return { content: 'Error parsing tool arguments: invalid JSON', isError: true }
  }

  try {
    let content: string
    switch (toolName) {
      case 'cortex_appinsights_e2e_transaction':
        content = await handleE2ETransaction(args)
        break
      case 'cortex_appinsights_kql_query':
        content = await handleKqlQuery(args)
        break
      case 'cortex_appinsights_recent_exceptions':
        content = await handleRecentExceptions(args)
        break
      case 'cortex_appinsights_request_search':
        content = await handleRequestSearch(args)
        break
      case 'cortex_appinsights_dependency_failures':
        content = await handleDependencyFailures(args)
        break
      default:
        return { content: `Unknown AppInsights tool: ${toolName}`, isError: true }
    }
    return { content, isError: false }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { content: `AppInsights error: ${message}`, isError: true }
  }
}
