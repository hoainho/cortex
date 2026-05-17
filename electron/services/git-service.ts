/**
 * Git Service — Clone repos from GitHub, manage tokens, track commits
 *
 * Strategy:
 * - Use `git clone --depth 1` for shallow clone (fast, minimal disk)
 * - Store clone in app data directory
 * - Use safeStorage for encrypting GitHub tokens
 * - Support both HTTPS auth (token) and public repos
 */

import { execFile } from 'child_process'
import { promisify } from 'util'
import { app, safeStorage } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, rmSync } from 'fs'
import { getDb } from './db'

const execFileAsync = promisify(execFile)

// Where cloned repos live
function getClonesDir(): string {
  const dir = join(app.getPath('userData'), 'cortex-data', 'clones')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

export interface CloneResult {
  localPath: string
  branch: string
  latestSha: string
}

/**
 * Clone a GitHub repository
 */
export async function cloneRepository(
  repoUrl: string,
  repoId: string,
  token?: string,
  branch: string = 'main'
): Promise<CloneResult> {
  const clonesDir = getClonesDir()
  const targetDir = join(clonesDir, repoId)

  // Clean up if exists
  if (existsSync(targetDir)) {
    rmSync(targetDir, { recursive: true, force: true })
  }

  // Build authenticated URL if token provided
  let authUrl = repoUrl
  if (token) {
    const url = new URL(repoUrl)
    url.username = 'x-access-token'
    url.password = token
    authUrl = url.toString()
  }

  // Full clone (needed for branch switching support)
  try {
    await execFileAsync('git', [
      'clone',
      '--branch', branch,
      authUrl,
      targetDir
    ], {
      timeout: 300000, // 5 minute timeout for full clone
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0' // Don't prompt for credentials
      }
    })
  } catch (err: any) {
    // Try 'master' branch if 'main' fails
    if (branch === 'main' && err.stderr?.includes('not found')) {
      await execFileAsync('git', [
        'clone',
        '--branch', 'master',
        authUrl,
        targetDir
      ], {
        timeout: 300000,
        env: {
          ...process.env,
          GIT_TERMINAL_PROMPT: '0'
        }
      })
      branch = 'master'
    } else {
      throw new Error(`Failed to clone: ${err.stderr || err.message}`)
    }
  }

  // Strip token from stored remote URL (security: don't persist credentials in git config)
  if (token) {
    try {
      await execFileAsync('git', ['remote', 'set-url', 'origin', repoUrl], { cwd: targetDir })
    } catch { /* non-fatal */ }
  }

  const { stdout: sha } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: targetDir
  })

  return {
    localPath: targetDir,
    branch,
    latestSha: sha.trim()
  }
}

/**
 * Get the latest commit SHA for a cloned repo
 */
export async function getLatestSha(localPath: string): Promise<string> {
  const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
    cwd: localPath
  })
  return stdout.trim()
}

/**
 * Get list of files changed between two commits
 */
export async function getChangedFiles(
  localPath: string,
  fromSha: string,
  toSha: string
): Promise<{ added: string[]; modified: string[]; deleted: string[] }> {
  const { stdout } = await execFileAsync('git', [
    'diff',
    '--name-status',
    fromSha,
    toSha
  ], { cwd: localPath })

  const added: string[] = []
  const modified: string[] = []
  const deleted: string[] = []

  for (const line of stdout.split('\n').filter(Boolean)) {
    const [status, ...pathParts] = line.split('\t')
    const filePath = pathParts.join('\t')
    if (!filePath) continue

    switch (status.charAt(0)) {
      case 'A':
        added.push(filePath)
        break
      case 'M':
        modified.push(filePath)
        break
      case 'D':
        deleted.push(filePath)
        break
      case 'R':
        // Renamed — treat as delete old + add new
        deleted.push(filePath)
        if (pathParts.length > 1) added.push(pathParts[1])
        break
    }
  }

  return { added, modified, deleted }
}

/**
 * Pull latest changes for a cloned repo
 */
export async function pullLatest(
  localPath: string,
  token?: string
): Promise<{ newSha: string; changed: boolean }> {
  if (!existsSync(localPath)) {
    throw new Error(`Local clone not found at ${localPath} — please re-import the repository`)
  }
  const oldSha = await getLatestSha(localPath)
  const env = { ...process.env, ...GIT_ENV }

  console.log(`[Git] pullLatest: fetching remote (oldSha=${oldSha.slice(0, 7)})`)

  try {
    await withAuthRemote(localPath, token, () =>
      execFileAsync('git', [...NO_CREDENTIAL_HELPER, 'fetch', '--prune', 'origin'], { cwd: localPath, timeout: 30000, env }).then(() => undefined)
    )
  } catch (fetchErr: any) {
    const stderr: string = fetchErr.stderr || fetchErr.message || ''
    const isTokenError = stderr.includes('Invalid username or token') ||
      stderr.includes('Authentication failed') ||
      stderr.includes('could not read Username') ||
      stderr.includes('repository not found')
    console.warn(`[Git] fetch failed: ${stderr.split('\n')[0]}`)
    throw new Error(isTokenError
      ? 'GitHub token không hợp lệ hoặc đã hết hạn — vui lòng cập nhật token trong Settings'
      : `Không thể fetch từ GitHub: ${stderr.split('\n')[0]}`)
  }

  try {
    await execFileAsync('git', [...NO_CREDENTIAL_HELPER, 'merge', '--ff-only', 'FETCH_HEAD'], { cwd: localPath, timeout: 60000, env })
  } catch (mergeErr: any) {
    console.warn(`[Git] merge --ff-only failed: ${mergeErr.stderr?.split('\n')[0] || mergeErr.message}`)
    throw new Error(`Pull thất bại: ${mergeErr.stderr?.split('\n')[0] || mergeErr.message}`)
  }

  const newSha = await getLatestSha(localPath)
  console.log(`[Git] pullLatest: done (newSha=${newSha.slice(0, 7)}, changed=${oldSha !== newSha})`)

  return { newSha, changed: oldSha !== newSha }
}

async function getRemoteUrl(localPath: string): Promise<string | null> {
  try {
    const { stdout } = await execFileAsync('git', ['remote', 'get-url', 'origin'], {
      cwd: localPath
    })
    return stdout.trim()
  } catch {
    return null
  }
}

/**
 * Check if a GitHub repo is accessible (public or with token)
 */
export async function checkRepoAccess(
  repoUrl: string,
  token?: string
): Promise<{ accessible: boolean; isPrivate: boolean; error?: string }> {
  try {
    // Extract owner/repo from URL
    const match = repoUrl.match(/github\.com[/:]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
    if (!match) {
      return { accessible: false, isPrivate: false, error: 'Invalid GitHub URL' }
    }

    const [, owner, repo] = match
    const headers: Record<string, string> = {
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Cortex-App'
    }

    if (token) {
      headers.Authorization = `Bearer ${token}`
    }

    const response = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
      headers
    })

    if (response.ok) {
      const data = await response.json() as { private: boolean }
      return { accessible: true, isPrivate: data.private }
    }

    if (response.status === 404) {
      return {
        accessible: false,
        isPrivate: true,
        error: token
          ? 'Repository not found or token lacks access'
          : 'Private repository. Please provide a GitHub token.'
      }
    }

    return { accessible: false, isPrivate: false, error: `GitHub API error: ${response.status}` }
  } catch (err) {
    return {
      accessible: false,
      isPrivate: false,
      error: err instanceof Error ? err.message : 'Network error'
    }
  }
}

// ==================
// Organization Repos
// ==================

export interface OrgRepo {
  name: string
  fullName: string
  htmlUrl: string
  cloneUrl: string
  language: string | null
  isPrivate: boolean
  description: string | null
  defaultBranch: string
}

export async function listOrgRepos(orgName: string, token: string): Promise<OrgRepo[]> {
  const allRepos: OrgRepo[] = []
  let page = 1

  while (true) {
    const response = await fetch(
      `https://api.github.com/orgs/${encodeURIComponent(orgName)}/repos?per_page=100&page=${page}&type=all`,
      {
        headers: {
          Accept: 'application/vnd.github.v3+json',
          Authorization: `Bearer ${token}`,
          'User-Agent': 'Cortex-App'
        }
      }
    )

    if (!response.ok) {
      const body = await response.text().catch(() => '')
      throw new Error(`GitHub API error ${response.status}: ${body.slice(0, 200)}`)
    }

    const repos = await response.json() as Array<{
      name: string
      full_name: string
      html_url: string
      clone_url: string
      language: string | null
      private: boolean
      description: string | null
      default_branch: string
    }>

    if (repos.length === 0) break

    for (const r of repos) {
      allRepos.push({
        name: r.name,
        fullName: r.full_name,
        htmlUrl: r.html_url,
        cloneUrl: r.clone_url,
        language: r.language,
        isPrivate: r.private,
        description: r.description,
        defaultBranch: r.default_branch
      })
    }

    if (repos.length < 100) break
    page++
  }

  return allRepos
}

// ==================
// Token Management
// ==================

/**
 * Encrypt and store a GitHub token
 */
export function storeGitHubToken(tokenId: string, token: string): void {
  const db = getDb()
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token).toString('base64')
    : Buffer.from(token).toString('base64') // fallback (less secure)

  db.prepare(
    'INSERT OR REPLACE INTO github_tokens (id, token_encrypted) VALUES (?, ?)'
  ).run(tokenId, encrypted)
}

/**
 * Retrieve and decrypt a GitHub token
 */
export function getGitHubToken(tokenId: string): string | null {
  const db = getDb()
  const row = db
    .prepare('SELECT token_encrypted FROM github_tokens WHERE id = ?')
    .get(tokenId) as { token_encrypted: string } | undefined

  if (!row) return null

  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(row.token_encrypted, 'base64'))
    }
    return Buffer.from(row.token_encrypted, 'base64').toString('utf-8')
  } catch {
    return null
  }
}

/**
 * Delete a stored GitHub token
 */
export function deleteGitHubToken(tokenId: string): void {
  const db = getDb()
  db.prepare('DELETE FROM github_tokens WHERE id = ?').run(tokenId)
}

export function updateAllGitHubTokens(token: string): void {
  const db = getDb()
  const encrypted = safeStorage.isEncryptionAvailable()
    ? safeStorage.encryptString(token).toString('base64')
    : Buffer.from(token).toString('base64')
  const rows = db.prepare('SELECT id FROM github_tokens').all() as Array<{ id: string }>
  const update = db.prepare('UPDATE github_tokens SET token_encrypted = ? WHERE id = ?')
  db.transaction(() => {
    for (const row of rows) update.run(encrypted, row.id)
  })()
  console.log(`[Git] updateAllGitHubTokens: updated ${rows.length} repo tokens`)
}

const GIT_ENV: Record<string, string> = { GIT_TERMINAL_PROMPT: '0', GIT_ASKPASS: 'echo', GCM_INTERACTIVE: 'never' }
const NO_CREDENTIAL_HELPER = ['-c', 'credential.helper=']

function injectTokenIntoUrl(remoteUrl: string, token: string): string | null {
  const sshMatch = remoteUrl.match(/^git@github\.com[:/]([\w.-]+)\/([\w.-]+?)(?:\.git)?$/)
  if (sshMatch) {
    return `https://x-access-token:${token}@github.com/${sshMatch[1]}/${sshMatch[2]}.git`
  }
  try {
    const u = new URL(remoteUrl)
    if (u.hostname === 'github.com' || u.hostname.endsWith('.github.com')) {
      u.username = 'x-access-token'
      u.password = token
      return u.toString()
    }
  } catch {}
  return null
}

async function withAuthRemote<T>(
  localPath: string,
  token: string | undefined,
  fn: () => Promise<T>
): Promise<T> {
  if (!token) return fn()
  const originalUrl = await getRemoteUrl(localPath)
  if (!originalUrl) return fn()
  const authedUrl = injectTokenIntoUrl(originalUrl, token)
  if (!authedUrl) {
    console.warn(`[Git] withAuthRemote: cannot inject token into URL "${originalUrl.slice(0, 40)}"`)
    return fn()
  }
  console.log(`[Git] withAuthRemote: setting auth URL (originalUrl=${originalUrl.replace(/https?:\/\/[^@]*@/, 'https://***@').slice(0, 60)})`)
  try {
    await execFileAsync('git', ['remote', 'set-url', 'origin', authedUrl], { cwd: localPath })
    return await fn()
  } finally {
    try {
      await execFileAsync('git', ['remote', 'set-url', 'origin', originalUrl], { cwd: localPath })
      console.log(`[Git] withAuthRemote: restored original URL`)
    } catch (restoreErr) {
      console.error(`[Git] CRITICAL: failed to restore remote URL`, restoreErr)
    }
  }
}

async function gitFetchWithAuth(localPath: string, token?: string): Promise<void> {
  await withAuthRemote(localPath, token, () =>
    execFileAsync('git', [...NO_CREDENTIAL_HELPER, 'fetch', '--all', '--prune'], {
      cwd: localPath,
      timeout: 30000,
      env: { ...process.env, ...GIT_ENV }
    }).then(() => undefined)
  )
}

// ==================
// Branch Management
// ==================

/**
 * List all remote branches for a cloned repo.
 * Optionally set auth token on remote before fetching (for private repos).
 */
export async function listBranches(localPath: string, token?: string): Promise<string[]> {
  try {
    try {
      await gitFetchWithAuth(localPath, token)
    } catch (fetchErr) {
      console.warn('[Git] Branch fetch failed (using cached refs):', (fetchErr as Error).message?.split('\n')[0])
    }

    // List remote branches from local refs (works even if fetch failed)
    let branches: string[] = []
    try {
      const { stdout } = await execFileAsync('git', [
        'branch', '-r', '--format=%(refname:short)'
      ], { cwd: localPath })

      branches = stdout
        .split('\n')
        .map(b => b.trim())
        .filter(b => b && !b.includes('HEAD'))
        .map(b => b.replace(/^origin\//, ''))
        .filter((v, i, a) => a.indexOf(v) === i)
    } catch (branchErr) {
      console.warn('[Git] Remote branch listing failed, falling back to local:', (branchErr as Error).message?.split('\n')[0])
    }

    // Fallback: check local branches if remote listing failed or returned nothing
    if (branches.length === 0) {
      try {
        const { stdout: localBranches } = await execFileAsync('git', [
          'branch', '--format=%(refname:short)'
        ], { cwd: localPath })
        branches = localBranches
          .split('\n')
          .map(b => b.trim())
          .filter(Boolean)
      } catch {
        // Last resort: try rev-parse to at least get current branch
        try {
          const { stdout: currentBranch } = await execFileAsync('git', [
            'rev-parse', '--abbrev-ref', 'HEAD'
          ], { cwd: localPath })
          const name = currentBranch.trim()
          if (name && name !== 'HEAD') branches = [name]
        } catch { /* truly broken repo */ }
      }
    }

    return branches
  } catch (err) {
    console.error('Failed to list branches:', err)
    return []
  }
}

/**
 * Switch to a different branch in a cloned repo
 */
export async function switchBranch(
  localPath: string,
  branch: string,
  token?: string
): Promise<{ sha: string }> {
  const env = { ...process.env, ...GIT_ENV }

  try {
    await execFileAsync('git', ['checkout', branch], { cwd: localPath, timeout: 30000, env })
  } catch {
    await execFileAsync('git', ['checkout', '-b', branch, `origin/${branch}`], { cwd: localPath, timeout: 30000, env })
  }

  try {
    await withAuthRemote(localPath, token, () =>
      execFileAsync('git', [...NO_CREDENTIAL_HELPER, 'pull', '--ff-only'], { cwd: localPath, timeout: 60000, env }).then(() => undefined)
    )
  } catch { /* non-fatal: may be up to date */ }

  const sha = await getLatestSha(localPath)
  return { sha }
}

/**
 * Get the current branch name
 */
export async function getCurrentBranch(localPath: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: localPath
    })
    return stdout.trim()
  } catch {
    return 'main'
  }
}

/**
 * Get files that differ between two branches
 */
export async function getBranchDiffFiles(
  localPath: string,
  baseBranch: string,
  targetBranch: string
): Promise<{ added: string[]; modified: string[]; deleted: string[] }> {
  try {
    const { stdout } = await execFileAsync('git', [
      'diff', '--name-status', `origin/${baseBranch}...${targetBranch}`
    ], { cwd: localPath })

    const added: string[] = []
    const modified: string[] = []
    const deleted: string[] = []

    for (const line of stdout.split('\n').filter(Boolean)) {
      const [status, ...pathParts] = line.split('\t')
      const filePath = pathParts.join('\t')
      if (!filePath) continue

      switch (status.charAt(0)) {
        case 'A':
          added.push(filePath)
          break
        case 'M':
          modified.push(filePath)
          break
        case 'D':
          deleted.push(filePath)
          break
        case 'R':
          deleted.push(filePath)
          if (pathParts.length > 1) added.push(pathParts[1])
          break
      }
    }

    return { added, modified, deleted }
  } catch (err) {
    console.error('Failed to get branch diff:', err)
    // If diff fails, return empty — will trigger full re-index
    return { added: [], modified: [], deleted: [] }
  }
}
