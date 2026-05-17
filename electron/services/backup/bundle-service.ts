import { app, safeStorage } from 'electron'
import { join, basename, normalize } from 'path'
import { homedir } from 'os'
import {
  existsSync, mkdirSync, copyFileSync, rmSync, readdirSync,
  readFileSync, writeFileSync, statSync, cpSync
} from 'fs'
import { createHash, randomBytes, pbkdf2Sync, createCipheriv, createDecipheriv } from 'crypto'
import { tmpdir } from 'os'
import { createWriteStream } from 'fs'
import archiver from 'archiver'
import { getDb } from '../db'
import Database from 'better-sqlite3'

export interface BundleManifest {
  version: string
  cortexVersion: string
  platform: NodeJS.Platform
  createdAt: number
  dbChecksum: string
  hasSecrets: boolean
  hasQdrant: boolean
  extraData?: string[]
}

export interface BundleMetadata {
  projects: Array<{
    id: string
    name: string
    sourcePaths: string[]
  }>
  totalConversations: number
  totalMessages: number
}

export interface BundlePreview {
  valid: boolean
  manifest: BundleManifest
  metadata: BundleMetadata
  passwordCorrect: boolean
  pathsNeedingRemap: string[]
}

export interface PathMapping {
  oldPath: string
  newPath: string
}

export interface ExportResult {
  success: boolean
  outputPath?: string
  sizeBytes?: number
  error?: string
}

export interface ImportResult {
  success: boolean
  pathsNeedingRemap: string[]
  requiresRestart: boolean
  error?: string
}

const BUNDLE_VERSION = '1.0'
const PBKDF2_ITERATIONS = 100_000
const PBKDF2_KEYLEN = 32
const PBKDF2_DIGEST = 'sha256'
const SALT_BYTES = 32
const IV_BYTES = 12
const AUTH_TAG_BYTES = 16

function getDbPath(): string {
  return join(app.getPath('userData'), 'cortex-data', 'cortex.db')
}

function sha256File(filePath: string): string {
  const content = readFileSync(filePath)
  return createHash('sha256').update(content).digest('hex')
}

function encryptWithPassword(plaintext: string, password: string): string {
  const salt = randomBytes(SALT_BYTES)
  const iv = randomBytes(IV_BYTES)
  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)

  const cipher = createCipheriv('aes-256-gcm', key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()

  const result = Buffer.concat([salt, iv, authTag, encrypted])
  return result.toString('base64')
}

function decryptWithPassword(ciphertext: string, password: string): string {
  const buf = Buffer.from(ciphertext, 'base64')

  const salt = buf.subarray(0, SALT_BYTES)
  const iv = buf.subarray(SALT_BYTES, SALT_BYTES + IV_BYTES)
  const authTag = buf.subarray(SALT_BYTES + IV_BYTES, SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES)
  const encrypted = buf.subarray(SALT_BYTES + IV_BYTES + AUTH_TAG_BYTES)

  const key = pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEYLEN, PBKDF2_DIGEST)
  const decipher = createDecipheriv('aes-256-gcm', key, iv)
  decipher.setAuthTag(authTag)

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()])
  return decrypted.toString('utf8')
}

function collectAllSecrets(): Record<string, string> {
  const db = getDb()
  const rows = db.prepare('SELECT key, value, encrypted FROM settings WHERE encrypted = 1').all() as Array<{
    key: string; value: string; encrypted: number
  }>

  const secrets: Record<string, string> = {}
  for (const row of rows) {
    if (safeStorage.isEncryptionAvailable()) {
      try {
        secrets[row.key] = safeStorage.decryptString(Buffer.from(row.value, 'base64'))
      } catch {
        secrets[row.key] = ''
      }
    }
  }
  return secrets
}

function buildMetadata(): BundleMetadata {
  const db = getDb()

  const projects = (db.prepare('SELECT id, name FROM projects ORDER BY created_at').all() as Array<{
    id: string; name: string
  }>).map(p => {
    const repos = db.prepare('SELECT source_path FROM repositories WHERE project_id = ?').all(p.id) as Array<{ source_path: string }>
    return {
      id: p.id,
      name: p.name,
      sourcePaths: repos.map(r => r.source_path)
    }
  })

  const { total: totalConversations } = db.prepare('SELECT COUNT(*) as total FROM conversations').get() as { total: number }
  const { total: totalMessages } = db.prepare('SELECT COUNT(*) as total FROM messages').get() as { total: number }

  return { projects, totalConversations, totalMessages }
}

function makeTempDir(): string {
  const dir = join(tmpdir(), `cortex-bundle-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function getUserDataDir(): string {
  return app.getPath('userData')
}

function copyDirIfExists(src: string, dest: string): boolean {
  if (!existsSync(src)) return false
  mkdirSync(dest, { recursive: true })
  cpSync(src, dest, { recursive: true, errorOnExist: false })
  return true
}

function getExtraDataLocations(): Array<{ key: string; src: string }> {
  const userData = getUserDataDir()
  return [
    { key: 'instincts',        src: join(userData, 'cortex-data', 'instincts') },
    { key: 'session-summaries', src: join(userData, 'cortex-data', 'session-summaries') },
    { key: 'projects-data',    src: join(userData, 'cortex-data', 'projects') },
    { key: 'cortex-store',     src: join(userData, 'cortex-store.json') },
    { key: 'agent-memory',     src: join(homedir(), '.cortex', 'agent-memory') },
  ]
}

function zipDir(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = createWriteStream(outputPath)
    const archive = archiver('zip', { zlib: { level: 6 } })

    output.on('close', resolve)
    archive.on('error', reject)

    archive.pipe(output)
    archive.directory(sourceDir, false)
    archive.finalize()
  })
}

function unzipTo(bundlePath: string, targetDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const { execFile } = require('child_process') as typeof import('child_process')
    execFile('unzip', ['-o', bundlePath, '-d', targetDir], (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

export async function exportBundle(
  outputPath: string,
  password: string,
  onProgress?: (pct: number, msg: string) => void
): Promise<ExportResult> {
  const tmpDir = makeTempDir()

  try {
    onProgress?.(5, 'Preparing database...')

    const dbPath = getDbPath()
    if (!existsSync(dbPath)) {
      return { success: false, error: 'Database not found' }
    }

    try {
      getDb().pragma('wal_checkpoint(FULL)')
    } catch {}

    onProgress?.(15, 'Collecting encrypted secrets...')
    const secrets = collectAllSecrets()

    onProgress?.(25, 'Creating safe database copy...')
    const tmpDbPath = join(tmpDir, 'cortex.db')
    copyFileSync(dbPath, tmpDbPath)

    const tmpDb = new Database(tmpDbPath)
    tmpDb.pragma('journal_mode = WAL')
    tmpDb.prepare("UPDATE settings SET value = '', encrypted = 0 WHERE encrypted = 1").run()
    tmpDb.close()

    onProgress?.(40, 'Encrypting secrets...')
    const secretsJson = JSON.stringify(secrets)
    const secretsEnc = encryptWithPassword(secretsJson, password)
    writeFileSync(join(tmpDir, 'secrets.enc'), secretsEnc, 'utf8')

    onProgress?.(55, 'Building metadata...')
    const metadata = buildMetadata()
    writeFileSync(join(tmpDir, 'metadata.json'), JSON.stringify(metadata, null, 2), 'utf8')

    onProgress?.(60, 'Copying extra data...')
    const extraData: string[] = []
    for (const { key, src } of getExtraDataLocations()) {
      const dest = join(tmpDir, 'extra', key)
      const isFile = src.endsWith('.json')
      if (isFile) {
        if (existsSync(src)) {
          mkdirSync(join(tmpDir, 'extra'), { recursive: true })
          copyFileSync(src, dest)
          extraData.push(key)
        }
      } else {
        if (copyDirIfExists(src, dest)) extraData.push(key)
      }
    }

    onProgress?.(68, 'Computing checksum...')
    const dbChecksum = sha256File(dbPath)

    const manifest: BundleManifest = {
      version: BUNDLE_VERSION,
      cortexVersion: app.getVersion(),
      platform: process.platform,
      createdAt: Date.now(),
      dbChecksum,
      hasSecrets: Object.keys(secrets).length > 0,
      hasQdrant: false,
      extraData
    }
    writeFileSync(join(tmpDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8')

    onProgress?.(78, 'Compressing bundle...')
    await zipDir(tmpDir, outputPath)

    const sizeBytes = statSync(outputPath).size
    onProgress?.(100, 'Done!')

    return { success: true, outputPath, sizeBytes }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

export async function previewBundle(
  bundlePath: string,
  password: string
): Promise<BundlePreview> {
  const tmpDir = makeTempDir()

  try {
    await unzipTo(bundlePath, tmpDir)

    const manifestRaw = readFileSync(join(tmpDir, 'manifest.json'), 'utf8')
    const manifest: BundleManifest = JSON.parse(manifestRaw)

    const metadataRaw = readFileSync(join(tmpDir, 'metadata.json'), 'utf8')
    const metadata: BundleMetadata = JSON.parse(metadataRaw)

    let passwordCorrect = false
    if (manifest.hasSecrets) {
      try {
        const enc = readFileSync(join(tmpDir, 'secrets.enc'), 'utf8')
        decryptWithPassword(enc, password)
        passwordCorrect = true
      } catch {
        passwordCorrect = false
      }
    } else {
      passwordCorrect = true
    }

    const pathsNeedingRemap = metadata.projects
      .flatMap(p => p.sourcePaths)
      .filter(p => !existsSync(p))

    return { valid: true, manifest, metadata, passwordCorrect, pathsNeedingRemap }
  } catch (err) {
    return {
      valid: false,
      manifest: {} as BundleManifest,
      metadata: { projects: [], totalConversations: 0, totalMessages: 0 },
      passwordCorrect: false,
      pathsNeedingRemap: []
    }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
  }
}

export async function importBundle(
  bundlePath: string,
  password: string,
  pathMappings?: PathMapping[],
  onProgress?: (pct: number, msg: string) => void
): Promise<ImportResult> {
  const tmpDir = makeTempDir()
  const dbPath = getDbPath()
  const preRestorePath = `${dbPath}.pre-import`

  try {
    onProgress?.(5, 'Reading bundle...')
    await unzipTo(bundlePath, tmpDir)

    const manifest: BundleManifest = JSON.parse(readFileSync(join(tmpDir, 'manifest.json'), 'utf8'))
    const metadata: BundleMetadata = JSON.parse(readFileSync(join(tmpDir, 'metadata.json'), 'utf8'))

    if (manifest.version !== BUNDLE_VERSION) {
      return { success: false, pathsNeedingRemap: [], requiresRestart: false, error: `Unsupported bundle version: ${manifest.version}` }
    }

    onProgress?.(20, 'Verifying password...')
    let secrets: Record<string, string> = {}
    if (manifest.hasSecrets) {
      try {
        const enc = readFileSync(join(tmpDir, 'secrets.enc'), 'utf8')
        secrets = JSON.parse(decryptWithPassword(enc, password))
      } catch {
        return { success: false, pathsNeedingRemap: [], requiresRestart: false, error: 'Incorrect password' }
      }
    }

    const pathsNeedingRemap = metadata.projects
      .flatMap(p => p.sourcePaths)
      .filter(p => !existsSync(p))

    onProgress?.(35, 'Backing up current database...')
    if (existsSync(dbPath)) {
      copyFileSync(dbPath, preRestorePath)
    }

    onProgress?.(50, 'Restoring database...')
    const restoredDbPath = join(tmpDir, 'cortex.db')
    if (!existsSync(restoredDbPath)) {
      return { success: false, pathsNeedingRemap, requiresRestart: false, error: 'Bundle is missing cortex.db' }
    }
    copyFileSync(restoredDbPath, dbPath)

    onProgress?.(65, 'Restoring encrypted secrets...')
    if (Object.keys(secrets).length > 0) {
      const restoredDb = new Database(dbPath)
      restoredDb.pragma('journal_mode = WAL')
      restoredDb.pragma('foreign_keys = ON')

      const upsert = restoredDb.prepare(
        'INSERT OR REPLACE INTO settings (key, value, encrypted, updated_at) VALUES (?, ?, ?, ?)'
      )

      for (const [key, plainValue] of Object.entries(secrets)) {
        if (!plainValue) continue
        let stored = plainValue
        let encrypted = 0

        if (safeStorage.isEncryptionAvailable()) {
          stored = safeStorage.encryptString(plainValue).toString('base64')
          encrypted = 1
        }
        upsert.run(key, stored, encrypted, Date.now())
      }
      restoredDb.close()
    }

    onProgress?.(75, 'Restoring extra data...')
    const extraDataMap: Record<string, string> = {}
    for (const { key, src } of getExtraDataLocations()) {
      extraDataMap[key] = src
    }
    const extraDir = join(tmpDir, 'extra')
    if (existsSync(extraDir)) {
      for (const key of readdirSync(extraDir)) {
        const src = join(extraDir, key)
        const dest = extraDataMap[key]
        if (!dest) continue
        const isFile = dest.endsWith('.json')
        if (isFile) {
          mkdirSync(join(dest, '..'), { recursive: true })
          copyFileSync(src, dest)
        } else {
          mkdirSync(dest, { recursive: true })
          cpSync(src, dest, { recursive: true, force: true })
        }
      }
    }

    if (pathMappings && pathMappings.length > 0) {
      onProgress?.(85, 'Applying path remappings...')
      const mappedDb = new Database(dbPath)
      mappedDb.pragma('journal_mode = WAL')
      const updatePath = mappedDb.prepare('UPDATE repositories SET source_path = ? WHERE source_path = ?')
      for (const { oldPath, newPath } of pathMappings) {
        updatePath.run(normalize(newPath), normalize(oldPath))
        updatePath.run(normalize(newPath), oldPath.replace(/\\/g, '/'))
        updatePath.run(normalize(newPath), oldPath.replace(/\//g, '\\'))
      }
      mappedDb.close()
    }

    onProgress?.(100, 'Import complete — restart required')
    return { success: true, pathsNeedingRemap, requiresRestart: true }
  } catch (err) {
    if (existsSync(preRestorePath)) {
      try {
        copyFileSync(preRestorePath, dbPath)
        console.log('[Bundle] Rolled back to pre-import DB after error')
      } catch {}
    }
    return { success: false, pathsNeedingRemap: [], requiresRestart: false, error: (err as Error).message }
  } finally {
    try { rmSync(tmpDir, { recursive: true, force: true }) } catch {}
    try { if (existsSync(preRestorePath)) rmSync(preRestorePath) } catch {}
  }
}
