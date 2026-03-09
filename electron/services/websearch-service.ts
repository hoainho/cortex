/**
 * Web Search Service — Supplementary web search for chat context
 *
 * Routes search through the proxy. Non-fatal — if search fails,
 * chat continues without web results.
 */

import { getProxyUrl, getProxyKey, getSetting } from './settings-service'

export interface WebSearchResult {
  title: string
  url: string
  snippet: string
}

export interface WebSearchTrigger {
  triggered: boolean
  searchQuery: string
  reason: 'explicit_prefix' | 'error_pattern' | 'none'
}

const EXPLICIT_PREFIX_REGEX = /^(search|web):\s*/i
const ERROR_PATTERNS = [
  /at\s+.+\s+\(.+:\d+:\d+\)/,     // stack trace
  /ERR!/,                            // npm error
  /HTTP\s+\d{3}/,                    // HTTP status code
  /(?:Error|TypeError|ReferenceError|SyntaxError|RangeError):/,
  /Cannot find module/,
  /ENOENT|EACCES|ECONNREFUSED/,
]

export function isWebSearchEnabled(): boolean {
  return getSetting('websearch_enabled') !== 'false'
}

export function detectWebSearchTrigger(query: string): WebSearchTrigger {
  const trimmed = query.trim()

  if (EXPLICIT_PREFIX_REGEX.test(trimmed)) {
    return {
      triggered: true,
      searchQuery: trimmed.replace(EXPLICIT_PREFIX_REGEX, '').trim(),
      reason: 'explicit_prefix'
    }
  }

  for (const pattern of ERROR_PATTERNS) {
    if (pattern.test(trimmed)) {
      return { triggered: true, searchQuery: trimmed, reason: 'error_pattern' }
    }
  }

  return { triggered: false, searchQuery: '', reason: 'none' }
}

export async function searchWeb(
  query: string,
  options?: { numResults?: number }
): Promise<WebSearchResult[]> {
  if (!isWebSearchEnabled()) return []

  const proxyUrl = getProxyUrl()
  const proxyKey = getProxyKey()

  console.log(`[WebSearch] Searching: "${query.slice(0, 80)}"`)

  try {
    const response = await fetch(`${proxyUrl}/v1/websearch`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${proxyKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        query,
        numResults: options?.numResults || 5
      }),
      signal: AbortSignal.timeout(8000)
    })

    if (!response.ok) {
      console.warn(`[WebSearch] Proxy returned ${response.status} — skipping`)
      return []
    }

    const data = await response.json()
    const results: WebSearchResult[] = data.results || []
    console.log(`[WebSearch] Found ${results.length} results`)
    return results
  } catch (err) {
    console.warn('[WebSearch] Search failed:', err)
    return []
  }
}

export function webResultsToChunkContent(results: WebSearchResult[]): string {
  if (results.length === 0) return ''

  const formatted = results
    .map((r, i) => `[${i + 1}] ${r.title}\nURL: ${r.url}\n${r.snippet}`)
    .join('\n\n')

  return formatted.slice(0, 4000)
}
