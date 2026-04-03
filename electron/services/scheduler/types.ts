export interface ScheduledTask {
  name: string
  cron: string
  agent: string
  prompt: string
  enabled: boolean
  projectId?: string
  maxBudget?: number
  lastRunAt?: number
  nextRunAt?: number
  createdAt: number
}

export interface TaskRunRecord {
  taskName: string
  startedAt: number
  finishedAt: number
  success: boolean
  cost?: number
  summary?: string
  error?: string
}

export interface SchedulerConfig {
  tasks: ScheduledTask[]
}
