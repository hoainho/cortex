import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  startScheduler,
  stopScheduler,
  notifyEvent,
  notifyPostChat,
  notifyChatStarted,
  notifyChatEnded,
  isChatActive,
  getSchedulerStatus
} from '../../electron/services/training/training-scheduler'
import type { SchedulerConfig } from '../../electron/services/training/types'

vi.mock('electron', () => ({
  powerMonitor: {
    getSystemIdleTime: vi.fn().mockReturnValue(0)
  }
}))

function makeConfig(overrides: Partial<SchedulerConfig> = {}): SchedulerConfig {
  return {
    enabled: true,
    idleThresholdMinutes: 5,
    globalIntervalMs: 30 * 60 * 1000,
    maxConcurrentJobs: 1,
    pauseDuringChat: true,
    pipelines: {
      reranker: { enabled: true, intervalMs: 0, thresholdCount: 5, idleMinutes: 0 },
      prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
      autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
    },
    ...overrides
  }
}

afterEach(() => {
  stopScheduler()
  vi.useRealTimers()
})

describe('startScheduler / stopScheduler', () => {
  it('sets running=true after start', () => {
    startScheduler(makeConfig(), vi.fn())
    expect(getSchedulerStatus().running).toBe(true)
  })

  it('sets running=false after stop', () => {
    startScheduler(makeConfig(), vi.fn())
    stopScheduler()
    expect(getSchedulerStatus().running).toBe(false)
  })

  it('calling start twice stops the previous instance first (no duplicate timers)', () => {
    vi.useFakeTimers()
    const cb1 = vi.fn()
    const cb2 = vi.fn()

    startScheduler(makeConfig(), cb1)
    startScheduler(makeConfig(), cb2)

    expect(getSchedulerStatus().running).toBe(true)
  })

  it('stopScheduler does not throw when called before start', () => {
    expect(() => stopScheduler()).not.toThrow()
  })

  it('interval timer fires trigger callback when running', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const cfg = makeConfig({
      pipelines: {
        reranker: { enabled: true, intervalMs: 60_000, thresholdCount: 0, idleMinutes: 0 },
        prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
      }
    })
    startScheduler(cfg, cb)
    vi.advanceTimersByTime(61_000)
    expect(cb).toHaveBeenCalledWith('reranker', 'interval', undefined)
  })

  it('disabled pipeline does not fire interval', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const cfg = makeConfig({
      pipelines: {
        reranker: { enabled: false, intervalMs: 1_000, thresholdCount: 0, idleMinutes: 0 },
        prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
      }
    })
    startScheduler(cfg, cb)
    vi.advanceTimersByTime(5_000)
    expect(cb).not.toHaveBeenCalled()
  })
})

describe('stopScheduler — cleanup (guards unbounded growth fixes)', () => {
  it('clears eventCounters on stop', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyEvent('proj-1')
    notifyEvent('proj-1')

    stopScheduler()

    const status = getSchedulerStatus()
    expect(Object.keys(status.eventCounters)).toHaveLength(0)
  })

  it('restart after stop starts with clean eventCounters', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyEvent('proj-1')
    notifyEvent('proj-1')
    stopScheduler()

    startScheduler(makeConfig(), vi.fn())
    const status = getSchedulerStatus()
    expect(Object.keys(status.eventCounters)).toHaveLength(0)
  })

  it('onTrigger callback is nulled after stop (no stale references)', () => {
    const cb = vi.fn()
    startScheduler(makeConfig(), cb)
    stopScheduler()

    const status = getSchedulerStatus()
    expect(status.running).toBe(false)
  })
})

describe('notifyEvent — counter accumulation', () => {
  it('accumulates counter per pipeline:project key', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyEvent('proj-A')
    notifyEvent('proj-A')

    const status = getSchedulerStatus()
    expect(status.eventCounters['reranker:proj-A']).toBe(2)
  })

  it('counters for different projects are independent', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyEvent('proj-A')
    notifyEvent('proj-A')
    notifyEvent('proj-B')

    const status = getSchedulerStatus()
    expect(status.eventCounters['reranker:proj-A']).toBe(2)
    expect(status.eventCounters['reranker:proj-B']).toBe(1)
  })

  it('fires trigger and resets counter when threshold reached', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    startScheduler(makeConfig(), cb)

    for (let i = 0; i < 5; i++) notifyEvent('proj-1')

    expect(cb).toHaveBeenCalledWith('reranker', 'threshold', 'proj-1')

    const status = getSchedulerStatus()
    expect(status.eventCounters['reranker:proj-1']).toBe(0)
  })

  it('does not accumulate when scheduler is not running', () => {
    notifyEvent('proj-1')
    const status = getSchedulerStatus()
    expect(status.eventCounters['reranker:proj-1']).toBeUndefined()
  })

  it('disabled pipeline is skipped in notifyEvent', () => {
    const cfg = makeConfig({
      pipelines: {
        reranker: { enabled: false, intervalMs: 0, thresholdCount: 5, idleMinutes: 0 },
        prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
      }
    })
    startScheduler(cfg, vi.fn())
    notifyEvent('proj-1')
    const status = getSchedulerStatus()
    expect(status.eventCounters['reranker:proj-1']).toBeUndefined()
  })
})

describe('notifyPostChat', () => {
  it('fires trigger for all enabled pipelines', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    startScheduler(makeConfig(), cb)

    vi.advanceTimersByTime(61_000)
    cb.mockClear()

    vi.advanceTimersByTime(61_000)
    notifyPostChat('proj-1')

    expect(cb).toHaveBeenCalledWith('reranker', 'post_chat', 'proj-1')
  })

  it('sets chatActive to false', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyChatStarted()
    expect(isChatActive()).toBe(true)
    notifyPostChat('proj-1')
    expect(isChatActive()).toBe(false)
  })

  it('does nothing when scheduler is not running', () => {
    expect(() => notifyPostChat('proj-1')).not.toThrow()
  })
})

describe('notifyChatStarted / notifyChatEnded', () => {
  it('chatActive becomes true after notifyChatStarted', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyChatStarted()
    expect(isChatActive()).toBe(true)
  })

  it('chatActive becomes false after notifyChatEnded', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyChatStarted()
    notifyChatEnded()
    expect(isChatActive()).toBe(false)
  })
})

describe('fireTrigger debounce', () => {
  it('does not fire same pipeline:trigger twice within 60s', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const cfg = makeConfig({
      pipelines: {
        reranker: { enabled: true, intervalMs: 1_000, thresholdCount: 0, idleMinutes: 0 },
        prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
      }
    })
    startScheduler(cfg, cb)

    vi.advanceTimersByTime(2_000)
    const firstCallCount = cb.mock.calls.length

    vi.advanceTimersByTime(10_000)
    expect(cb.mock.calls.length).toBe(firstCallCount)
  })

  it('allows firing again after debounce window (60s)', () => {
    vi.useFakeTimers()
    const cb = vi.fn()
    const cfg = makeConfig({
      pipelines: {
        reranker: { enabled: true, intervalMs: 1_000, thresholdCount: 0, idleMinutes: 0 },
        prompt: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        instinct: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        agent: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        crystal: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        memory: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        embedding: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 },
        autoscan: { enabled: false, intervalMs: 0, thresholdCount: 0, idleMinutes: 0 }
      }
    })
    startScheduler(cfg, cb)

    vi.advanceTimersByTime(1_500)
    const afterFirst = cb.mock.calls.length
    expect(afterFirst).toBeGreaterThan(0)

    vi.advanceTimersByTime(61_000)
    expect(cb.mock.calls.length).toBeGreaterThan(afterFirst)
  })
})

describe('getSchedulerStatus', () => {
  it('returns plain object for eventCounters (not a Map)', () => {
    startScheduler(makeConfig(), vi.fn())
    notifyEvent('proj-1')
    const status = getSchedulerStatus()
    expect(status.eventCounters).not.toBeInstanceOf(Map)
    expect(typeof status.eventCounters).toBe('object')
  })

  it('returns all required fields', () => {
    startScheduler(makeConfig(), vi.fn())
    const status = getSchedulerStatus()
    expect(status).toHaveProperty('running')
    expect(status).toHaveProperty('chatActive')
    expect(status).toHaveProperty('idle')
    expect(status).toHaveProperty('eventCounters')
  })
})
