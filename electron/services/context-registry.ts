/**
 * Context Registry — Manages registered ContextSource plugins
 *
 * Provides a single entry point to extract and fetch external context
 * from all registered sources (Jira, Confluence, GitHub, Web Search, etc.).
 */

import type { ContextSource, FetchedContext } from './context-source'

const sources: ContextSource[] = []

export function registerContextSource(source: ContextSource): void {
  sources.push(source)
  console.log(`[Context] Registered source: ${source.name}`)
}

export function getAllContextSources(): ContextSource[] {
  return sources
}

/**
 * Extract references from query text and fetch content from all available sources.
 * Returns fetched contexts (successful and failed).
 */
export async function extractAndFetchAllContext(
  query: string,
  projectId: string,
  maxPerSource: number = 3
): Promise<FetchedContext[]> {
  const results: FetchedContext[] = []

  for (const source of sources) {
    if (!source.isAvailable(projectId)) continue

    const refs = source.extractReferences(query).slice(0, maxPerSource)
    for (const ref of refs) {
      try {
        const fetched = await source.fetchContent(ref, projectId)
        results.push(fetched)
        console.log(`[Context] Fetched ${source.name}: ${ref.label} (${fetched.content.length} chars)`)
      } catch (err) {
        results.push({
          source: source.name,
          content: '',
          url: ref.url,
          error: err instanceof Error ? err.message : 'unknown error'
        })
        console.error(`[Context] Failed ${source.name}: ${ref.label}:`, err)
      }
    }
  }

  return results
}
