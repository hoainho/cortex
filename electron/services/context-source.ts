/**
 * Context Source — Plugin interface for external data sources
 *
 * All external integrations (Jira, Confluence, GitHub, Web Search, etc.)
 * implement ContextSource to plug into the generic context extraction pipeline.
 */

export interface ContextRef {
  type: string          // 'jira' | 'confluence' | 'github-issue' | 'github-pr' | 'web' etc.
  url: string           // Original URL from user message
  label: string         // Human-readable label for logging
  metadata: Record<string, string>  // Type-specific data (issueKey, pageId, owner/repo/number, etc.)
}

export interface FetchedContext {
  source: string        // 'JIRA TICKET' | 'CONFLUENCE PAGE' | 'GITHUB ISSUE' | etc.
  content: string       // Formatted text for LLM
  url: string           // Original URL
  error?: string        // If fetch failed
}

export interface ContextSource {
  name: string
  /** Extract references from user message text */
  extractReferences(query: string): ContextRef[]
  /** Fetch content for a single reference */
  fetchContent(ref: ContextRef, projectId: string): Promise<FetchedContext>
  /** Check if this source is configured/available for the project */
  isAvailable(projectId: string): boolean
}
