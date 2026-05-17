import { join } from 'path'
import { app } from 'electron'
import { existsSync } from 'fs'

export interface RepoRecord {
  id: string
  source_type: string
  source_path: string
}

export function getRepoLocalPath(repo: RepoRecord): string | null {
  if (repo.source_type === 'local') return repo.source_path
  if (repo.source_type === 'github') {
    return join(app.getPath('userData'), 'cortex-data', 'clones', repo.id)
  }
  return null
}

export function getRepoLocalPathIfExists(repo: RepoRecord): string | null {
  const path = getRepoLocalPath(repo)
  if (path === null) return null
  if (!existsSync(path)) return null
  if (repo.source_type === 'github' && !existsSync(join(path, '.git'))) return null
  return path
}

export function getRepoDisplayName(repo: RepoRecord): string {
  return repo.source_path.split('/').filter(Boolean).pop() || repo.source_path
}
