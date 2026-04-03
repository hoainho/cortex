import type { HookContext, HookResult } from './types'

export interface HttpHookConfig {
  url: string
  method?: 'POST' | 'GET' | 'PUT'
  headers?: Record<string, string>
  body?: Record<string, unknown> | string
  async?: boolean
  retries?: number
  timeoutMs?: number
}

const DEFAULT_TIMEOUT_MS = 10_000
const DEFAULT_RETRIES = 3

function interpolateTemplate(template: string, context: HookContext): string {
  return template
    .replace(/\{\{event\}\}/g, context.metadata?.trigger as string ?? '')
    .replace(/\{\{project_name\}\}/g, context.projectId)
    .replace(/\{\{response_summary\}\}/g, (context.response ?? '').slice(0, 200))
    .replace(/\{\{agent_name\}\}/g, context.metadata?.agentName as string ?? '')
    .replace(/\{\{timestamp\}\}/g, new Date().toISOString())
    .replace(/\{\{query\}\}/g, (context.query ?? '').slice(0, 200))
}

function interpolateBody(body: Record<string, unknown> | string, context: HookContext): string {
  if (typeof body === 'string') return interpolateTemplate(body, context)
  const serialized = JSON.stringify(body)
  return interpolateTemplate(serialized, context)
}

async function fetchWithTimeout(url: string, options: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

async function executeOnce(config: HttpHookConfig, context: HookContext): Promise<boolean> {
  const method = config.method ?? 'POST'
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...config.headers }
  const bodyStr = config.body ? interpolateBody(config.body, context) : JSON.stringify({
    projectId: context.projectId,
    timestamp: new Date().toISOString(),
    ...(context.query && { query: context.query.slice(0, 200) }),
    ...(context.metadata && { metadata: context.metadata })
  })

  const response = await fetchWithTimeout(
    config.url,
    { method, headers, body: method !== 'GET' ? bodyStr : undefined },
    config.timeoutMs ?? DEFAULT_TIMEOUT_MS
  )

  return response.ok
}

export async function executeHttpHook(config: HttpHookConfig, context: HookContext): Promise<HookResult> {
  if (config.async) {
    executeWithRetry(config, context).catch(err =>
      console.warn('[HttpHook] Async hook failed:', config.url, err)
    )
    return { modified: false }
  }

  try {
    await executeWithRetry(config, context)
    return { modified: false }
  } catch (err) {
    console.warn('[HttpHook] Hook failed:', config.url, err)
    return { modified: false, message: `HTTP hook failed: ${String(err)}` }
  }
}

async function executeWithRetry(config: HttpHookConfig, context: HookContext): Promise<void> {
  const maxRetries = config.retries ?? DEFAULT_RETRIES
  let lastErr: unknown

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const ok = await executeOnce(config, context)
      if (ok) return
      lastErr = new Error(`HTTP ${config.url} returned non-2xx`)
    } catch (err) {
      lastErr = err
    }

    if (attempt < maxRetries) {
      await new Promise(r => setTimeout(r, Math.pow(2, attempt) * 1000))
    }
  }

  throw lastErr
}
