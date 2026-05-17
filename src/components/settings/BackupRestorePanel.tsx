import { useState, useEffect } from 'react'
import {
  Download, Upload, Eye, EyeOff, FolderOpen,
  CheckCircle, AlertCircle, Loader2, RefreshCw, Database
} from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { Input } from '../ui/Input'

type Tab = 'export' | 'import'

interface BackupInfo {
  filename: string
  date: string
  sizeBytes: number
  path: string
  createdAt: number
}

interface BundlePreview {
  valid: boolean
  manifest: {
    version: string
    cortexVersion: string
    platform: string
    createdAt: number
    hasSecrets: boolean
  }
  metadata: {
    projects: Array<{ id: string; name: string; sourcePaths: string[] }>
    totalConversations: number
    totalMessages: number
  }
  passwordCorrect: boolean
  pathsNeedingRemap: string[]
}

interface PathMapping {
  oldPath: string
  newPath: string
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function formatDate(ts: number): string {
  return new Date(ts).toLocaleString()
}

export function BackupRestorePanel() {
  const [tab, setTab] = useState<Tab>('export')

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--border-primary)] pb-3">
        {(['export', 'import'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-1.5 text-sm rounded-md capitalize transition-colors',
              tab === t
                ? 'bg-[var(--accent-primary)] text-white'
                : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)]'
            )}
          >
            {t === 'export' ? '⬇ Export' : '⬆ Import'}
          </button>
        ))}
      </div>

      {tab === 'export' ? <ExportTab /> : <ImportTab />}

      <AutoBackupStatus />
    </div>
  )
}

function ExportTab() {
  const [outputPath, setOutputPath] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')
  const [resultSize, setResultSize] = useState(0)

  useEffect(() => {
    const handler = (_: unknown, data: { pct: number; msg: string }) => {
      setProgress(data.pct)
      setProgressMsg(data.msg)
    }
    window.electronAPI?.onBundleExportProgress?.(handler)
    return () => window.electronAPI?.offBundleExportProgress?.(handler)
  }, [])

  const choosePath = async () => {
    const p = await window.electronAPI?.bundleChooseExportPath?.()
    if (p) setOutputPath(p)
  }

  const runExport = async () => {
    if (!outputPath) { setError('Choose a save location first'); return }
    if (!password) { setError('Password is required'); return }
    if (password !== confirmPassword) { setError('Passwords do not match'); return }
    if (password.length < 8) { setError('Password must be at least 8 characters'); return }

    setStatus('running')
    setError('')
    setProgress(0)

    const result = await window.electronAPI?.bundleExport?.(outputPath, password)
    if (result?.success) {
      setStatus('success')
      setResultSize(result.sizeBytes ?? 0)
    } else {
      setStatus('error')
      setError(result?.error ?? 'Export failed')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Export all your data — conversations, memory, settings — into a portable <code className="text-xs bg-[var(--bg-secondary)] px-1 rounded">.cortex</code> file.
        Your API keys will be encrypted with your password.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide block mb-1">
            Save Location
          </label>
          <div className="flex gap-2">
            <Input
              value={outputPath}
              onChange={e => setOutputPath(e.target.value)}
              placeholder="Click Browse to choose..."
              className="flex-1 text-sm"
              readOnly
            />
            <Button variant="secondary" size="sm" onClick={choosePath}>
              <FolderOpen className="w-4 h-4 mr-1" /> Browse
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide block mb-1">
            Backup Password
          </label>
          <div className="relative">
            <Input
              type={showPass ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Min. 8 characters"
              className="pr-9 text-sm"
            />
            <button
              onClick={() => setShowPass(v => !v)}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide block mb-1">
            Confirm Password
          </label>
          <Input
            type={showPass ? 'text' : 'password'}
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="text-sm"
          />
        </div>
      </div>

      {status === 'running' && (
        <div className="space-y-1">
          <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{progressMsg}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
          <CheckCircle className="w-4 h-4" />
          Export complete — {formatBytes(resultSize)}
        </div>
      )}

      {(status === 'error' || error) && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      <Button
        onClick={runExport}
        disabled={status === 'running'}
        className="w-full"
      >
        {status === 'running'
          ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Exporting...</>
          : <><Download className="w-4 h-4 mr-2" /> Export Backup</>
        }
      </Button>
    </div>
  )
}

function ImportTab() {
  const [bundlePath, setBundlePath] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [preview, setPreview] = useState<BundlePreview | null>(null)
  const [previewing, setPreviewing] = useState(false)
  const [pathMappings, setPathMappings] = useState<PathMapping[]>([])
  const [progress, setProgress] = useState(0)
  const [progressMsg, setProgressMsg] = useState('')
  const [status, setStatus] = useState<'idle' | 'running' | 'success' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    const handler = (_: unknown, data: { pct: number; msg: string }) => {
      setProgress(data.pct)
      setProgressMsg(data.msg)
    }
    window.electronAPI?.onBundleImportProgress?.(handler)
    return () => window.electronAPI?.offBundleImportProgress?.(handler)
  }, [])

  const chooseBundle = async () => {
    const p = await window.electronAPI?.bundleChooseImportPath?.()
    if (p) {
      setBundlePath(p)
      setPreview(null)
      setPathMappings([])
    }
  }

  const loadPreview = async () => {
    if (!bundlePath || !password) { setError('Select a file and enter password first'); return }
    setPreviewing(true)
    setError('')
    try {
      const p = await window.electronAPI?.bundlePreview?.(bundlePath, password)
      if (!p?.valid) { setError('Invalid or corrupted bundle file'); return }
      if (!p.passwordCorrect) { setError('Incorrect password'); return }
      setPreview(p)
      setPathMappings(p.pathsNeedingRemap.map(oldPath => ({ oldPath, newPath: '' })))
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setPreviewing(false)
    }
  }

  const browseNewPath = async (idx: number) => {
    const result = await window.electronAPI?.openFolderDialog?.()
    if (result) {
      setPathMappings(prev => prev.map((m, i) => i === idx ? { ...m, newPath: result } : m))
    }
  }

  const runImport = async () => {
    if (!bundlePath || !password || !preview) return
    const unmapped = pathMappings.filter(m => !m.newPath)
    if (unmapped.length > 0) {
      setError(`Map all ${unmapped.length} path(s) before importing`)
      return
    }

    setStatus('running')
    setError('')
    setProgress(0)

    const result = await window.electronAPI?.bundleImport?.(bundlePath, password, pathMappings.filter(m => m.newPath))
    if (result?.success) {
      setStatus('success')
    } else {
      setStatus('error')
      setError(result?.error ?? 'Import failed')
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[var(--text-secondary)]">
        Restore from a <code className="text-xs bg-[var(--bg-secondary)] px-1 rounded">.cortex</code> backup file.
        Your current data will be replaced. The app will restart after import.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide block mb-1">
            Backup File
          </label>
          <div className="flex gap-2">
            <Input
              value={bundlePath}
              placeholder="Select a .cortex file..."
              className="flex-1 text-sm"
              readOnly
            />
            <Button variant="secondary" size="sm" onClick={chooseBundle}>
              <FolderOpen className="w-4 h-4 mr-1" /> Browse
            </Button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--text-secondary)] uppercase tracking-wide block mb-1">
            Backup Password
          </label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Enter backup password"
                className="pr-9 text-sm"
              />
              <button
                onClick={() => setShowPass(v => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              >
                {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Button variant="secondary" size="sm" onClick={loadPreview} disabled={previewing}>
              {previewing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Eye className="w-4 h-4 mr-1" />}
              {!previewing && 'Preview'}
            </Button>
          </div>
        </div>
      </div>

      {preview && (
        <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-3 space-y-3 text-sm">
          <div className="flex items-center gap-2 text-green-600 dark:text-green-400 font-medium">
            <CheckCircle className="w-4 h-4" /> Valid backup
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-[var(--text-secondary)]">
            <span>Created</span>
            <span className="text-[var(--text-primary)]">{formatDate(preview.manifest.createdAt)}</span>
            <span>Cortex version</span>
            <span className="text-[var(--text-primary)]">{preview.manifest.cortexVersion}</span>
            <span>Platform</span>
            <span className="text-[var(--text-primary)]">{preview.manifest.platform}</span>
            <span>Projects</span>
            <span className="text-[var(--text-primary)]">{preview.metadata.projects.length}</span>
            <span>Conversations</span>
            <span className="text-[var(--text-primary)]">{preview.metadata.totalConversations}</span>
            <span>Messages</span>
            <span className="text-[var(--text-primary)]">{preview.metadata.totalMessages}</span>
          </div>

          {pathMappings.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                ⚠ {pathMappings.length} project path(s) not found on this machine — map them below:
              </p>
              {pathMappings.map((mapping, idx) => (
                <div key={idx} className="space-y-1">
                  <p className="text-xs text-[var(--text-tertiary)] truncate font-mono">
                    {mapping.oldPath}
                  </p>
                  <div className="flex gap-2">
                    <Input
                      value={mapping.newPath}
                      onChange={e => setPathMappings(prev => prev.map((m, i) => i === idx ? { ...m, newPath: e.target.value } : m))}
                      placeholder="New path on this machine..."
                      className="flex-1 text-xs"
                    />
                    <Button variant="secondary" size="sm" onClick={() => browseNewPath(idx)}>
                      <FolderOpen className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {status === 'running' && (
        <div className="space-y-1">
          <div className="h-1.5 bg-[var(--bg-secondary)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--accent-primary)] rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-[var(--text-secondary)]">{progressMsg}</p>
        </div>
      )}

      {status === 'success' && (
        <div className="rounded-lg bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 p-3 space-y-1">
          <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400 font-medium">
            <CheckCircle className="w-4 h-4" /> Import successful
          </div>
          <p className="text-xs text-green-600 dark:text-green-500">
            Please restart Cortex to apply all changes.
          </p>
          <Button
            size="sm"
            className="mt-2"
            onClick={() => window.electronAPI?.appRestart?.()}
          >
            Restart Now
          </Button>
        </div>
      )}

      {(status === 'error' || error) && (
        <div className="flex items-center gap-2 text-sm text-red-500">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}

      {preview && status !== 'success' && (
        <div className="space-y-2">
          <div className="flex items-start gap-2 rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 p-2.5 text-xs text-amber-700 dark:text-amber-400">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            Your current data will be replaced. A pre-import backup is created automatically.
          </div>
          <Button
            onClick={runImport}
            disabled={status === 'running'}
            variant="danger"
            className="w-full"
          >
            {status === 'running'
              ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Importing...</>
              : <><Upload className="w-4 h-4 mr-2" /> Import & Replace Data</>
            }
          </Button>
        </div>
      )}

      {!preview && (
        <Button onClick={loadPreview} disabled={!bundlePath || !password || previewing} className="w-full" variant="secondary">
          {previewing
            ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Verifying...</>
            : <><Eye className="w-4 h-4 mr-2" /> Verify & Preview Backup</>
          }
        </Button>
      )}
    </div>
  )
}

function AutoBackupStatus() {
  const [backups, setBackups] = useState<BackupInfo[]>([])
  const [loading, setLoading] = useState(false)
  const [lastRun, setLastRun] = useState<number | null>(null)
  const [runStatus, setRunStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle')

  const load = async () => {
    setLoading(true)
    try {
      const [list, last] = await Promise.all([
        window.electronAPI?.backupList?.() ?? [],
        window.electronAPI?.backupLastTime?.() ?? null
      ])
      setBackups(list)
      setLastRun(last)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const runNow = async () => {
    setRunStatus('running')
    const result = await window.electronAPI?.backupRunNow?.()
    setRunStatus(result?.success ? 'done' : 'error')
    await load()
    setTimeout(() => setRunStatus('idle'), 3000)
  }

  return (
    <div className="border-t border-[var(--border-primary)] pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
          <Database className="w-4 h-4" />
          Auto Daily Backups
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
          </Button>
          <Button variant="secondary" size="sm" onClick={runNow} disabled={runStatus === 'running'}>
            {runStatus === 'running'
              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
              : runStatus === 'done'
                ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                : 'Backup Now'
            }
          </Button>
        </div>
      </div>

      <p className="text-xs text-[var(--text-secondary)]">
        {lastRun ? `Last backup: ${formatDate(lastRun)}` : 'No backups yet'}
        {' · '}Keeps 7 days
      </p>

      {backups.length > 0 && (
        <div className="space-y-1">
          {backups.slice(0, 5).map(b => (
            <div key={b.filename} className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="font-mono">{b.date}</span>
              <span>{formatBytes(b.sizeBytes)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
