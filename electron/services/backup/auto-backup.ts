/**
 * Auto Backup Service — Daily automatic backup of cortex.db
 *
 * Keeps up to 7 days of backups at:
 *   ~/Library/Application Support/Cortex/cortex-data/backups/
 *
 * Strategy: copyFileSync after WAL checkpoint — safe, zero dependencies.
 */

import { app } from 'electron'
import { join } from 'path'
import {
  existsSync, mkdirSync, copyFileSync,
  readdirSync, rmSync, statSync
} from 'fs'
import { getDb } from '../db'

const MAX_BACKUP_DAYS = 7
const BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000 // 24 hours
const BACKUP_FILENAME_PREFIX = 'cortex-'

export interface BackupInfo {
  filename: string
  date: string       // YYYY-MM-DD
  sizeBytes: number
  path: string
  createdAt: number  // timestamp ms
}

export interface BackupResult {
  success: boolean
  path?: string
  sizeBytes?: number
  error?: string
}

// ─── Paths ────────────────────────────────────────────────────────────────────

function getBackupDir(): string {
  const dir = join(app.getPath('userData'), 'cortex-data', 'backups')
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
  return dir
}

function getDbPath(): string {
  return join(app.getPath('userData'), 'cortex-data', 'cortex.db')
}

function todayLabel(): string {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD
}

// ─── Core Logic ───────────────────────────────────────────────────────────────

/**
 * Run a backup right now. Safe to call any time.
 * Does a WAL checkpoint first to flush pending writes.
 */
export function runBackupNow(): BackupResult {
  const dbPath = getDbPath()
  if (!existsSync(dbPath)) {
    return { success: false, error: 'Database file not found' }
  }

  try {
    // Flush WAL before copy so the copy is consistent
    try {
      const db = getDb()
      db.pragma('wal_checkpoint(FULL)')
    } catch (err) {
      console.warn('[AutoBackup] WAL checkpoint warning (non-fatal):', (err as Error).message)
    }

    const backupDir = getBackupDir()
    const filename = `${BACKUP_FILENAME_PREFIX}${todayLabel()}.db`
    const backupPath = join(backupDir, filename)

    copyFileSync(dbPath, backupPath)

    const sizeBytes = statSync(backupPath).size
    pruneOldBackups()

    console.log(`[AutoBackup] Backup complete → ${filename} (${(sizeBytes / 1024 / 1024).toFixed(1)} MB)`)
    return { success: true, path: backupPath, sizeBytes }
  } catch (err) {
    const error = (err as Error).message
    console.error('[AutoBackup] Backup failed:', error)
    return { success: false, error }
  }
}

/**
 * List all available backups, newest first.
 */
export function listBackups(): BackupInfo[] {
  const backupDir = getBackupDir()
  try {
    return readdirSync(backupDir)
      .filter(f => f.startsWith(BACKUP_FILENAME_PREFIX) && f.endsWith('.db'))
      .map(filename => {
        const fullPath = join(backupDir, filename)
        const stats = statSync(fullPath)
        const date = filename.replace(BACKUP_FILENAME_PREFIX, '').replace('.db', '')
        return {
          filename,
          date,
          sizeBytes: stats.size,
          path: fullPath,
          createdAt: stats.mtimeMs
        }
      })
      .sort((a, b) => b.createdAt - a.createdAt)
  } catch {
    return []
  }
}

/**
 * Returns the timestamp of the most recent backup, or null if none exist.
 */
export function getLastBackupTime(): number | null {
  const backups = listBackups()
  return backups.length > 0 ? backups[0].createdAt : null
}

/**
 * Check whether today's backup has already been done.
 */
function isTodayBackedUp(): boolean {
  const today = todayLabel()
  return listBackups().some(b => b.date === today)
}

/**
 * Remove backup files older than MAX_BACKUP_DAYS.
 */
function pruneOldBackups(): void {
  const backups = listBackups()
  if (backups.length <= MAX_BACKUP_DAYS) return

  const toDelete = backups.slice(MAX_BACKUP_DAYS)
  for (const backup of toDelete) {
    try {
      rmSync(backup.path)
      console.log(`[AutoBackup] Pruned old backup: ${backup.filename}`)
    } catch (err) {
      console.warn(`[AutoBackup] Could not prune ${backup.filename}:`, (err as Error).message)
    }
  }
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let intervalHandle: ReturnType<typeof setInterval> | null = null

/**
 * Start the auto-backup scheduler.
 * Call this after app is ready and DB is initialized.
 * - Runs once immediately if today's backup is missing
 * - Then checks every 24h
 */
export function startAutoBackup(): void {
  if (intervalHandle) return // already running

  // Immediate check on startup
  if (!isTodayBackedUp()) {
    console.log('[AutoBackup] No backup for today — running initial backup...')
    runBackupNow()
  } else {
    console.log('[AutoBackup] Today\'s backup already exists, skipping startup backup.')
  }

  // Schedule daily check
  intervalHandle = setInterval(() => {
    if (!isTodayBackedUp()) {
      console.log('[AutoBackup] Running scheduled daily backup...')
      runBackupNow()
    }
  }, BACKUP_INTERVAL_MS)

  console.log('[AutoBackup] Scheduler started (interval: 24h, retention: 7 days)')
}

/**
 * Stop the auto-backup scheduler.
 * Call this on app quit.
 */
export function stopAutoBackup(): void {
  if (intervalHandle) {
    clearInterval(intervalHandle)
    intervalHandle = null
    console.log('[AutoBackup] Scheduler stopped.')
  }
}
