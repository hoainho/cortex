import { app } from 'electron'
import { join } from 'path'
import { existsSync, mkdirSync, appendFileSync, readdirSync, statSync, rmSync, readFileSync } from 'fs'
import type { FreshnessReport } from './embedding-freshness-job'

const MAX_LOG_FILES = 30
const LOG_DIR = () => join(app.getPath('userData'), 'cortex-data', 'logs', 'freshness')

export interface FreshnessLogEntry {
  runId: string
  startedAt: number
  finishedAt: number
  success: boolean
  projectId: string
  summary: string
  reposChecked: number
  reposUpdated: number
  filesAdded: number
  filesModified: number
  filesDeleted: number
  chunksAdded: number
  chunksRemoved: number
  staleChunks: number
  embeddedCount: number
  embeddedFiles: string[]
  errors: Array<{ repoId: string; error: string }>
  logLines: string[]
}

export function writeFreshnessLog(report: FreshnessReport, logLines: string[], success: boolean): string {
  const dir = LOG_DIR()
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })

  const now = new Date()
  const dateStr = now.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const logFile = join(dir, `${dateStr}-${report.projectId.slice(0, 8)}.log`)

  const entry: FreshnessLogEntry = {
    runId: dateStr,
    startedAt: now.getTime() - report.durationMs,
    finishedAt: now.getTime(),
    success,
    projectId: report.projectId,
    summary: buildSummary(report),
    reposChecked: report.reposChecked,
    reposUpdated: report.reposUpdated,
    filesAdded: report.filesAdded,
    filesModified: report.filesModified,
    filesDeleted: report.filesDeleted,
    chunksAdded: report.chunksAdded,
    chunksRemoved: report.chunksRemoved,
    staleChunks: report.staleness?.staleChunks ?? 0,
    embeddedCount: report.embeddingResult?.embedded ?? 0,
    embeddedFiles: extractEmbeddedFiles(logLines),
    errors: report.errors,
    logLines
  }

  const header = [
    `╔═══════════════════════════════════════════════════════════════`,
    `║ Cortex Embedding Freshness Log`,
    `║ Run:     ${dateStr}`,
    `║ Project: ${report.projectId}`,
    `║ Status:  ${success ? '✓ SUCCESS' : '✗ FAILED'}`,
    `╚═══════════════════════════════════════════════════════════════`,
    '',
    '── SUMMARY ──────────────────────────────────────────────────────',
    entry.summary,
    '',
    '── DETAILS ──────────────────────────────────────────────────────',
    ...logLines,
    '',
    '── STATS ────────────────────────────────────────────────────────',
    `  Repos checked:   ${entry.reposChecked}`,
    `  Repos updated:   ${entry.reposUpdated}`,
    `  Files added:     ${entry.filesAdded}`,
    `  Files modified:  ${entry.filesModified}`,
    `  Files deleted:   ${entry.filesDeleted}`,
    `  Chunks added:    ${entry.chunksAdded}`,
    `  Chunks removed:  ${entry.chunksRemoved}`,
    `  Stale embeddings:${entry.staleChunks}`,
    `  Re-embedded:     ${entry.embeddedCount}`,
    `  Duration:        ${(report.durationMs / 1000).toFixed(1)}s`,
    '',
  ]

  if (entry.embeddedFiles.length > 0) {
    header.push('── RE-EMBEDDED FILES ─────────────────────────────────────────────')
    entry.embeddedFiles.forEach(f => header.push(`  • ${f}`))
    header.push('')
  }

  if (entry.errors.length > 0) {
    header.push('── ERRORS ───────────────────────────────────────────────────────')
    entry.errors.forEach(e => header.push(`  ✗ ${e.repoId}: ${e.error}`))
    header.push('')
  }

  header.push('─────────────────────────────────────────────────────────────────')

  appendFileSync(logFile, header.join('\n') + '\n')
  pruneOldLogs(dir)
  return logFile
}

export function listFreshnessLogs(): Array<{ file: string; date: string; sizeBytes: number }> {
  const dir = LOG_DIR()
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({
      file: join(dir, f),
      date: f.slice(0, 19).replace(/-/g, (m, i) => i === 10 ? 'T' : i === 13 || i === 16 ? ':' : '-').replace('T', ' '),
      sizeBytes: statSync(join(dir, f)).size
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

export function readFreshnessLog(filePath: string): string {
  if (!existsSync(filePath)) return 'Log file not found'
  return readFileSync(filePath, 'utf-8')
}

function buildSummary(report: FreshnessReport): string {
  const parts: string[] = []
  if (report.reposUpdated > 0) {
    parts.push(`Synced ${report.reposUpdated}/${report.reposChecked} repos`)
    parts.push(`+${report.filesAdded} added, ~${report.filesModified} modified, -${report.filesDeleted} deleted`)
  } else {
    parts.push(`All ${report.reposChecked} repos up-to-date`)
  }
  if ((report.embeddingResult?.embedded ?? 0) > 0) {
    parts.push(`Re-embedded ${report.embeddingResult.embedded} chunks`)
  } else {
    parts.push(`All embeddings fresh`)
  }
  return parts.join(' | ')
}

function extractEmbeddedFiles(logLines: string[]): string[] {
  return logLines
    .filter(l => l.includes('Embedding') && l.includes('/'))
    .map(l => l.replace(/.*Embedding\s+\d+\/\d+\.?\.\.\s*/, '').trim())
    .filter(Boolean)
}

function pruneOldLogs(dir: string): void {
  const files = readdirSync(dir)
    .filter(f => f.endsWith('.log'))
    .map(f => ({ name: f, path: join(dir, f), mtime: statSync(join(dir, f)).mtimeMs }))
    .sort((a, b) => b.mtime - a.mtime)

  files.slice(MAX_LOG_FILES).forEach(f => {
    try { rmSync(f.path) } catch {}
  })
}
