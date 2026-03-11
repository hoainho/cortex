export type {
  BackgroundTaskStatus,
  BackgroundTask,
  ConcurrencyConfig,
  TaskQueueEntry,
  BackgroundTaskEvent,
  TaskEventListener
} from './types'

export {
  configureConcurrency,
  getConcurrencyConfig,
  canRunTask,
  acquireSlot,
  releaseSlot,
  getActiveCount,
  getActiveCountByProvider,
  getActiveCountByCategory,
  resetConcurrency
} from './concurrency-manager'

export {
  launchTask,
  cancelTask,
  getTask,
  getAllTasks,
  getTasksByStatus,
  pollTask,
  onTaskEvent,
  updateProgress,
  cleanupCompleted,
  detectStaleTasks,
  resetBackgroundManager
} from './background-manager'
