export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled' | 'stale'

export interface BackgroundTask {
  id: string
  description: string
  status: BackgroundTaskStatus
  category?: string
  agentType?: string
  createdAt: number
  startedAt: number | null
  completedAt: number | null
  result?: unknown
  error?: string
  progress?: number
  metadata?: Record<string, unknown>
}

export interface ConcurrencyConfig {
  maxGlobal: number
  maxPerProvider: Record<string, number>
  maxPerCategory: Record<string, number>
  queueTimeout: number
  taskTimeout: number
}

export interface TaskQueueEntry {
  task: BackgroundTask
  execute: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: unknown) => void
  priority: number
  enqueuedAt: number
}

export type BackgroundTaskEvent =
  | { type: 'task:created'; task: BackgroundTask }
  | { type: 'task:started'; task: BackgroundTask }
  | { type: 'task:completed'; task: BackgroundTask }
  | { type: 'task:failed'; task: BackgroundTask }
  | { type: 'task:cancelled'; task: BackgroundTask }
  | { type: 'task:progress'; task: BackgroundTask; progress: number }
  | { type: 'task:stale'; task: BackgroundTask }

export type TaskEventListener = (event: BackgroundTaskEvent) => void
