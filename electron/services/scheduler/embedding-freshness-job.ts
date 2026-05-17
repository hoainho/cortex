import { app } from 'electron'
import { join } from 'path'
import { existsSync } from 'fs'
import { getDb } from '../db'
import { getLatestSha } from '../git-service'
import { syncGithubRepo, syncLocalRepo } from '../sync-engine'
import { embedStaleChunks, getEmbeddingStalenessReport } from '../embedder'
import type { StalenessReport } from '../embedder'

export interface FreshnessReport {
  projectId: string
  reposChecked: number
  reposAlreadyFresh: number
  reposUpdated: number
  filesAdded: number
  filesModified: number
  filesDeleted: number
  chunksAdded: number
  chunksRemoved: number
  staleness: StalenessReport
  embeddingResult: { embedded: number; skipped: number }
  errors: Array<{ repoId: string; error: string }>
  durationMs: number
}

export async function runEmbeddingFreshnessCheck(
  projectId: string,
  onProgress?: (msg: string) => void
): Promise<FreshnessReport> {
  const start = Date.now()
  const db = getDb()
  const log = (msg: string) => {
    console.log(`[EmbeddingFreshness] ${msg}`)
    onProgress?.(msg)
  }

  const report: FreshnessReport = {
    projectId,
    reposChecked: 0,
    reposAlreadyFresh: 0,
    reposUpdated: 0,
    filesAdded: 0,
    filesModified: 0,
    filesDeleted: 0,
    chunksAdded: 0,
    chunksRemoved: 0,
    staleness: getEmbeddingStalenessReport(projectId),
    embeddingResult: { embedded: 0, skipped: 0 },
    errors: [],
    durationMs: 0
  }

  const repos = db
    .prepare("SELECT * FROM repositories WHERE project_id = ? AND status != 'error'")
    .all(projectId) as Array<{
      id: string
      source_type: string
      source_path: string
      last_indexed_sha: string | null
      last_indexed_at: number | null
      active_branch: string
    }>

  if (repos.length === 0) {
    log('No repositories found for project.')
    report.durationMs = Date.now() - start
    return report
  }

  log(`Checking ${repos.length} repo(s) for embedding freshness...`)
  report.reposChecked = repos.length

  for (const repo of repos) {
    try {
      if (repo.source_type === 'github') {
        const clonePath = join(app.getPath('userData'), 'cortex-data', 'clones', repo.id)

        if (!existsSync(clonePath)) {
          log(`  [${repo.id}] Clone not found at ${clonePath} — skipping`)
          report.errors.push({ repoId: repo.id, error: 'Clone directory not found' })
          continue
        }

        const currentSha = await getLatestSha(clonePath).catch(() => null)
        if (!currentSha) {
          log(`  [${repo.id}] Could not get HEAD SHA — skipping`)
          continue
        }

        if (currentSha === repo.last_indexed_sha) {
          log(`  [${repo.id}] Already fresh (SHA: ${currentSha.slice(0, 7)})`)
          report.reposAlreadyFresh++
          continue
        }

        log(`  [${repo.id}] SHA changed: ${(repo.last_indexed_sha ?? 'none').slice(0, 7)} → ${currentSha.slice(0, 7)}`)
        const result = await syncGithubRepo(projectId, repo.id, null)
        report.reposUpdated++
        report.filesAdded += result.filesAdded
        report.filesModified += result.filesModified
        report.filesDeleted += result.filesDeleted
        report.chunksAdded += result.chunksAdded
        report.chunksRemoved += result.chunksRemoved
        log(`  [${repo.id}] Synced: +${result.filesAdded} added, ~${result.filesModified} modified, -${result.filesDeleted} deleted`)
      } else if (repo.source_type === 'local') {
        const localPath = repo.source_path
        if (!existsSync(localPath)) {
          log(`  [${repo.id}] Local path not found: ${localPath} — skipping`)
          report.errors.push({ repoId: repo.id, error: `Path not found: ${localPath}` })
          continue
        }

        const lastIndexedAt = repo.last_indexed_at ?? 0
        const hasRecentIndex = Date.now() - lastIndexedAt < 5 * 60 * 1000
        if (hasRecentIndex) {
          log(`  [${repo.id}] Indexed ${Math.round((Date.now() - lastIndexedAt) / 60000)}m ago — skipping`)
          report.reposAlreadyFresh++
          continue
        }

        log(`  [${repo.id}] Scanning local changes (last indexed: ${new Date(lastIndexedAt).toLocaleTimeString()})`)
        const result = await syncLocalRepo(projectId, repo.id, localPath, null)

        if (result.filesAdded === 0 && result.filesModified === 0 && result.filesDeleted === 0) {
          log(`  [${repo.id}] No changes detected`)
          report.reposAlreadyFresh++
        } else {
          report.reposUpdated++
          report.filesAdded += result.filesAdded
          report.filesModified += result.filesModified
          report.filesDeleted += result.filesDeleted
          report.chunksAdded += result.chunksAdded
          report.chunksRemoved += result.chunksRemoved
          log(`  [${repo.id}] Synced: +${result.filesAdded} added, ~${result.filesModified} modified, -${result.filesDeleted} deleted`)
        }
      } else {
        log(`  [${repo.id}] Source type '${repo.source_type}' not supported for freshness check`)
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      log(`  [${repo.id}] Error: ${msg}`)
      report.errors.push({ repoId: repo.id, error: msg })
    }
  }

  log('Checking embedding staleness by content hash...')
  const freshStaleness = getEmbeddingStalenessReport(projectId)
  report.staleness = freshStaleness

  if (freshStaleness.staleChunks > 0) {
    log(`Re-embedding ${freshStaleness.staleChunks} stale chunks (${freshStaleness.missingEmbedding} missing, ${freshStaleness.contentChanged} content-changed)...`)
    report.embeddingResult = await embedStaleChunks(projectId, (processed, total) => {
      log(`  Embedding ${processed}/${total}...`)
    })
    log(`Re-embed done: ${report.embeddingResult.embedded} embedded, ${report.embeddingResult.skipped} skipped`)
  } else {
    log('All embeddings are current — no re-embedding needed')
    report.embeddingResult = { embedded: 0, skipped: freshStaleness.totalChunks }
  }

  report.durationMs = Date.now() - start

  const syncSummary = report.reposUpdated > 0
    ? `Updated ${report.reposUpdated}/${report.reposChecked} repos — +${report.filesAdded} added, ~${report.filesModified} modified, -${report.filesDeleted} deleted`
    : `All ${report.reposChecked} repos up-to-date`
  const embedSummary = report.embeddingResult.embedded > 0
    ? ` | Re-embedded ${report.embeddingResult.embedded} chunks`
    : ` | All ${freshStaleness.totalChunks} embeddings fresh`
  log(`Done in ${(report.durationMs / 1000).toFixed(1)}s — ${syncSummary}${embedSummary}`)

  return report
}
