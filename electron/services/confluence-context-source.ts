/**
 * Confluence Context Source — Adapter wrapping existing confluence-service.ts
 *
 * Implements ContextSource interface to auto-fetch Confluence pages
 * when user pastes Atlassian wiki URLs in chat messages.
 */

import type { ContextSource, ContextRef, FetchedContext } from './context-source'
import { extractConfluenceReferences, fetchConfluencePageByRef, pageToChunkContent } from './confluence-service'
import { getProjectAtlassianConfig } from './atlassian-config-service'

export class ConfluenceContextSource implements ContextSource {
  name = 'CONFLUENCE PAGE'

  extractReferences(query: string): ContextRef[] {
    return extractConfluenceReferences(query).map(ref => ({
      type: 'confluence',
      url: ref.pageId
        ? `${ref.siteUrl}/wiki/spaces/unknown/pages/${ref.pageId}`
        : `${ref.siteUrl}/wiki/x/${ref.tinyLink}`,
      label: ref.pageId ? `page:${ref.pageId}` : `tinylink:${ref.tinyLink}`,
      metadata: {
        siteUrl: ref.siteUrl,
        pageId: ref.pageId || '',
        tinyLink: ref.tinyLink || ''
      }
    }))
  }

  isAvailable(projectId: string): boolean {
    return !!getProjectAtlassianConfig(projectId)
  }

  async fetchContent(ref: ContextRef, projectId: string): Promise<FetchedContext> {
    const config = getProjectAtlassianConfig(projectId)
    if (!config) {
      return {
        source: this.name,
        content: '',
        url: ref.url,
        error: 'Atlassian chưa được cấu hình cho project này'
      }
    }

    const pageLabel = ref.metadata.pageId || `tinylink:${ref.metadata.tinyLink}`
    console.log(`[Confluence] Fetching page ${pageLabel} from ${config.siteUrl}...`)

    const page = await fetchConfluencePageByRef(
      { siteUrl: config.siteUrl, email: config.email, apiToken: config.apiToken },
      {
        pageId: ref.metadata.pageId || null,
        tinyLink: ref.metadata.tinyLink || null
      }
    )
    const content = pageToChunkContent(page)
    console.log(`[Confluence] ✅ Fetched ${page.title} (${content.length} chars)`)

    return {
      source: this.name,
      content,
      url: ref.url
    }
  }
}
