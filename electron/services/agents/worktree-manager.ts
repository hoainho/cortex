import { execSync } from 'child_process'
import { existsSync, rmSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

export interface WorktreeInfo {
  worktreePath: string
  agentId: string
  basePath: string
  createdAt: number
}

const activeWorktrees = new Map<string, WorktreeInfo>()
const STALE_HOURS = 24

function isGitRepo(dir: string): boolean {
  try {
    execSync('git rev-parse --git-dir', { cwd: dir, stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function createWorktree(basePath: string, agentId: string): string | null {
  if (!isGitRepo(basePath)) {
    console.warn('[WorktreeManager] Not a git repo, skipping worktree:', basePath)
    return null
  }

  const worktreePath = join(tmpdir(), `cortex-wt-${randomUUID()}`)
  try {
    execSync(`git worktree add "${worktreePath}" HEAD`, { cwd: basePath, stdio: 'pipe' })
    activeWorktrees.set(agentId, { worktreePath, agentId, basePath, createdAt: Date.now() })
    console.log(`[WorktreeManager] Created worktree for agent ${agentId}: ${worktreePath}`)
    return worktreePath
  } catch (err) {
    console.error('[WorktreeManager] Failed to create worktree:', err)
    return null
  }
}

export function removeWorktree(agentId: string): void {
  const info = activeWorktrees.get(agentId)
  if (!info) return

  try {
    execSync(`git worktree remove "${info.worktreePath}" --force`, { cwd: info.basePath, stdio: 'pipe' })
  } catch {
    if (existsSync(info.worktreePath)) {
      rmSync(info.worktreePath, { recursive: true, force: true })
    }
  }

  activeWorktrees.delete(agentId)
  console.log(`[WorktreeManager] Removed worktree for agent ${agentId}`)
}

export function getWorktreePath(agentId: string): string | null {
  return activeWorktrees.get(agentId)?.worktreePath ?? null
}

export function getWorktreeChanges(agentId: string): string {
  const info = activeWorktrees.get(agentId)
  if (!info || !existsSync(info.worktreePath)) return ''

  try {
    return execSync('git diff HEAD --name-only', { cwd: info.worktreePath, stdio: 'pipe' }).toString().trim()
  } catch {
    return ''
  }
}

export function rewritePathForWorktree(originalPath: string, basePath: string, worktreePath: string): string {
  if (originalPath.startsWith(basePath)) {
    return join(worktreePath, originalPath.slice(basePath.length))
  }
  return originalPath
}

export function cleanupStaleWorktrees(): void {
  const now = Date.now()
  const staleMs = STALE_HOURS * 60 * 60 * 1000

  for (const [agentId, info] of activeWorktrees.entries()) {
    if (now - info.createdAt > staleMs) {
      console.warn(`[WorktreeManager] Cleaning stale worktree for agent ${agentId}`)
      removeWorktree(agentId)
    }
  }
}
