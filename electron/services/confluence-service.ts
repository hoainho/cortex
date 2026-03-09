/**
 * Confluence Service — Read-only Confluence Cloud integration
 *
 * Fetches spaces, pages, and content from Confluence Cloud REST API v2.
 * Extracts plain text from XHTML storage format.
 * Uses Basic Auth (email:apiToken) — same credentials as Jira.
 *
 * Endpoints:
 * - GET /wiki/api/v2/spaces (list spaces)
 * - GET /wiki/api/v2/pages (list/filter pages)
 * - GET /wiki/api/v2/pages/{id}?body-format=storage (page with body)
 * - GET /wiki/rest/api/content/search?cql=... (CQL search — v1 API)
 */

// Config is passed externally via ConfluenceConnectionConfig — no global config import needed

// ============================
// Types
// ============================

export interface ConfluenceSpace {
  id: string
  key: string
  name: string
  type: string // global, personal
  description: string
  homepageId: string | null
}

export interface ConfluencePage {
  id: string
  spaceId: string
  spaceKey: string
  title: string
  status: string
  body: string        // extracted plain text
  labels: string[]
  parentId: string | null
  parentTitle: string | null
  version: number
  createdAt: string
  updatedAt: string
  authorName: string | null
  webUrl: string | null
  rawBody?: string    // original XHTML storage
}

export interface ConfluenceLabel {
  id: string
  name: string
  prefix: string
}

export interface ConfluenceConnectionConfig {
  siteUrl: string   // e.g., https://mysite.atlassian.net
  email: string
  apiToken: string
}

// ============================
// Core API Client
// ============================

function getAuthHeader(config: ConfluenceConnectionConfig): string {
  const credentials = Buffer.from(`${config.email}:${config.apiToken}`).toString('base64')
  return `Basic ${credentials}`
}

function normalizeBaseUrl(siteUrl: string): string {
  let url = siteUrl.trim().replace(/\/+$/, '')
  if (!url.startsWith('http')) {
    url = `https://${url}`
  }
  return url
}

async function confluenceFetch(
  config: ConfluenceConnectionConfig,
  path: string,
  options: { method?: string; body?: any; timeout?: number } = {}
): Promise<any> {
  const baseUrl = normalizeBaseUrl(config.siteUrl)
  const url = `${baseUrl}${path}`

  const headers: Record<string, string> = {
    Authorization: getAuthHeader(config),
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
    signal: AbortSignal.timeout(options.timeout || 30000)
  })

  if (response.status === 429) {
    const retryAfter = parseInt(response.headers.get('retry-after') || '5', 10)
    await sleep(retryAfter * 1000)
    return confluenceFetch(config, path, options)
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => 'Unknown error')
    throw new Error(`Confluence API error ${response.status}: ${errorText}`)
  }

  return response.json()
}

// ============================
// Connection Test
// ============================

export async function testConfluenceConnection(config: ConfluenceConnectionConfig): Promise<{
  success: boolean
  error?: string
  user?: string
}> {
  try {
    // Use Jira's /myself endpoint since Confluence shares the same auth
    const myself = await confluenceFetch(config, '/wiki/rest/api/user/current')
    return {
      success: true,
      user: myself.displayName || myself.username || 'Connected'
    }
  } catch {
    // Fallback: try fetching spaces (if user endpoint doesn't work)
    try {
      const spaces = await confluenceFetch(config, '/wiki/api/v2/spaces?limit=1')
      return {
        success: true,
        user: `Found ${spaces.results?.length || 0} spaces`
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection failed'
      }
    }
  }
}

// ============================
// Fetch Spaces
// ============================

export async function fetchSpaces(config: ConfluenceConnectionConfig): Promise<ConfluenceSpace[]> {
  const allSpaces: ConfluenceSpace[] = []
  let cursor: string | null = null

  while (true) {
    const params = new URLSearchParams({ limit: '100', type: 'global' })
    if (cursor) params.set('cursor', cursor)

    const data = await confluenceFetch(config, `/wiki/api/v2/spaces?${params}`)

    for (const s of data.results || []) {
      allSpaces.push({
        id: s.id,
        key: s.key,
        name: s.name,
        type: s.type || 'global',
        description: s.description?.plain?.value || '',
        homepageId: s.homepageId || null
      })
    }

    // Cursor-based pagination (v2 API)
    const nextLink = data._links?.next
    if (!nextLink) break

    // Extract cursor from next link
    const nextUrl = new URL(nextLink, 'https://placeholder.com')
    cursor = nextUrl.searchParams.get('cursor')
    if (!cursor) break
  }

  return allSpaces
}

// ============================
// Fetch Pages
// ============================

/**
 * Fetch all pages in a space with their body content.
 * Uses v2 API with cursor-based pagination.
 */
export async function fetchPagesBySpace(
  config: ConfluenceConnectionConfig,
  spaceId: string,
  onProgress?: (fetched: number) => void
): Promise<ConfluencePage[]> {
  const allPages: ConfluencePage[] = []
  let cursor: string | null = null

  while (true) {
    const params = new URLSearchParams({
      'space-id': spaceId,
      'body-format': 'storage',
      limit: '25', // Smaller batch since we're fetching full body
      status: 'current'
    })
    if (cursor) params.set('cursor', cursor)

    const data = await confluenceFetch(config, `/wiki/api/v2/pages?${params}`)

    for (const page of data.results || []) {
      allPages.push(parsePage(page, config))
    }

    onProgress?.(allPages.length)

    const nextLink = data._links?.next
    if (!nextLink) break

    const nextUrl = new URL(nextLink, 'https://placeholder.com')
    cursor = nextUrl.searchParams.get('cursor')
    if (!cursor) break

    // Small delay to avoid rate limits
    await sleep(200)
  }

  // Fetch labels for all pages (batch-friendly)
  await enrichPagesWithLabels(config, allPages)

  return allPages
}

/**
 * Fetch a single page by ID with full body content.
 */
export async function fetchPage(
  config: ConfluenceConnectionConfig,
  pageId: string
): Promise<ConfluencePage> {
  const data = await confluenceFetch(
    config,
    `/wiki/api/v2/pages/${pageId}?body-format=storage`
  )
  return parsePage(data, config)
}

/**
 * Search pages using CQL (Confluence Query Language).
 * Uses v1 API since v2 doesn't have CQL search yet.
 */
export async function searchPages(
  config: ConfluenceConnectionConfig,
  cql: string,
  limit: number = 50
): Promise<ConfluencePage[]> {
  const params = new URLSearchParams({
    cql,
    limit: String(limit),
    expand: 'body.storage,version,space,ancestors,metadata.labels'
  })

  const data = await confluenceFetch(config, `/wiki/rest/api/content/search?${params}`)

  return (data.results || []).map((page: any) => parseV1Page(page, config))
}

// ============================
// Page Parsing
// ============================

function parsePage(raw: any, config: ConfluenceConnectionConfig): ConfluencePage {
  const rawBody = raw.body?.storage?.value || ''
  const baseUrl = normalizeBaseUrl(config.siteUrl)

  return {
    id: raw.id,
    spaceId: raw.spaceId || '',
    spaceKey: '', // v2 API doesn't return space key inline — will enrich later
    title: raw.title || '',
    status: raw.status || 'current',
    body: extractTextFromStorage(rawBody),
    labels: [], // Will be enriched separately
    parentId: raw.parentId || null,
    parentTitle: null, // Would need separate fetch
    version: raw.version?.number || 1,
    createdAt: raw.createdAt || '',
    updatedAt: raw.version?.createdAt || '',
    authorName: raw.version?.authorId || null,
    webUrl: raw._links?.webui ? `${baseUrl}/wiki${raw._links.webui}` : null,
    rawBody
  }
}

function parseV1Page(raw: any, config: ConfluenceConnectionConfig): ConfluencePage {
  const rawBody = raw.body?.storage?.value || ''
  const baseUrl = normalizeBaseUrl(config.siteUrl)
  const labels = (raw.metadata?.labels?.results || []).map((l: any) => l.name)

  return {
    id: raw.id,
    spaceId: raw.space?.id || '',
    spaceKey: raw.space?.key || '',
    title: raw.title || '',
    status: raw.status || 'current',
    body: extractTextFromStorage(rawBody),
    labels,
    parentId: raw.ancestors?.length > 0 ? raw.ancestors[raw.ancestors.length - 1].id : null,
    parentTitle: raw.ancestors?.length > 0 ? raw.ancestors[raw.ancestors.length - 1].title : null,
    version: raw.version?.number || 1,
    createdAt: raw.history?.createdDate || '',
    updatedAt: raw.version?.when || '',
    authorName: raw.version?.by?.displayName || null,
    webUrl: raw._links?.webui ? `${baseUrl}/wiki${raw._links.webui}` : null,
    rawBody
  }
}

// ============================
// Label Enrichment
// ============================

async function enrichPagesWithLabels(
  config: ConfluenceConnectionConfig,
  pages: ConfluencePage[]
): Promise<void> {
  // Batch label fetching — 5 concurrent requests
  const CONCURRENCY = 5
  for (let i = 0; i < pages.length; i += CONCURRENCY) {
    const batch = pages.slice(i, i + CONCURRENCY)
    const results = await Promise.allSettled(
      batch.map(async (page) => {
        try {
          const data = await confluenceFetch(
            config,
            `/wiki/api/v2/pages/${page.id}/labels?limit=25`
          )
          page.labels = (data.results || []).map((l: any) => l.name || l.label)
        } catch {
          // Non-fatal — skip labels for this page
        }
      })
    )
    // Small delay between batches
    if (i + CONCURRENCY < pages.length) await sleep(100)
  }
}

// ============================
// XHTML Storage Format → Plain Text
// ============================

/**
 * Extract clean text from Confluence XHTML storage format.
 *
 * Storage format contains HTML-like markup:
 * - <p>, <h1>-<h6>, <ul>/<ol>/<li>, <table>, <code>, <pre>
 * - Macros: <ac:structured-macro ac:name="code">, <ac:structured-macro ac:name="toc">
 * - Rich text: <ac:link>, <ac:image>, <ri:attachment>
 *
 * Strategy: Strip HTML tags, preserve text with line breaks for block elements.
 */
export function extractTextFromStorage(html: string): string {
  if (!html) return ''

  let text = html

  // 1. Remove CDATA sections but keep content
  text = text.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')

  // 2. Replace <br> and <br/> with newlines
  text = text.replace(/<br\s*\/?>/gi, '\n')

  // 3. Replace block-level closing tags with newlines
  const blockTags = [
    'p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'li', 'tr', 'th', 'td', 'blockquote', 'pre'
  ]
  for (const tag of blockTags) {
    text = text.replace(new RegExp(`</${tag}>`, 'gi'), '\n')
  }

  // 4. Add newline before block-level opening tags
  for (const tag of blockTags) {
    text = text.replace(new RegExp(`<${tag}[^>]*>`, 'gi'), '\n')
  }

  // 5. Handle list items — add bullet marker
  text = text.replace(/<li[^>]*>/gi, '\n• ')

  // 6. Handle table cells — add separator
  text = text.replace(/<td[^>]*>/gi, ' | ')
  text = text.replace(/<th[^>]*>/gi, ' | ')
  text = text.replace(/<\/tr>/gi, '\n')

  // 7. Handle Confluence macros
  // Code blocks: extract the body
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body>([\s\S]*?)<\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    '\n```\n$1\n```\n'
  )

  // Info/note/warning panels: extract body text
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="(info|note|warning|tip)"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    '\n[$1] $2\n'
  )

  // Expand macros: extract body
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="expand"[^>]*>([\s\S]*?)<\/ac:structured-macro>/gi,
    '\n$1\n'
  )

  // Remove all remaining Confluence-specific tags (ac:*, ri:*)
  text = text.replace(/<\/?(?:ac|ri):[^>]*>/gi, '')

  // 8. Handle links — keep text
  text = text.replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, '$1')

  // 9. Handle images — placeholder
  text = text.replace(/<img[^>]*alt="([^"]*)"[^>]*>/gi, '[$1]')
  text = text.replace(/<img[^>]*>/gi, '[image]')

  // 10. Strip all remaining HTML tags
  text = text.replace(/<[^>]+>/g, '')

  // 11. Decode HTML entities
  text = decodeHtmlEntities(text)

  // 12. Clean up whitespace
  text = text.replace(/\n{3,}/g, '\n\n')  // Max 2 consecutive newlines
  text = text.replace(/[ \t]+/g, ' ')      // Collapse horizontal whitespace
  text = text.replace(/^ +| +$/gm, '')     // Trim each line

  return text.trim()
}

function decodeHtmlEntities(text: string): string {
  const entities: Record<string, string> = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
    '&apos;': "'",
    '&nbsp;': ' ',
    '&ndash;': '–',
    '&mdash;': '—',
    '&bull;': '•',
    '&hellip;': '…',
    '&copy;': '©',
    '&reg;': '®',
    '&trade;': '™'
  }

  let result = text
  for (const [entity, char] of Object.entries(entities)) {
    result = result.replace(new RegExp(entity, 'g'), char)
  }

  // Numeric entities
  result = result.replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
  result = result.replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))

  return result
}

// ============================
// Chunk Confluence Pages for Brain
// ============================

/**
 * Convert a Confluence page to a text chunk suitable for embedding.
 */
export function pageToChunkContent(page: ConfluencePage): string {
  const lines: string[] = [
    `# ${page.title}`,
  ]

  if (page.spaceKey) lines.push(`Space: ${page.spaceKey}`)
  if (page.labels.length > 0) lines.push(`Labels: ${page.labels.join(', ')}`)
  if (page.authorName) lines.push(`Author: ${page.authorName}`)
  lines.push(`Updated: ${page.updatedAt}`)
  if (page.parentTitle) lines.push(`Parent: ${page.parentTitle}`)

  if (page.body) {
    lines.push('', '---', '', page.body)
  }

  return lines.join('\n')
}

// ============================
// Fetch Single Page for Chat Auto-Fetch
// ============================

/**
 * Extract Confluence page references from a message that contains Atlassian wiki URLs.
 * Matches patterns like:
 *   https://mysite.atlassian.net/wiki/spaces/TEAM/pages/12345/Page+Title
 *   https://mysite.atlassian.net/wiki/spaces/TEAM/pages/12345
 *   https://mysite.atlassian.net/wiki/x/AbCdEf (tiny link)
 * Returns array of { siteUrl, pageId, tinyLink } for each matched URL.
 */
export function extractConfluenceReferences(text: string): Array<{ siteUrl: string; pageId: string | null; tinyLink: string | null }> {
  const results: Array<{ siteUrl: string; pageId: string | null; tinyLink: string | null }> = []

  // Pattern 1: Full page URL — /wiki/spaces/KEY/pages/PAGEID/optional-title
  const fullPageRegex = /https?:\/\/([\w.-]+\.atlassian\.net)\/wiki\/spaces\/[\w-]+\/pages\/(\d+)(?:\/[^\s)\]]*)?/gi
  let match: RegExpExecArray | null
  while ((match = fullPageRegex.exec(text)) !== null) {
    results.push({
      siteUrl: `https://${match[1]}`,
      pageId: match[2],
      tinyLink: null
    })
  }

  // Pattern 2: Tiny link — /wiki/x/AbCdEf
  const tinyRegex = /https?:\/\/([\w.-]+\.atlassian\.net)\/wiki\/x\/([\w-]+)/gi
  while ((match = tinyRegex.exec(text)) !== null) {
    // Check we haven't already captured this URL as a full page URL
    const alreadyCaptured = results.some(r => r.siteUrl === `https://${match![1]}` && r.pageId)
    if (!alreadyCaptured) {
      results.push({
        siteUrl: `https://${match[1]}`,
        pageId: null,
        tinyLink: match[2]
      })
    }
  }

  return results
}

/**
 * Fetch a single Confluence page by ID or tiny link.
 * Used by chat flow to auto-fetch page content when user pastes a Confluence URL.
 */
export async function fetchConfluencePageByRef(
  config: ConfluenceConnectionConfig,
  ref: { pageId: string | null; tinyLink: string | null }
): Promise<ConfluencePage> {
  // Case 1: Direct page ID from full URL (e.g., /wiki/spaces/KEY/pages/12345/Title)
  if (ref.pageId) {
    return fetchPage(config, ref.pageId)
  }

  // Case 2: Tiny link (e.g., /wiki/x/AbCdEf) — decode base64url to page ID
  if (ref.tinyLink) {
    const decoded = decodeTinyLink(ref.tinyLink)
    if (decoded) {
      return fetchPage(config, decoded)
    }
    throw new Error(`Cannot decode Confluence tiny link: /wiki/x/${ref.tinyLink}`)
  }

  throw new Error('No pageId or tinyLink provided')
}

/**
 * Decode Confluence tiny link code to page ID.
 * Confluence uses a modified base64 encoding for tiny links:
 * The code is base64url-decoded to get the raw page ID bytes.
 */
function decodeTinyLink(code: string): string | null {
  try {
    // Confluence tiny links use a custom base64 encoding where the code maps to the page ID
    // The encoding is: base64url(bigEndianBytes(pageId))
    const buffer = Buffer.from(code, 'base64url')
    if (buffer.length === 0) return null
    // Convert bytes to number (big-endian)
    let pageId = 0
    for (const byte of buffer) {
      pageId = pageId * 256 + byte
    }
    return pageId > 0 ? String(pageId) : null
  } catch {
    return null
  }
}

// ============================
// Helpers
// ============================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
