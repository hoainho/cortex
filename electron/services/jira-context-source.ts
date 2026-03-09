/**
 * Jira Context Source — Adapter wrapping existing jira-service.ts
 *
 * Implements ContextSource interface to auto-fetch Jira tickets
 * when user pastes Atlassian URLs in chat messages.
 */

import type { ContextSource, ContextRef, FetchedContext } from './context-source'
import { extractJiraReferences, fetchSingleIssue, issueToChunkContent } from './jira-service'
import { getProjectAtlassianConfig } from './atlassian-config-service'

export class JiraContextSource implements ContextSource {
  name = 'JIRA TICKET'

  extractReferences(query: string): ContextRef[] {
    return extractJiraReferences(query).map(ref => ({
      type: 'jira',
      url: `${ref.siteUrl}/browse/${ref.issueKey}`,
      label: ref.issueKey,
      metadata: { siteUrl: ref.siteUrl, issueKey: ref.issueKey }
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

    console.log(`[Jira] Fetching ticket ${ref.metadata.issueKey} from ${config.siteUrl}...`)
    const issue = await fetchSingleIssue(
      { siteUrl: config.siteUrl, email: config.email, apiToken: config.apiToken },
      ref.metadata.issueKey
    )
    const content = issueToChunkContent(issue)
    console.log(`[Jira] ✅ Fetched ${ref.metadata.issueKey} (${content.length} chars)`)

    return {
      source: this.name,
      content,
      url: ref.url
    }
  }
}
