/**
 * Web Search Context Source — ContextSource adapter for web search
 *
 * Handles explicit "search:" prefix triggers through the ContextSource pipeline.
 * Error-pattern and low-confidence triggers are handled in chat:send directly.
 */

import type { ContextSource, ContextRef, FetchedContext } from './context-source'
import { detectWebSearchTrigger, searchWeb, webResultsToChunkContent, isWebSearchEnabled } from './websearch-service'

export class WebSearchContextSource implements ContextSource {
  name = 'WEB SEARCH'

  extractReferences(query: string): ContextRef[] {
    const trigger = detectWebSearchTrigger(query)

    if (trigger.triggered && trigger.reason === 'explicit_prefix') {
      return [{
        type: 'web-search',
        url: `search://${trigger.searchQuery}`,
        label: `Web: ${trigger.searchQuery.slice(0, 50)}`,
        metadata: { searchQuery: trigger.searchQuery, reason: trigger.reason }
      }]
    }

    return []
  }

  isAvailable(_projectId: string): boolean {
    return isWebSearchEnabled()
  }

  async fetchContent(ref: ContextRef, _projectId: string): Promise<FetchedContext> {
    const searchQuery = ref.metadata.searchQuery

    try {
      const results = await searchWeb(searchQuery)
      const content = webResultsToChunkContent(results)
      console.log(`[WebSearch] Fetched ${results.length} results for "${searchQuery.slice(0, 50)}"`)

      return { source: this.name, content, url: ref.url }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err)
      console.warn(`[WebSearch] Failed: ${errorMsg}`)
      return { source: this.name, content: '', url: ref.url, error: errorMsg }
    }
  }
}
