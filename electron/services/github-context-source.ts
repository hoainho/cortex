/**
 * GitHub Context Source — Auto-fetch GitHub Issues and PRs
 *
 * Implements ContextSource interface to auto-fetch GitHub Issues and Pull Requests
 * when user pastes GitHub URLs in chat messages.
 */

import type { ContextSource, ContextRef, FetchedContext } from './context-source'
import { getServiceConfig } from './settings-service'
import { getDb } from './db'
import { callToolByServerName } from './skills/mcp/mcp-manager'

const GITHUB_API = 'https://api.github.com'

async function githubFetch(url: string, token?: string): Promise<any> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'Cortex-Desktop'
  }
  if (token) {
    headers.Authorization = `token ${token}`
  }

  const response = await fetch(url, {
    headers,
    signal: AbortSignal.timeout(10000)
  })

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Not accessible. Configure GitHub token in Settings for private repos.')
    }
    if (response.status === 403) {
      const remaining = response.headers.get('X-RateLimit-Remaining')
      if (remaining === '0') {
        throw new Error('GitHub API rate limit reached. Add a token in Settings for higher limits.')
      }
      throw new Error('GitHub API forbidden (403). Add a token in Settings.')
    }
    throw new Error(`GitHub API error ${response.status}`)
  }

  const rateLimitRemaining = response.headers.get('X-RateLimit-Remaining')
  if (rateLimitRemaining && parseInt(rateLimitRemaining) < 10) {
    console.warn(`[GitHub] Rate limit low: ${rateLimitRemaining} requests remaining`)
  }

  return response.json()
}

async function fetchGitHubIssue(
  owner: string, repo: string, number: string, token?: string
): Promise<{ issue: any; comments: any[] }> {
  const issue = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/issues/${number}`, token)

  let comments: any[] = []
  try {
    comments = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${number}/comments?per_page=10`, token
    )
  } catch {
    // Comments are supplementary — don't fail the whole fetch
  }

  return { issue, comments }
}

async function fetchGitHubPR(
  owner: string, repo: string, number: string, token?: string
): Promise<{ pr: any; files: any[] }> {
  const pr = await githubFetch(`${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}`, token)

  let files: any[] = []
  try {
    files = await githubFetch(
      `${GITHUB_API}/repos/${owner}/${repo}/pulls/${number}/files?per_page=30`, token
    )
  } catch {
    // Files list is supplementary
  }

  return { pr, files }
}

function formatIssueContent(issue: any, comments: any[]): string {
  const labels = (issue.labels || []).map((l: any) => l?.name).filter(Boolean).join(', ')
  const body = (issue.body || '(no description)').slice(0, 3000)

  let content = `GITHUB ISSUE: ${issue.title} (#${issue.number})\n`
  content += `State: ${issue.state} | Author: ${issue.user?.login || 'unknown'} | Created: ${issue.created_at}\n`
  if (labels) content += `Labels: ${labels}\n`
  content += `\n${body}\n`

  const topComments = comments.slice(0, 5)
  if (topComments.length > 0) {
    content += `\n--- Comments (${comments.length}) ---\n`
    for (const c of topComments) {
      const commentBody = (c.body || '').slice(0, 500)
      content += `[${c.user?.login || 'unknown'}]: ${commentBody}\n\n`
    }
  }

  return content
}

function formatPRContent(pr: any, files: any[]): string {
  const body = (pr.body || '(no description)').slice(0, 2000)

  let content = `GITHUB PR: ${pr.title} (#${pr.number})\n`
  content += `State: ${pr.state} | Author: ${pr.user?.login || 'unknown'} | Created: ${pr.created_at}\n`
  content += `Base: ${pr.base?.ref || '?'} <- Head: ${pr.head?.ref || '?'}\n`
  content += `+${pr.additions ?? 0} -${pr.deletions ?? 0} across ${pr.changed_files ?? 0} files\n`
  content += `\n${body}\n`

  const topFiles = files.slice(0, 20)
  if (topFiles.length > 0) {
    content += `\n--- Changed Files ---\n`
    for (const f of topFiles) {
      content += `${f.status || '?'} ${f.filename} (+${f.additions ?? 0} -${f.deletions ?? 0})\n`
    }
  }

  return content
}

export class GitHubContextSource implements ContextSource {
  name = 'GITHUB'

  extractReferences(query: string): ContextRef[] {
    const regex = /https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/(issues|pull)\/(\d+)/gi
    const refs: ContextRef[] = []
    let match: RegExpExecArray | null

    while ((match = regex.exec(query)) !== null) {
      const owner = match[1]
      const repo = match[2]
      const kind = match[3]
      const number = match[4]

      refs.push({
        type: kind === 'pull' ? 'github-pr' : 'github-issue',
        url: match[0],
        label: `${owner}/${repo}#${number}`,
        metadata: { owner, repo, number, kind }
      })
    }

    return refs
  }

  isAvailable(_projectId: string): boolean {
    return true
  }

  private resolveToken(): string | undefined {
    const settingsToken = getServiceConfig('github')?.token
    if (settingsToken) return settingsToken

    try {
      const db = getDb()
      const rows = db.prepare(
        "SELECT env FROM mcp_servers WHERE LOWER(name) LIKE '%github%' AND env IS NOT NULL"
      ).all() as Array<{ env: string }>
      for (const row of rows) {
        try {
          const env = JSON.parse(row.env)
          const pat = env.GITHUB_PERSONAL_ACCESS_TOKEN || env.GITHUB_TOKEN || env.GH_TOKEN
          if (pat) return pat
        } catch {}
      }
    } catch {}

    return undefined
  }

  async fetchContent(ref: ContextRef, _projectId: string): Promise<FetchedContext> {
    const token = this.resolveToken()
    const { owner, repo, number, kind } = ref.metadata
    const source = kind === 'pull' ? 'GITHUB PR' : 'GITHUB ISSUE'

    try {
      console.log(`[GitHub] Fetching ${kind} ${ref.label} via API...`)

      let content: string
      if (kind === 'pull') {
        const { pr, files } = await fetchGitHubPR(owner, repo, number, token)
        content = formatPRContent(pr, files)
      } else {
        const { issue, comments } = await fetchGitHubIssue(owner, repo, number, token)
        content = formatIssueContent(issue, comments)
      }

      console.log(`[GitHub] ✅ Fetched ${ref.label} (${content.length} chars)`)
      return { source, content, url: ref.url }
    } catch (apiErr) {
      console.warn(`[GitHub] API failed for ${ref.label}, trying MCP fallback...`)
    }

    try {
      const mcpTool = kind === 'pull' ? 'get_pull_request' : 'get_issue'
      const mcpResult = await callToolByServerName('github', mcpTool, {
        owner,
        repo,
        pull_number: kind === 'pull' ? parseInt(number) : undefined,
        issue_number: kind !== 'pull' ? parseInt(number) : undefined,
      })

      if (mcpResult) {
        let content = typeof mcpResult === 'string' ? mcpResult : JSON.stringify(mcpResult, null, 2)

        if (kind === 'pull') {
          try {
            const filesResult = await callToolByServerName('github', 'get_pull_request_files', {
              owner, repo, pull_number: parseInt(number)
            })
            if (filesResult) {
              const filesStr = typeof filesResult === 'string' ? filesResult : JSON.stringify(filesResult, null, 2)
              content += `\n\n--- Changed Files ---\n${filesStr}`
            }
          } catch {}
        }

        console.log(`[GitHub] ✅ Fetched ${ref.label} via MCP (${content.length} chars)`)
        return { source, content, url: ref.url }
      }
    } catch (mcpErr) {
      console.warn(`[GitHub] MCP fallback also failed for ${ref.label}:`, mcpErr)
    }

    return { source, content: '', url: ref.url, error: 'Failed via API and MCP. Check GitHub token in Settings or MCP server env.' }
  }
}
