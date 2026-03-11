import type {
  BackgroundTask,
  BackgroundTaskStatus,
  BackgroundTaskEvent,
  TaskEventListener,
  TaskQueueEntry
} from './types'
import {
  acquireSlot,
  releaseSlot,
  canRunTask,
  getConcurrencyConfig
} from './concurrency-manager'

const tasks = new Map<string, BackgroundTask>()
const queue: TaskQueueEntry[] = []
const listeners = new Set<TaskEventListener>()
const runningAbortFlags = new Map<string, { cancelled: boolean }>()

function generateId(): string {
  return `bg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function emit(event: BackgroundTaskEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
    }
  }
}

function processQueue(): void {
  const sorted = queue.slice().sort((a, b) => a.priority - b.priority)
  for (const entry of sorted) {
    if (entry.task.status !== 'pending') continue
    const provider = entry.task.metadata?.['provider'] as string | undefined
    if (!canRunTask(provider, entry.task.category)) continue

    const idx = queue.indexOf(entry)
    if (idx !== -1) queue.splice(idx, 1)
    runTask(entry)
    break
  }
}

function runTask(entry: TaskQueueEntry): void {
  const { task } = entry
  const provider = task.metadata?.['provider'] as string | undefined
  acquireSlot(task.id, provider, task.category)

  task.status = 'running'
  task.startedAt = Date.now()
  emit({ type: 'task:started', task: { ...task } })

  const abortFlag = { cancelled: false }
  runningAbortFlags.set(task.id, abortFlag)

  entry.execute().then(
    (result) => {
      runningAbortFlags.delete(task.id)
      if (abortFlag.cancelled) return
      task.status = 'completed'
      task.completedAt = Date.now()
      task.result = result
      releaseSlot(task.id)
      emit({ type: 'task:completed', task: { ...task } })
      entry.resolve(result)
      processQueue()
    },
    (err: unknown) => {
      runningAbortFlags.delete(task.id)
      if (abortFlag.cancelled) return
      task.status = 'failed'
      task.completedAt = Date.now()
      task.error = err instanceof Error ? err.message : String(err)
      releaseSlot(task.id)
      emit({ type: 'task:failed', task: { ...task } })
      entry.reject(err)
      processQueue()
    }
  )
}

export function launchTask(options: {
  description: string
  execute: () => Promise<unknown>
  category?: string
  agentType?: string
  provider?: string
  priority?: number
  metadata?: Record<string, unknown>
}): string {
  const id = generateId()
  const task: BackgroundTask = {
    id,
    description: options.description,
    status: 'pending',
    category: options.category,
    agentType: options.agentType,
    createdAt: Date.now(),
    startedAt: null,
    completedAt: null,
    metadata: { ...options.metadata, provider: options.provider }
  }
  tasks.set(id, task)

  const entry: TaskQueueEntry = {
    task,
    execute: options.execute,
    resolve: () => {},
    reject: () => {},
    priority: options.priority ?? 5,
    enqueuedAt: Date.now()
  }

  new Promise<unknown>((resolve, reject) => {
    entry.resolve = resolve
    entry.reject = reject
  }).catch(() => {})

  emit({ type: 'task:created', task: { ...task } })

  if (canRunTask(options.provider, options.category)) {
    runTask(entry)
  } else {
    queue.push(entry)
  }

  return id
}

export function cancelTask(taskId: string): boolean {
  const task = tasks.get(taskId)
  if (!task) return false
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return false

  const wasRunning = task.status === 'running'
  task.status = 'cancelled'
  task.completedAt = Date.now()

  const abortFlag = runningAbortFlags.get(taskId)
  if (abortFlag) {
    abortFlag.cancelled = true
    runningAbortFlags.delete(taskId)
  }

  if (wasRunning) {
    releaseSlot(taskId)
  }

  const queueIdx = queue.findIndex(e => e.task.id === taskId)
  if (queueIdx !== -1) queue.splice(queueIdx, 1)

  emit({ type: 'task:cancelled', task: { ...task } })
  processQueue()
  return true
}

export function getTask(taskId: string): BackgroundTask | undefined {
  const task = tasks.get(taskId)
  return task ? { ...task } : undefined
}

export function getAllTasks(): BackgroundTask[] {
  return Array.from(tasks.values()).map(t => ({ ...t }))
}

export function getTasksByStatus(status: BackgroundTaskStatus): BackgroundTask[] {
  return Array.from(tasks.values())
    .filter(t => t.status === status)
    .map(t => ({ ...t }))
}

export function pollTask(taskId: string): BackgroundTask | undefined {
  return getTask(taskId)
}

export function onTaskEvent(listener: TaskEventListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function updateProgress(taskId: string, progress: number): void {
  const task = tasks.get(taskId)
  if (!task || task.status !== 'running') return
  task.progress = Math.max(0, Math.min(100, progress))
  emit({ type: 'task:progress', task: { ...task }, progress: task.progress })
}

export function cleanupCompleted(olderThanMs: number = 300_000): number {
  const cutoff = Date.now() - olderThanMs
  let removed = 0
  for (const [id, task] of tasks) {
    if (
      (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') &&
      task.completedAt !== null &&
      task.completedAt < cutoff
    ) {
      tasks.delete(id)
      removed++
    }
  }
  return removed
}

export function detectStaleTasks(): BackgroundTask[] {
  const config = getConcurrencyConfig()
  const now = Date.now()
  const staleTasks: BackgroundTask[] = []

  for (const task of tasks.values()) {
    if (task.status === 'running' && task.startedAt !== null) {
      if (now - task.startedAt >= config.taskTimeout) {
        task.status = 'stale'
        task.completedAt = now
        releaseSlot(task.id)
        const abortFlag = runningAbortFlags.get(task.id)
        if (abortFlag) {
          abortFlag.cancelled = true
          runningAbortFlags.delete(task.id)
        }
        emit({ type: 'task:stale', task: { ...task } })
        staleTasks.push({ ...task })
      }
    } else if (task.status === 'pending') {
      const queueEntry = queue.find(e => e.task.id === task.id)
      if (queueEntry && now - queueEntry.enqueuedAt >= config.queueTimeout) {
        task.status = 'stale'
        task.completedAt = now
        const idx = queue.indexOf(queueEntry)
        if (idx !== -1) queue.splice(idx, 1)
        emit({ type: 'task:stale', task: { ...task } })
        staleTasks.push({ ...task })
      }
    }
  }

  if (staleTasks.length > 0) processQueue()
  return staleTasks
}

export function resetBackgroundManager(): void {
  tasks.clear()
  queue.length = 0
  listeners.clear()
  runningAbortFlags.clear()
}
