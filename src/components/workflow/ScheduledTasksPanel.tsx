import { useState, useEffect, useRef } from 'react'
import { Play, Pause, Trash2, Loader2, CheckCircle, AlertCircle, RefreshCw, DatabaseZap, ScrollText, X, ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils'
import { Button } from '../ui/Button'
import { useProjectStore } from '../../stores/projectStore'

interface ScheduledTask {
  name: string
  cron: string
  agent: string
  prompt: string
  enabled: boolean
  projectId?: string
  lastRunAt?: number
  nextRunAt?: number
}

interface TaskRunRecord {
  taskName: string
  startedAt: number
  finishedAt: number
  success: boolean
  summary?: string
  error?: string
}

function formatTime(ts: number | undefined): string {
  if (!ts) return '—'
  return new Date(ts).toLocaleString()
}

function formatCron(cron: string): string {
  const map: Record<string, string> = {
    '0 3 * * *': 'Daily at 3 AM',
    '0 2 * * *': 'Daily at 2 AM',
    '0 8 * * *': 'Daily at 8 AM',
    '0 23 * * *': 'Daily at 11 PM',
    '0 9 * * 1': 'Every Monday 9 AM',
    '0 * * * *': 'Every hour',
  }
  return map[cron] ?? cron
}

function isFreshnessTask(name: string) {
  return name.startsWith('embedding-freshness-check')
}

export function ScheduledTasksPanel() {
  const [tasks, setTasks] = useState<ScheduledTask[]>([])
  const [history, setHistory] = useState<TaskRunRecord[]>([])
  const [loading, setLoading] = useState(false)
  const [triggerStatus, setTriggerStatus] = useState<Record<string, 'idle' | 'running' | 'done' | 'error'>>({})
  const activeProjectId = useProjectStore(s => s.activeProjectId)

  const reload = async () => {
    setLoading(true)
    try {
      const [t, h] = await Promise.all([
        window.electronAPI?.schedulerList?.() ?? [],
        window.electronAPI?.schedulerHistory?.() ?? [],
      ])
      const projectTasks = (t as ScheduledTask[]).filter(task =>
        !task.projectId || task.projectId === activeProjectId
      )
      setTasks(projectTasks)
      setHistory((h as TaskRunRecord[]).slice(-20).reverse())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { reload() }, [activeProjectId])

  const toggle = async (task: ScheduledTask) => {
    if (task.enabled) {
      await window.electronAPI?.schedulerDisable?.(task.name)
    } else {
      await window.electronAPI?.schedulerEnable?.(task.name)
    }
    await reload()
  }

  const remove = async (name: string) => {
    await window.electronAPI?.schedulerUnregister?.(name)
    await reload()
  }

  const trigger = async (name: string) => {
    setTriggerStatus(prev => ({ ...prev, [name]: 'running' }))
    await window.electronAPI?.schedulerTrigger?.(name)
    setTriggerStatus(prev => ({ ...prev, [name]: 'done' }))
    setTimeout(() => setTriggerStatus(prev => ({ ...prev, [name]: 'idle' })), 3000)
    setTimeout(reload, 1500)
  }

  const taskHistory = (name: string) =>
    history.filter(h => h.taskName === name).slice(0, 3)

  if (tasks.length === 0 && !loading) {
    return (
      <div className="text-[12px] text-[var(--text-tertiary)] py-2">
        No scheduled tasks for this project yet.
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={reload} disabled={loading}>
          <RefreshCw className={cn('w-3.5 h-3.5', loading && 'animate-spin')} />
        </Button>
      </div>

      {tasks.map(task => {
        const ts = triggerStatus[task.name] || 'idle'
        const recentRuns = taskHistory(task.name)
        const lastRun = recentRuns[0]

        return (
          <div
            key={task.name}
            className={cn(
              'rounded-lg border border-[var(--border-primary)] p-3 space-y-2',
              task.enabled ? 'bg-[var(--bg-primary)]' : 'bg-[var(--bg-secondary)] opacity-60'
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  {isFreshnessTask(task.name) && (
                    <DatabaseZap className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                  )}
                  <span className="text-[12px] font-medium text-[var(--text-primary)]">
                    {isFreshnessTask(task.name) ? 'Embedding Freshness Check' : task.name}
                  </span>
                  <span className={cn(
                    'text-[10px] px-1.5 py-0.5 rounded-full font-medium',
                    task.enabled
                      ? 'bg-green-500/10 text-green-600 dark:text-green-400'
                      : 'bg-[var(--bg-secondary)] text-[var(--text-tertiary)]'
                  )}>
                    {task.enabled ? 'active' : 'paused'}
                  </span>
                </div>

                <p className="text-[11px] text-[var(--text-secondary)] mt-0.5">
                  {isFreshnessTask(task.name)
                    ? 'Checks all repositories for code changes and re-embeds modified files to keep search accurate.'
                    : task.prompt}
                </p>

                <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5 text-[10px] text-[var(--text-tertiary)]">
                  <span className="font-mono">{formatCron(task.cron)}</span>
                  {task.lastRunAt && <span>Last run: {formatTime(task.lastRunAt)}</span>}
                  {task.nextRunAt && task.enabled && (
                    <span>Next: {formatTime(task.nextRunAt)}</span>
                  )}
                </div>

                {lastRun && (
                  <div className={cn(
                    'flex items-start gap-1.5 mt-1.5 text-[10px] rounded px-2 py-1',
                    lastRun.success
                      ? 'bg-green-500/5 text-green-700 dark:text-green-400'
                      : 'bg-red-500/5 text-red-600 dark:text-red-400'
                  )}>
                    {lastRun.success
                      ? <CheckCircle className="w-3 h-3 shrink-0 mt-px" />
                      : <AlertCircle className="w-3 h-3 shrink-0 mt-px" />
                    }
                    <span className="break-words">
                      {lastRun.summary || (lastRun.success ? 'Completed' : lastRun.error || 'Failed')}
                    </span>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-0.5 shrink-0">
                <button
                  onClick={() => trigger(task.name)}
                  disabled={ts === 'running'}
                  title="Run now"
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:bg-[var(--accent-light)] transition-colors"
                >
                  {ts === 'running'
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : ts === 'done'
                      ? <CheckCircle className="w-3.5 h-3.5 text-green-500" />
                      : <Play className="w-3.5 h-3.5" />
                  }
                </button>

                <button
                  onClick={() => toggle(task)}
                  title={task.enabled ? 'Pause' : 'Resume'}
                  className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-secondary)] transition-colors"
                >
                  <Pause className="w-3.5 h-3.5" />
                </button>

                {!isFreshnessTask(task.name) && (
                  <button
                    onClick={() => remove(task.name)}
                    title="Delete"
                    className="p-1.5 rounded-lg text-[var(--text-secondary)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}

      <FreshnessLogViewer />
    </div>
  )
}

interface LogEntry {
  file: string
  date: string
  sizeBytes: number
}

function FreshnessLogViewer() {
  const [logs, setLogs] = useState<LogEntry[]>([])
  const [open, setOpen] = useState(false)
  const [selected, setSelected] = useState<LogEntry | null>(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const contentRef = useRef<HTMLPreElement>(null)

  const loadLogs = async () => {
    const list = await window.electronAPI?.schedulerLogsList?.() ?? []
    setLogs(list as LogEntry[])
  }

  useEffect(() => { loadLogs() }, [])

  const openLog = async (entry: LogEntry) => {
    setSelected(entry)
    setLoading(true)
    const text = await window.electronAPI?.schedulerLogsRead?.(entry.file) ?? ''
    setContent(text)
    setLoading(false)
    setTimeout(() => contentRef.current?.scrollTo(0, 0), 50)
  }

  if (logs.length === 0) return null

  return (
    <div className="border-t border-[var(--border-primary)] pt-3 space-y-2">
      <button
        onClick={() => { setOpen(v => !v); if (!open) loadLogs() }}
        className="flex items-center gap-2 text-[12px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors w-full"
      >
        <ScrollText className="w-3.5 h-3.5" />
        Run Logs
        <span className="ml-auto text-[10px] text-[var(--text-tertiary)]">{logs.length} file(s)</span>
        <ChevronDown className={cn('w-3.5 h-3.5 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="space-y-1">
          {logs.slice(0, 10).map(entry => (
            <button
              key={entry.file}
              onClick={() => openLog(entry)}
              className={cn(
                'w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left transition-colors text-[11px]',
                selected?.file === entry.file
                  ? 'bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--bg-secondary)] hover:text-[var(--text-primary)]'
              )}
            >
              <span className="font-mono">{entry.date}</span>
              <span className="text-[var(--text-tertiary)]">{(entry.sizeBytes / 1024).toFixed(1)} KB</span>
            </button>
          ))}
        </div>
      )}

      {selected && (
        <div className="rounded-lg border border-[var(--border-primary)] overflow-hidden">
          <div className="flex items-center justify-between px-3 py-1.5 bg-[var(--bg-secondary)] border-b border-[var(--border-primary)]">
            <span className="text-[11px] font-mono text-[var(--text-secondary)]">{selected.date}</span>
            <button
              onClick={() => setSelected(null)}
              className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          {loading
            ? <div className="flex items-center justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-[var(--text-tertiary)]" /></div>
            : <pre
                ref={contentRef}
                className="text-[11px] font-mono text-[var(--text-secondary)] p-3 overflow-auto max-h-72 whitespace-pre-wrap leading-relaxed"
              >
                {content}
              </pre>
          }
        </div>
      )}
    </div>
  )
}
