import type { IpcMain, BrowserWindow } from 'electron'
import { TaskScheduler } from '../services/scheduler/task-scheduler'
import type { ScheduledTask, TaskRunRecord } from '../services/scheduler/types'
import { runEmbeddingFreshnessCheck } from '../services/scheduler/embedding-freshness-job'
import { writeFreshnessLog, listFreshnessLogs, readFreshnessLog } from '../services/scheduler/freshness-logger'
import { getDb, projectQueries } from '../services/db'

const scheduler = new TaskScheduler()

const FRESHNESS_TASK_NAME = 'embedding-freshness-check'

function buildFreshnessTask(projectId: string, cronOverride?: string): ScheduledTask {
  return {
    name: `${FRESHNESS_TASK_NAME}:${projectId}`,
    cron: cronOverride ?? '0 3 * * *',
    agent: 'system',
    prompt: 'Check all repositories in this project for stale embeddings and sync changed files.',
    enabled: true,
    projectId,
    maxBudget: 10,
    createdAt: Date.now()
  }
}

scheduler.on('task:execute', async ({ task, record }: { task: ScheduledTask; record: TaskRunRecord }) => {
  if (!task.name.startsWith(FRESHNESS_TASK_NAME)) return
  if (!task.projectId) {
    record.error = 'No projectId on task'
    return
  }

  const logLines: string[] = []
  const collectLog = (msg: string) => {
    logLines.push(`[${new Date().toISOString().slice(11, 19)}] ${msg}`)
    record.summary = msg
  }

  let success = false
  try {
    const report = await runEmbeddingFreshnessCheck(task.projectId, collectLog)

    success = true
    record.summary = report.reposUpdated > 0
      ? `Updated ${report.reposUpdated}/${report.reposChecked} repos — +${report.filesAdded} added, ~${report.filesModified} modified, -${report.filesDeleted} deleted | Re-embedded ${report.embeddingResult?.embedded ?? 0} chunks (${(report.durationMs / 1000).toFixed(1)}s)`
      : `All ${report.reposChecked} repos fresh | ${report.embeddingResult?.embedded ?? 0} chunks re-embedded (${(report.durationMs / 1000).toFixed(1)}s)`

    if (report.errors.length > 0) {
      record.error = report.errors.map(e => `${e.repoId}: ${e.error}`).join('; ')
    }

    writeFreshnessLog(report, logLines, success)
  } catch (err) {
    record.error = err instanceof Error ? err.message : String(err)
    logLines.push(`[ERROR] ${record.error}`)
    writeFreshnessLog(
      { projectId: task.projectId, reposChecked: 0, reposAlreadyFresh: 0, reposUpdated: 0,
        filesAdded: 0, filesModified: 0, filesDeleted: 0, chunksAdded: 0, chunksRemoved: 0,
        staleness: { projectId: task.projectId, totalChunks: 0, staleChunks: 0, missingEmbedding: 0, contentChanged: 0, oldestEmbeddingAt: null, newestEmbeddingAt: null },
        embeddingResult: { embedded: 0, skipped: 0 }, errors: [{ repoId: 'unknown', error: record.error! }], durationMs: 0 },
      logLines, false
    )
    throw err
  }
})

export function initScheduledJobs(): void {
  const db = getDb()
  const projects = projectQueries.getAll(db).all() as Array<{ id: string; name: string }>

  for (const project of projects) {
    const taskName = `${FRESHNESS_TASK_NAME}:${project.id}`
    const existing = scheduler.getTasks().find(t => t.name === taskName)
    if (!existing) {
      scheduler.registerTask(buildFreshnessTask(project.id))
      console.log(`[Scheduler] Registered freshness job for project: ${project.name}`)
    }
  }
}

export function registerSchedulerIPC(ipcMain: IpcMain, getMainWindow?: () => BrowserWindow | null): void {
  ipcMain.handle('scheduler:list', () => scheduler.getTasks())
  ipcMain.handle('scheduler:history', (_event, taskName?: string) => scheduler.getHistory(taskName))

  ipcMain.handle('scheduler:trigger', (_event, name: string) => {
    const win = getMainWindow?.()
    win?.webContents.send('scheduler:running', { name })
    return scheduler.triggerNow(name)
  })

  ipcMain.handle('scheduler:enable', (_event, name: string) => scheduler.enableTask(name))
  ipcMain.handle('scheduler:disable', (_event, name: string) => scheduler.disableTask(name))

  ipcMain.handle('scheduler:unregister', (_event, name: string) => {
    scheduler.unregisterTask(name)
    return true
  })

  ipcMain.handle('scheduler:register', (_event, task: ScheduledTask) => {
    scheduler.registerTask(task)
    return true
  })

  ipcMain.handle('scheduler:register-freshness', (_event, projectId: string, cron?: string) => {
    const task = buildFreshnessTask(projectId, cron)
    scheduler.registerTask(task)
    return task
  })

  ipcMain.handle('scheduler:logs:list', () => listFreshnessLogs())
  ipcMain.handle('scheduler:logs:read', (_event, filePath: string) => readFreshnessLog(filePath))
}

export { scheduler }
