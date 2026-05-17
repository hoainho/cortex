import type { SkillOutput } from './skills/types'

const GITHUB_API = 'https://api.github.com'

function formatForGitHub(content: string): string {
  return content
    .replace(/^# /gm, '### ')
    .replace(/^## /gm, '### ')
}

async function githubPatch(url: string, body: Record<string, unknown>, token: string): Promise<void> {
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cortex-Desktop'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`GitHub PATCH ${url} → ${res.status}`)
}

async function githubPost(url: string, body: Record<string, unknown>, token: string): Promise<{ id: number }> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/vnd.github.v3+json',
      Authorization: `token ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': 'Cortex-Desktop'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000)
  })
  if (!res.ok) throw new Error(`GitHub POST ${url} → ${res.status}`)
  return res.json()
}

export async function routeOutputToGitHub(output: SkillOutput, token: string): Promise<void> {
  if (!output.githubTarget) return
  const { owner, repo, commentId, prNumber, issueNumber } = output.githubTarget
  const formattedBody = formatForGitHub(output.content)

  if (commentId) {
    await githubPatch(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
      { body: formattedBody },
      token
    )
    return
  }

  const entityNumber = prNumber ?? issueNumber
  if (entityNumber) {
    await githubPost(
      `${GITHUB_API}/repos/${owner}/${repo}/issues/${entityNumber}/comments`,
      { body: formattedBody },
      token
    )
  }
}

export async function createTrackingComment(
  owner: string,
  repo: string,
  entityNumber: number,
  token: string,
  initialBody: string
): Promise<number> {
  const data = await githubPost(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/${entityNumber}/comments`,
    { body: initialBody },
    token
  )
  return data.id
}

export async function updateTrackingComment(
  owner: string,
  repo: string,
  commentId: number,
  token: string,
  body: string
): Promise<void> {
  await githubPatch(
    `${GITHUB_API}/repos/${owner}/${repo}/issues/comments/${commentId}`,
    { body: formatForGitHub(body) },
    token
  )
}
