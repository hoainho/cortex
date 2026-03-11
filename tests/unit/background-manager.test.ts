import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  configureConcurrency,
  getConcurrencyConfig,
  canRunTask,
  acquireSlot,
  releaseSlot,
  getActiveCount,
  getActiveCountByProvider,
  getActiveCountByCategory,
  resetConcurrency,
  launchTask,
  cancelTask,
  getTask,
  getAllTasks,
  getTasksByStatus,
  pollTask,
  onTaskEvent,
  cleanupCompleted,
  detectStaleTasks,
  resetBackgroundManager
} from '../../electron/services/background'
import type { BackgroundTaskEvent } from '../../electron/services/background'

beforeEach(() => {
  resetConcurrency()
  resetBackgroundManager()
})

describe('concurrency-manager', () => {
  it('has sensible defaults', () => {
    const config = getConcurrencyConfig()
    expect(config.maxGlobal).toBe(10)
    expect(config.queueTimeout).toBe(300_000)
    expect(config.taskTimeout).toBe(600_000)
    expect(config.maxPerProvider).toEqual({})
    expect(config.maxPerCategory).toEqual({})
  })

  it('accepts partial config overrides', () => {
    configureConcurrency({ maxGlobal: 5 })
    expect(getConcurrencyConfig().maxGlobal).toBe(5)
    expect(getConcurrencyConfig().queueTimeout).toBe(300_000)
  })

  it('overrides per-provider limits', () => {
    configureConcurrency({ maxPerProvider: { openai: 3 } })
    expect(getConcurrencyConfig().maxPerProvider).toEqual({ openai: 3 })
  })

  it('allows tasks when under global limit', () => {
    expect(canRunTask()).toBe(true)
  })

  it('blocks tasks at global limit', () => {
    configureConcurrency({ maxGlobal: 1 })
    acquireSlot('t1')
    expect(canRunTask()).toBe(false)
  })

  it('blocks tasks at provider limit', () => {
    configureConcurrency({ maxPerProvider: { openai: 1 } })
    acquireSlot('t1', 'openai')
    expect(canRunTask('openai')).toBe(false)
  })

  it('allows different provider when one is full', () => {
    configureConcurrency({ maxPerProvider: { openai: 1 } })
    acquireSlot('t1', 'openai')
    expect(canRunTask('anthropic')).toBe(true)
  })

  it('blocks tasks at category limit', () => {
    configureConcurrency({ maxPerCategory: { deep: 1 } })
    acquireSlot('t1', undefined, 'deep')
    expect(canRunTask(undefined, 'deep')).toBe(false)
  })

  it('acquireSlot returns false when full', () => {
    configureConcurrency({ maxGlobal: 1 })
    expect(acquireSlot('t1')).toBe(true)
    expect(acquireSlot('t2')).toBe(false)
  })

  it('releaseSlot frees the slot', () => {
    configureConcurrency({ maxGlobal: 1 })
    acquireSlot('t1')
    releaseSlot('t1')
    expect(canRunTask()).toBe(true)
  })

  it('tracks active count', () => {
    acquireSlot('t1')
    acquireSlot('t2')
    expect(getActiveCount()).toBe(2)
    releaseSlot('t1')
    expect(getActiveCount()).toBe(1)
  })

  it('tracks active count by provider', () => {
    acquireSlot('t1', 'openai')
    acquireSlot('t2', 'anthropic')
    acquireSlot('t3', 'openai')
    expect(getActiveCountByProvider('openai')).toBe(2)
    expect(getActiveCountByProvider('anthropic')).toBe(1)
  })

  it('tracks active count by category', () => {
    acquireSlot('t1', undefined, 'deep')
    acquireSlot('t2', undefined, 'quick')
    expect(getActiveCountByCategory('deep')).toBe(1)
    expect(getActiveCountByCategory('quick')).toBe(1)
  })

  it('resetConcurrency clears all slots and config', () => {
    configureConcurrency({ maxGlobal: 1 })
    acquireSlot('t1')
    resetConcurrency()
    expect(getActiveCount()).toBe(0)
    expect(getConcurrencyConfig().maxGlobal).toBe(10)
  })
})

describe('background-manager', () => {
  describe('launchTask', () => {
    it('returns an id starting with bg_', () => {
      const id = launchTask({ description: 'test', execute: () => Promise.resolve() })
      expect(id).toMatch(/^bg_/)
    })

    it('sets status to running when slots available', async () => {
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      await vi.waitFor(() => {
        expect(getTask(id)?.status).toBe('running')
      })
    })

    it('sets status to pending when no slots', () => {
      configureConcurrency({ maxGlobal: 0 })
      const id = launchTask({ description: 'test', execute: () => Promise.resolve() })
      expect(getTask(id)?.status).toBe('pending')
    })

    it('stores description and category', () => {
      const id = launchTask({
        description: 'my task',
        execute: () => new Promise(() => {}),
        category: 'deep',
        agentType: 'explore'
      })
      const task = getTask(id)
      expect(task?.description).toBe('my task')
      expect(task?.category).toBe('deep')
      expect(task?.agentType).toBe('explore')
    })
  })

  describe('getTask', () => {
    it('returns undefined for unknown id', () => {
      expect(getTask('nonexistent')).toBeUndefined()
    })

    it('returns a copy, not the original', () => {
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      const a = getTask(id)
      const b = getTask(id)
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('getAllTasks', () => {
    it('returns all tasks', () => {
      launchTask({ description: 'a', execute: () => new Promise(() => {}) })
      launchTask({ description: 'b', execute: () => new Promise(() => {}) })
      expect(getAllTasks()).toHaveLength(2)
    })
  })

  describe('getTasksByStatus', () => {
    it('filters by status', () => {
      configureConcurrency({ maxGlobal: 1 })
      launchTask({ description: 'runs', execute: () => new Promise(() => {}) })
      launchTask({ description: 'queued', execute: () => new Promise(() => {}) })
      expect(getTasksByStatus('running')).toHaveLength(1)
      expect(getTasksByStatus('pending')).toHaveLength(1)
    })
  })

  describe('task completion', () => {
    it('marks completed with result on success', async () => {
      const id = launchTask({ description: 'ok', execute: () => Promise.resolve('done!') })
      await vi.waitFor(() => {
        const t = getTask(id)
        expect(t?.status).toBe('completed')
        expect(t?.result).toBe('done!')
        expect(t?.completedAt).toBeTypeOf('number')
      })
    })

    it('marks failed with error message on rejection', async () => {
      const id = launchTask({ description: 'fail', execute: () => Promise.reject(new Error('boom')) })
      await vi.waitFor(() => {
        const t = getTask(id)
        expect(t?.status).toBe('failed')
        expect(t?.error).toBe('boom')
      })
    })

    it('handles non-Error rejections', async () => {
      const id = launchTask({ description: 'fail', execute: () => Promise.reject('string error') })
      await vi.waitFor(() => {
        const t = getTask(id)
        expect(t?.status).toBe('failed')
        expect(t?.error).toBe('string error')
      })
    })
  })

  describe('cancelTask', () => {
    it('cancels a pending task', () => {
      configureConcurrency({ maxGlobal: 0 })
      const id = launchTask({ description: 'test', execute: () => Promise.resolve() })
      expect(cancelTask(id)).toBe(true)
      expect(getTask(id)?.status).toBe('cancelled')
    })

    it('cancels a running task', () => {
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      expect(cancelTask(id)).toBe(true)
      expect(getTask(id)?.status).toBe('cancelled')
    })

    it('returns false for unknown task', () => {
      expect(cancelTask('nonexistent')).toBe(false)
    })

    it('returns false for already completed task', async () => {
      const id = launchTask({ description: 'ok', execute: () => Promise.resolve() })
      await vi.waitFor(() => {
        expect(getTask(id)?.status).toBe('completed')
      })
      expect(cancelTask(id)).toBe(false)
    })

    it('releases slot when cancelling running task', () => {
      configureConcurrency({ maxGlobal: 1 })
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      cancelTask(id)
      expect(getActiveCount()).toBe(0)
    })
  })

  describe('events', () => {
    it('emits task:created on launch', () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      expect(events.some(e => e.type === 'task:created')).toBe(true)
    })

    it('emits task:started when task begins running', () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      expect(events.some(e => e.type === 'task:started')).toBe(true)
    })

    it('emits task:completed on success', async () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      launchTask({ description: 'test', execute: () => Promise.resolve(42) })
      await vi.waitFor(() => {
        expect(events.some(e => e.type === 'task:completed')).toBe(true)
      })
    })

    it('emits task:failed on error', async () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      launchTask({ description: 'test', execute: () => Promise.reject(new Error('err')) })
      await vi.waitFor(() => {
        expect(events.some(e => e.type === 'task:failed')).toBe(true)
      })
    })

    it('emits task:cancelled on cancel', () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      cancelTask(id)
      expect(events.some(e => e.type === 'task:cancelled')).toBe(true)
    })

    it('unsubscribe stops events', () => {
      const events: BackgroundTaskEvent[] = []
      const unsub = onTaskEvent(e => events.push(e))
      unsub()
      launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      expect(events).toHaveLength(0)
    })

    it('swallows listener errors', () => {
      onTaskEvent(() => { throw new Error('listener crash') })
      expect(() => {
        launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      }).not.toThrow()
    })
  })

  describe('queue processing', () => {
    it('runs queued task when slot becomes available', async () => {
      configureConcurrency({ maxGlobal: 1 })
      const id1 = launchTask({ description: 'first', execute: () => Promise.resolve('a') })
      const id2 = launchTask({ description: 'second', execute: () => Promise.resolve('b') })

      expect(getTask(id2)?.status).toBe('pending')

      await vi.waitFor(() => {
        expect(getTask(id1)?.status).toBe('completed')
      })

      await vi.waitFor(() => {
        expect(getTask(id2)?.status).toBe('completed')
      })
    })

    it('respects priority ordering in queue', async () => {
      configureConcurrency({ maxGlobal: 1 })
      const completed: string[] = []
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => {
        if (e.type === 'task:completed') events.push(e)
      })

      launchTask({ description: 'blocker', execute: () => Promise.resolve() })
      launchTask({ description: 'low-pri', execute: () => Promise.resolve(), priority: 10 })
      launchTask({ description: 'high-pri', execute: () => Promise.resolve(), priority: 1 })

      await vi.waitFor(() => {
        expect(events).toHaveLength(3)
      })

      const completionOrder = events.map(e => e.task.description)
      expect(completionOrder[0]).toBe('blocker')
      expect(completionOrder[1]).toBe('high-pri')
      expect(completionOrder[2]).toBe('low-pri')
    })
  })

  describe('cleanupCompleted', () => {
    it('removes old completed tasks', async () => {
      const id = launchTask({ description: 'old', execute: () => Promise.resolve() })
      await vi.waitFor(() => {
        expect(getTask(id)?.status).toBe('completed')
      })
      const removed = cleanupCompleted(0)
      expect(removed).toBe(1)
      expect(getTask(id)).toBeUndefined()
    })

    it('does not remove recent tasks', async () => {
      const id = launchTask({ description: 'recent', execute: () => Promise.resolve() })
      await vi.waitFor(() => {
        expect(getTask(id)?.status).toBe('completed')
      })
      const removed = cleanupCompleted(60_000)
      expect(removed).toBe(0)
      expect(getTask(id)).toBeDefined()
    })

    it('returns count of removed tasks', async () => {
      const id1 = launchTask({ description: 'a', execute: () => Promise.resolve() })
      const id2 = launchTask({ description: 'b', execute: () => Promise.resolve() })
      await vi.waitFor(() => {
        expect(getTask(id1)?.status).toBe('completed')
        expect(getTask(id2)?.status).toBe('completed')
      })
      expect(cleanupCompleted(0)).toBe(2)
    })

    it('keeps running tasks untouched', () => {
      launchTask({ description: 'running', execute: () => new Promise(() => {}) })
      expect(cleanupCompleted(0)).toBe(0)
      expect(getAllTasks()).toHaveLength(1)
    })
  })

  describe('detectStaleTasks', () => {
    it('marks running tasks as stale after timeout', () => {
      configureConcurrency({ taskTimeout: 0 })
      launchTask({ description: 'slow', execute: () => new Promise(() => {}) })
      const stale = detectStaleTasks()
      expect(stale).toHaveLength(1)
      expect(stale[0].status).toBe('stale')
    })

    it('marks queued tasks as stale after queue timeout', () => {
      configureConcurrency({ maxGlobal: 0, queueTimeout: 0 })
      launchTask({ description: 'queued', execute: () => Promise.resolve() })
      const stale = detectStaleTasks()
      expect(stale).toHaveLength(1)
      expect(stale[0].status).toBe('stale')
    })

    it('does not mark fresh running tasks as stale', () => {
      configureConcurrency({ taskTimeout: 999_999 })
      launchTask({ description: 'fresh', execute: () => new Promise(() => {}) })
      expect(detectStaleTasks()).toHaveLength(0)
    })
  })

  describe('pollTask', () => {
    it('returns same as getTask', () => {
      const id = launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      expect(pollTask(id)).toEqual(getTask(id))
    })

    it('returns undefined for unknown id', () => {
      expect(pollTask('nope')).toBeUndefined()
    })
  })

  describe('concurrency enforcement via launchTask', () => {
    it('respects provider limits', () => {
      configureConcurrency({ maxPerProvider: { openai: 1 } })
      launchTask({ description: 'a', execute: () => new Promise(() => {}), provider: 'openai' })
      const id2 = launchTask({ description: 'b', execute: () => new Promise(() => {}), provider: 'openai' })
      expect(getTask(id2)?.status).toBe('pending')
    })

    it('respects category limits', () => {
      configureConcurrency({ maxPerCategory: { deep: 1 } })
      launchTask({ description: 'a', execute: () => new Promise(() => {}), category: 'deep' })
      const id2 = launchTask({ description: 'b', execute: () => new Promise(() => {}), category: 'deep' })
      expect(getTask(id2)?.status).toBe('pending')
    })
  })

  describe('resetBackgroundManager', () => {
    it('clears all tasks and listeners', () => {
      const events: BackgroundTaskEvent[] = []
      onTaskEvent(e => events.push(e))
      launchTask({ description: 'test', execute: () => new Promise(() => {}) })
      resetBackgroundManager()
      expect(getAllTasks()).toHaveLength(0)
      launchTask({ description: 'after-reset', execute: () => new Promise(() => {}) })
      expect(events.filter(e => e.task.description === 'after-reset')).toHaveLength(0)
    })
  })
})
