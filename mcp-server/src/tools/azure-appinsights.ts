import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

interface ApiKeyAuth {
  method: 'apikey'
  appId: string
  apiKey: string
}

interface ServicePrincipalAuth {
  method: 'serviceprincipal'
  appId: string
  tenantId: string
  clientId: string
  clientSecret: string
}

interface AzureCliAuth {
  method: 'azurecli'
  appId: string
}

export type AppInsightsAuth = ApiKeyAuth | ServicePrincipalAuth | AzureCliAuth

export interface AppInsightsConfig {
  auth: AppInsightsAuth
  defaultTimespan?: string
}

interface QueryResponse {
  tables: Array<{
    name: string
    columns: Array<{ name: string; type: string }>
    rows: unknown[][]
  }>
}

interface E2EEvent {
  timestamp: string
  itemType: string
  name: string
  id: string
  operationId: string
  operationParentId: string
  duration?: number
  success?: boolean
  resultCode?: string
  url?: string
  target?: string
  type?: string
  severityLevel?: number
  message?: string
  cloud_RoleName?: string
  appName?: string
  [key: string]: unknown
}

interface TokenCache {
  accessToken: string
  expiresAt: number
}

const TOKEN_RESOURCE = 'https://api.applicationinsights.io'
const TOKEN_SCOPE = `${TOKEN_RESOURCE}/.default`

const spTokenCache: TokenCache = { accessToken: '', expiresAt: 0 }
const cliTokenCache: TokenCache = { accessToken: '', expiresAt: 0 }

function isTokenValid(cache: TokenCache): boolean {
  return !!cache.accessToken && Date.now() < cache.expiresAt - 60_000
}

async function acquireServicePrincipalToken(auth: ServicePrincipalAuth): Promise<string> {
  if (isTokenValid(spTokenCache)) return spTokenCache.accessToken

  const tokenUrl = `https://login.microsoftonline.com/${auth.tenantId}/oauth2/v2.0/token`
  const params = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    scope: TOKEN_SCOPE,
  })

  const response = await fetch(tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`Azure AD token error ${response.status}: ${text}`)
  }

  const data = (await response.json()) as { access_token: string; expires_in: number }
  spTokenCache.accessToken = data.access_token
  spTokenCache.expiresAt = Date.now() + data.expires_in * 1000
  return spTokenCache.accessToken
}

async function acquireAzureCliToken(): Promise<string> {
  if (isTokenValid(cliTokenCache)) return cliTokenCache.accessToken

  try {
    const { stdout } = await execFileAsync('az', [
      'account', 'get-access-token',
      '--resource', TOKEN_RESOURCE,
      '--output', 'json',
    ], { timeout: 15_000 })

    const data = JSON.parse(stdout) as { accessToken: string; expiresOn: string }
    cliTokenCache.accessToken = data.accessToken
    cliTokenCache.expiresAt = new Date(data.expiresOn).getTime()
    return cliTokenCache.accessToken
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('ENOENT') || msg.includes('not found')) {
      throw new Error(
        'Azure CLI (az) not found. Install: https://aka.ms/install-azure-cli then run: az login'
      )
    }
    if (msg.includes('az login') || msg.includes('not logged in')) {
      throw new Error('Azure CLI not logged in. Run: az login')
    }
    throw new Error(`Azure CLI token error: ${msg}`)
  }
}

async function buildAuthHeaders(auth: AppInsightsAuth): Promise<Record<string, string>> {
  switch (auth.method) {
    case 'apikey':
      return { 'x-api-key': auth.apiKey }
    case 'serviceprincipal': {
      const token = await acquireServicePrincipalToken(auth)
      return { Authorization: `Bearer ${token}` }
    }
    case 'azurecli': {
      const token = await acquireAzureCliToken()
      return { Authorization: `Bearer ${token}` }
    }
  }
}

async function appInsightsFetch(
  config: AppInsightsConfig,
  endpoint: string,
  body: Record<string, unknown>
): Promise<QueryResponse> {
  const appId = config.auth.appId
  const url = `https://api.applicationinsights.io/v1/apps/${appId}${endpoint}`
  const authHeaders = await buildAuthHeaders(config.auth)

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const text = await response.text()
    throw new Error(`AppInsights API error ${response.status}: ${text}`)
  }

  return response.json() as Promise<QueryResponse>
}

function tableToObjects(
  table: QueryResponse['tables'][0]
): Record<string, unknown>[] {
  const { columns, rows } = table
  return rows.map((row) => {
    const obj: Record<string, unknown> = {}
    columns.forEach((col, i) => {
      obj[col.name] = row[i]
    })
    return obj
  })
}

function formatQueryResult(response: QueryResponse): {
  totalRows: number
  tables: Array<{ name: string; rows: Record<string, unknown>[] }>
} {
  return {
    totalRows: response.tables.reduce((sum, t) => sum + t.rows.length, 0),
    tables: response.tables.map((t) => ({
      name: t.name,
      rows: tableToObjects(t),
    })),
  }
}

export async function appinsightsE2ETransaction(
  config: AppInsightsConfig,
  operationId: string,
  timespan = config.defaultTimespan ?? 'PT24H'
): Promise<{ operationId: string; eventCount: number; timeline: E2EEvent[] }> {
  const kql = `
union
  (requests    | where operation_Id == "${operationId}" | extend itemType = "request",    duration_ms = duration, success_val = success, result = tostring(resultCode), url_val = url,                  target_val = "",        type_val = "",       sev = -1,          msg = ""),
  (dependencies | where operation_Id == "${operationId}" | extend itemType = "dependency", duration_ms = duration, success_val = success, result = tostring(resultCode), url_val = data,               target_val = target,   type_val = type,     sev = -1,          msg = ""),
  (traces       | where operation_Id == "${operationId}" | extend itemType = "trace",      duration_ms = 0.0,      success_val = true,    result = "",                  url_val = "",                  target_val = "",        type_val = "",       sev = severityLevel, msg = message),
  (exceptions   | where operation_Id == "${operationId}" | extend itemType = "exception",  duration_ms = 0.0,      success_val = false,   result = type,                url_val = "",                  target_val = "",        type_val = type,     sev = severityLevel, msg = outerMessage),
  (customEvents | where operation_Id == "${operationId}" | extend itemType = "customEvent", duration_ms = 0.0,     success_val = true,    result = "",                  url_val = "",                  target_val = "",        type_val = "",       sev = -1,          msg = ""),
  (pageViews    | where operation_Id == "${operationId}" | extend itemType = "pageView",   duration_ms = duration, success_val = true,    result = "",                  url_val = url,                 target_val = "",        type_val = "",       sev = -1,          msg = name)
| project
    timestamp,
    itemType,
    name,
    id,
    operation_Id,
    operation_ParentId,
    duration_ms,
    success_val,
    result,
    url_val,
    target_val,
    type_val,
    sev,
    msg,
    cloud_RoleName,
    appName
| order by timestamp asc
`.trim()

  const response = await appInsightsFetch(config, '/query', { query: kql, timespan })
  const result = formatQueryResult(response)
  const rows = result.tables[0]?.rows ?? []

  const timeline: E2EEvent[] = rows.map((row) => {
    const r = row as Record<string, unknown>
    const event: E2EEvent = {
      timestamp: r['timestamp'] as string,
      itemType: r['itemType'] as string,
      name: r['name'] as string,
      id: r['id'] as string,
      operationId: r['operation_Id'] as string,
      operationParentId: r['operation_ParentId'] as string,
      cloud_RoleName: r['cloud_RoleName'] as string,
      appName: r['appName'] as string,
    }
    if (r['duration_ms'] !== null && r['duration_ms'] !== undefined) event.duration = r['duration_ms'] as number
    if (r['success_val'] !== null && r['success_val'] !== undefined) event.success = r['success_val'] as boolean
    if (r['result']) event.resultCode = r['result'] as string
    if (r['url_val']) event.url = r['url_val'] as string
    if (r['target_val']) event.target = r['target_val'] as string
    if (r['type_val']) event.type = r['type_val'] as string
    if (typeof r['sev'] === 'number' && (r['sev'] as number) >= 0) event.severityLevel = r['sev'] as number
    if (r['msg']) event.message = r['msg'] as string
    return event
  })

  return { operationId, eventCount: timeline.length, timeline }
}

export async function appinsightsKqlQuery(
  config: AppInsightsConfig,
  query: string,
  timespan = config.defaultTimespan ?? 'PT24H'
): Promise<ReturnType<typeof formatQueryResult>> {
  const response = await appInsightsFetch(config, '/query', { query, timespan })
  return formatQueryResult(response)
}

export async function appinsightsRecentExceptions(
  config: AppInsightsConfig,
  limit = 20,
  timespan = config.defaultTimespan ?? 'PT24H',
  filter?: string
): Promise<ReturnType<typeof formatQueryResult>> {
  const where = filter ? `| where ${filter}` : ''
  const kql = `
exceptions
| where timestamp > ago(${timespan.replace('PT', '').toLowerCase()})
${where}
| project
    timestamp,
    type,
    outerMessage,
    innermostMessage,
    method = outerMethod,
    assembly = outerAssembly,
    operation_Id,
    operation_Name,
    cloud_RoleName,
    user_Id,
    client_City,
    client_CountryOrRegion,
    details = customDimensions,
    problemId
| order by timestamp desc
| take ${limit}
`.trim()

  const response = await appInsightsFetch(config, '/query', { query: kql, timespan })
  return formatQueryResult(response)
}

export async function appinsightsRequestSearch(
  config: AppInsightsConfig,
  options: {
    urlFilter?: string
    resultCode?: string
    minDurationMs?: number
    maxDurationMs?: number
    operationName?: string
    limit?: number
    timespan?: string
  }
): Promise<ReturnType<typeof formatQueryResult>> {
  const {
    urlFilter,
    resultCode,
    minDurationMs,
    maxDurationMs,
    operationName,
    limit = 50,
    timespan = config.defaultTimespan ?? 'PT24H',
  } = options

  const filters: string[] = []
  if (urlFilter) filters.push(`url contains "${urlFilter}"`)
  if (resultCode) filters.push(`resultCode == "${resultCode}"`)
  if (minDurationMs !== undefined) filters.push(`duration >= ${minDurationMs}`)
  if (maxDurationMs !== undefined) filters.push(`duration <= ${maxDurationMs}`)
  if (operationName) filters.push(`operation_Name contains "${operationName}"`)

  const whereClause = filters.length > 0 ? `| where ${filters.join(' and ')}` : ''

  const kql = `
requests
${whereClause}
| project
    timestamp,
    name,
    url,
    duration,
    resultCode,
    success,
    operation_Id,
    operation_Name,
    cloud_RoleName,
    client_City,
    client_CountryOrRegion,
    user_Id,
    customDimensions
| order by timestamp desc
| take ${limit}
`.trim()

  const response = await appInsightsFetch(config, '/query', { query: kql, timespan })
  return formatQueryResult(response)
}

export async function appinsightsDependencyFailures(
  config: AppInsightsConfig,
  options: {
    type?: string
    target?: string
    limit?: number
    timespan?: string
  }
): Promise<ReturnType<typeof formatQueryResult>> {
  const {
    type,
    target,
    limit = 50,
    timespan = config.defaultTimespan ?? 'PT24H',
  } = options

  const filters: string[] = ['success == false']
  if (type) filters.push(`type contains "${type}"`)
  if (target) filters.push(`target contains "${target}"`)

  const kql = `
dependencies
| where ${filters.join(' and ')}
| project
    timestamp,
    name,
    type,
    target,
    data,
    duration,
    resultCode,
    success,
    operation_Id,
    operation_Name,
    cloud_RoleName,
    customDimensions
| order by timestamp desc
| take ${limit}
`.trim()

  const response = await appInsightsFetch(config, '/query', { query: kql, timespan })
  return formatQueryResult(response)
}

export const APPINSIGHTS_TOOLS = [
  {
    name: 'appinsights_e2e_transaction',
    description:
      'Get end-to-end transaction details for an Azure Application Insights operation. ' +
      'Returns a full timeline of all telemetry events (requests, dependencies, traces, ' +
      'exceptions, custom events) sharing the same operation_Id — identical to the ' +
      '"End-to-end transaction details" blade in Azure Portal.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        operationId: {
          type: 'string',
          description: 'The operation_Id to trace (e.g. "abc123def456" — from a request, trace, or exception)',
        },
        timespan: {
          type: 'string',
          description: 'ISO 8601 duration to look back (default: PT24H). Examples: PT1H, PT6H, P7D',
        },
      },
      required: ['operationId'],
    },
  },
  {
    name: 'appinsights_kql_query',
    description:
      'Run a custom KQL (Kusto Query Language) query against Azure Application Insights. ' +
      'Tables available: requests, dependencies, traces, exceptions, customEvents, ' +
      'pageViews, availabilityResults, customMetrics, performanceCounters.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        query: {
          type: 'string',
          description: 'KQL query string. Example: "requests | where resultCode == \'500\' | take 20"',
        },
        timespan: {
          type: 'string',
          description: 'ISO 8601 duration (default: PT24H). Examples: PT1H, PT6H, P7D',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'appinsights_recent_exceptions',
    description:
      'Retrieve the most recent exceptions and errors from Azure Application Insights. ' +
      'Returns exception type, message, method, assembly, operation_Id, and cloud role.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        limit: {
          type: 'number',
          description: 'Max exceptions to return (default: 20)',
        },
        timespan: {
          type: 'string',
          description: 'ISO 8601 duration to look back (default: PT24H)',
        },
        filter: {
          type: 'string',
          description: 'Optional KQL filter expression, e.g.: type contains "NullReference" or cloud_RoleName == "api-service"',
        },
      },
    },
  },
  {
    name: 'appinsights_request_search',
    description:
      'Search HTTP requests in Azure Application Insights. Filter by URL pattern, ' +
      'HTTP status code, duration range, or operation name. ' +
      'Returns timestamp, URL, duration, result code, and operation_Id for correlation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        urlFilter: {
          type: 'string',
          description: 'Substring to match in URL (e.g. "/api/users")',
        },
        resultCode: {
          type: 'string',
          description: 'Exact HTTP status code to filter by (e.g. "500", "404")',
        },
        minDurationMs: {
          type: 'number',
          description: 'Minimum request duration in milliseconds',
        },
        maxDurationMs: {
          type: 'number',
          description: 'Maximum request duration in milliseconds',
        },
        operationName: {
          type: 'string',
          description: 'Partial match on operation name',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 50)',
        },
        timespan: {
          type: 'string',
          description: 'ISO 8601 duration to look back (default: PT24H)',
        },
      },
    },
  },
  {
    name: 'appinsights_dependency_failures',
    description:
      'Get failed dependency calls from Azure Application Insights. ' +
      'Covers HTTP calls, SQL queries, Redis, Service Bus, and other external dependencies. ' +
      'Returns dependency type, target, error code, duration, and operation_Id for E2E correlation.',
    inputSchema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          description: 'Dependency type filter (e.g. "HTTP", "SQL", "Redis", "ServiceBus")',
        },
        target: {
          type: 'string',
          description: 'Target host or service name filter (e.g. "my-db.database.windows.net")',
        },
        limit: {
          type: 'number',
          description: 'Max results to return (default: 50)',
        },
        timespan: {
          type: 'string',
          description: 'ISO 8601 duration to look back (default: PT24H)',
        },
      },
    },
  },
] as const
