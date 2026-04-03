import { EventEmitter } from 'events'
import type { ScheduledTask, TaskRunRecord } from './types'

function parseCronToMs(cron: string): number | null {
  const parts = cron.trim().split(/\s+/)
  if (parts.length !== 5) return null

  const [minute, hour] = parts
  const minuteNum = minute === '*' ? 0 : parseInt(minute, 10)
  const hourNum = hour === '*' ? 0 : parseInt(hour, 10)

  if (isNaN(minuteNum) || isNaN(hourNum)) return null

  const now = new Date()
  const next = new Date()
  next.setSeconds(0, 0)
  next.setMinutes(minuteNum)
  if (hour !== '*') next.setHours(hourNum)

  if (next <= now) next.setDate(next.getDate() + 1)

  return next.getTime() - now.getTime()
}

export class TaskScheduler extends EventEmitter {
  private tasks = new Map<string, ScheduledTask>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()
  private runHistory: TaskRunRecord[] = []

  registerTask(task: ScheduledTask): void {
    this.tasks.set(task.name, task)
    if (task.enabled) this.scheduleNext(task)
  }

  unregisterTask(name: string): void {
    const timer = this.timers.get(name)
    if (timer) clearTimeout(timer)
    this.timers.delete(name)
    this.tasks.delete(name)
  }

  enableTask(name: string): boolean {
    const task = this.tasks.get(name)
    if (!task) return false
    task.enabled = true
    this.scheduleNext(task)
    return true
  }

  disableTask(name: string): boolean {
    const task = this.tasks.get(name)
    if (!task) return false
    task.enabled = false
    const timer = this.timers.get(name)
    if (timer) clearTimeout(timer)
    this.timers.delete(name)
    return true
  }

  triggerNow(name: string): boolean {
    const task = this.tasks.get(name)
    if (!task) return false
    this.executeTask(task)
    return true
  }

  private scheduleNext(task: ScheduledTask): void {
    const existing = this.timers.get(task.name)
    if (existing) clearTimeout(existing)

    const delayMs = parseCronToMs(task.cron)
    if (delayMs === null) {
      console.warn(`[Scheduler] Invalid cron: ${task.cron} for task ${task.name}`)
      return
    }

    const nextRun = Date.now() + delayMs
    task.nextRunAt = nextRun

    const timer = setTimeout(() => {
      this.executeTask(task)
      if (task.enabled) this.scheduleNext(task)
    }, delayMs)

    this.timers.set(task.name, timer)
  }

  private async executeTask(task: ScheduledTask): Promise<void> {
    const record: TaskRunRecord = {
      taskName: task.name,
      startedAt: Date.now(),
      finishedAt: 0,
      success: false
    }

    this.emit('task:start', task)

    try {
      this.emit('task:execute', { task, record })
      task.lastRunAt = Date.now()
      record.success = true
    } catch (err) {
      record.error = String(err)
      console.error(`[Scheduler] Task ${task.name} failed:`, err)
    } finally {
      record.finishedAt = Date.now()
      this.runHistory.push(record)
      if (this.runHistory.length > 100) this.runHistory.shift()
      this.emit('task:complete', { task, record })
    }
  }

  getTasks(): ScheduledTask[] { return Array.from(this.tasks.values()) }
  getHistory(taskName?: string): TaskRunRecord[] {
    return taskName ? this.runHistory.filter(r => r.taskName === taskName) : [...this.runHistory]
  }

  dispose(): void {
    for (const timer of this.timers.values()) clearTimeout(timer)
    this.timers.clear()
    this.removeAllListeners()
  }
}

export const taskScheduler = new TaskScheduler()
