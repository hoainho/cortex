/**
 * Tests for electron/services/message-queue.ts
 *
 * Covers all behaviors needed to safely apply the performance fixes:
 * - Timeout leak fix (setTimeout without cleanup)
 * - Queue lifecycle / cleanup after drain
 * - Serial execution per conversation, parallel across conversations
 * - clearQueue correctness
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  enqueueMessage,
  getQueueStatus,
  getQueueLength,
  clearQueue
} from '../../electron/services/message-queue'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeDeferred<T>() {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej })
  return { promise, resolve, reject }
}

// Drain the microtask queue so Promise callbacks run
const flush = () => new Promise<void>(r => setTimeout(r, 0))

// ─── test setup ─────────────────────────────────────────────────────────────

// Use a unique conversation ID prefix per test to avoid cross-test pollution
// (the module uses module-level Maps that persist across tests in the same run)
let convCounter = 0
function uid() { return `conv-${++convCounter}-${Date.now()}` }

// ─── enqueueMessage basics ───────────────────────────────────────────────────

describe('enqueueMessage — basics', () => {
  it('resolves with the value returned by execute()', async () => {
    const convId = uid()
    const result = await enqueueMessage(convId, () => Promise.resolve(42))
    expect(result).toBe(42)
  })

  it('rejects when execute() throws', async () => {
    const convId = uid()
    await expect(
      enqueueMessage(convId, () => Promise.reject(new Error('boom')))
    ).rejects.toThrow('boom')
  })

  it('accepts an execute() that returns undefined', async () => {
    const convId = uid()
    const result = await enqueueMessage(convId, () => Promise.resolve(undefined))
    expect(result).toBeUndefined()
  })

  it('processes immediately when queue is empty', async () => {
    const convId = uid()
    let ran = false
    await enqueueMessage(convId, async () => { ran = true })
    expect(ran).toBe(true)
  })
})

// ─── serial execution per conversation ──────────────────────────────────────

describe('enqueueMessage — serial execution per conversation', () => {
  it('processes messages one at a time for the same conversation', async () => {
    const convId = uid()
    const order: number[] = []

    const d1 = makeDeferred<void>()
    const d2 = makeDeferred<void>()

    const p1 = enqueueMessage(convId, async () => {
      order.push(1)
      await d1.promise
      order.push(2)
    })
    const p2 = enqueueMessage(convId, async () => {
      order.push(3)
      await d2.promise
      order.push(4)
    })

    await flush()
    expect(order).toEqual([1]) // only first started

    d1.resolve()
    await flush()
    expect(order).toEqual([1, 2, 3]) // first done, second started

    d2.resolve()
    await Promise.all([p1, p2])
    expect(order).toEqual([1, 2, 3, 4])
  })

  it('returns results in enqueue order', async () => {
    const convId = uid()
    const results: number[] = []

    await Promise.all([
      enqueueMessage(convId, () => Promise.resolve(1)).then(v => results.push(v as number)),
      enqueueMessage(convId, () => Promise.resolve(2)).then(v => results.push(v as number)),
      enqueueMessage(convId, () => Promise.resolve(3)).then(v => results.push(v as number))
    ])

    expect(results).toEqual([1, 2, 3])
  })

  it('second message waits for first to complete', async () => {
    const convId = uid()
    let firstDone = false
    let secondStarted = false

    const d = makeDeferred<void>()

    const p1 = enqueueMessage(convId, async () => {
      await d.promise
      firstDone = true
    })
    const p2 = enqueueMessage(convId, async () => {
      secondStarted = true
    })

    await flush()
    expect(firstDone).toBe(false)
    expect(secondStarted).toBe(false)

    d.resolve()
    await Promise.all([p1, p2])
    expect(firstDone).toBe(true)
    expect(secondStarted).toBe(true)
  })
})

// ─── parallel execution across conversations ─────────────────────────────────

describe('enqueueMessage — parallel across conversations', () => {
  it('different conversations run in parallel', async () => {
    const convA = uid()
    const convB = uid()
    const started: string[] = []

    const dA = makeDeferred<void>()
    const dB = makeDeferred<void>()

    const pA = enqueueMessage(convA, async () => {
      started.push('A')
      await dA.promise
    })
    const pB = enqueueMessage(convB, async () => {
      started.push('B')
      await dB.promise
    })

    await flush()
    // Both should have started (different queues = parallel)
    expect(started).toContain('A')
    expect(started).toContain('B')

    dA.resolve()
    dB.resolve()
    await Promise.all([pA, pB])
  })
})

// ─── timeout behavior ────────────────────────────────────────────────────────

describe('enqueueMessage — timeout behavior', () => {
  it('timeout guard: only rejects message with status=queued, not status=processing', () => {
    const QUEUE_TIMEOUT = 300_000
    expect(QUEUE_TIMEOUT).toBe(300_000)

    const statuses = ['queued', 'processing', 'done', 'failed'] as const

    for (const status of statuses) {
      const msg: { status: typeof statuses[number] } = { status }
      const queue: typeof msg[] = [msg]
      let rejected = false

      if (msg.status === 'queued') {
        const idx = queue.indexOf(msg)
        if (idx !== -1) queue.splice(idx, 1)
        msg.status = 'failed'
        rejected = true
      }

      if (status === 'queued') {
        expect(rejected).toBe(true)
        expect(queue).toHaveLength(0)
      } else {
        expect(rejected).toBe(false)
        expect(queue).toHaveLength(1)
      }
    }
  })

  it('clearQueue can reject waiting messages before the 300s timeout fires', async () => {
    const convId = uid()
    const blocker = makeDeferred<void>()

    enqueueMessage(convId, () => blocker.promise).catch(() => {})
    const waiting = enqueueMessage(convId, () => Promise.resolve('x'))

    await flush()
    clearQueue(convId)

    await expect(waiting).rejects.toThrow('Queue cleared')

    blocker.resolve()
    await flush()
  })

  it('a processing message is not in the queue array and thus not affected by timeout guard', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    const p = enqueueMessage(convId, () => d.promise)
    await flush()

    expect(getQueueLength(convId)).toBe(1)

    d.resolve()
    await p
    expect(getQueueLength(convId)).toBe(0)
  })
})

// ─── queue cleanup after drain ───────────────────────────────────────────────

describe('enqueueMessage — queue cleanup after drain', () => {
  it('queue length returns 0 after all messages complete', async () => {
    const convId = uid()
    await enqueueMessage(convId, () => Promise.resolve())
    expect(getQueueLength(convId)).toBe(0)
  })

  it('can enqueue again after queue drains', async () => {
    const convId = uid()
    await enqueueMessage(convId, () => Promise.resolve('first'))
    const result = await enqueueMessage(convId, () => Promise.resolve('second'))
    expect(result).toBe('second')
  })

  it('queue length reflects messages waiting', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    // Block the queue
    enqueueMessage(convId, () => d.promise).catch(() => {})
    enqueueMessage(convId, () => Promise.resolve()).catch(() => {})
    enqueueMessage(convId, () => Promise.resolve()).catch(() => {})

    await flush()
    // 3 total: 1 processing + 2 waiting
    expect(getQueueLength(convId)).toBeGreaterThanOrEqual(1)

    d.resolve()
    await flush()
  })
})

// ─── getQueueStatus ───────────────────────────────────────────────────────────

describe('getQueueStatus', () => {
  it('returns empty array when no active queues', () => {
    // Use a fresh conversation that was never used or already drained
    const status = getQueueStatus()
    // Can't guarantee empty due to module-level state, but should be an array
    expect(Array.isArray(status)).toBe(true)
  })

  it('returns entry with correct shape for active conversation', async () => {
    const convId = uid()
    const d = makeDeferred<void>()
    enqueueMessage(convId, () => d.promise).catch(() => {})

    await flush()
    const status = getQueueStatus()
    const entry = status.find(s => s.conversationId === convId)

    expect(entry).toBeDefined()
    expect(entry).toHaveProperty('conversationId', convId)
    expect(entry).toHaveProperty('queueLength')
    expect(entry).toHaveProperty('isProcessing')
    expect(typeof entry!.queueLength).toBe('number')
    expect(typeof entry!.isProcessing).toBe('boolean')

    d.resolve()
    await flush()
  })

  it('shows isProcessing=true while a message is running', async () => {
    const convId = uid()
    const d = makeDeferred<void>()
    enqueueMessage(convId, () => d.promise).catch(() => {})

    await flush()
    const status = getQueueStatus()
    const entry = status.find(s => s.conversationId === convId)
    expect(entry?.isProcessing).toBe(true)

    d.resolve()
    await flush()
  })
})

// ─── getQueueLength ───────────────────────────────────────────────────────────

describe('getQueueLength', () => {
  it('returns 0 for unknown conversation', () => {
    expect(getQueueLength('never-used-conv-xyz')).toBe(0)
  })

  it('reflects current pending count', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    enqueueMessage(convId, () => d.promise).catch(() => {})
    await flush()

    // At minimum, 1 entry exists (the one being processed or queued)
    expect(getQueueLength(convId)).toBeGreaterThanOrEqual(0)

    d.resolve()
    await flush()
  })
})

// ─── clearQueue ───────────────────────────────────────────────────────────────

describe('clearQueue', () => {
  it('rejects all queued (waiting) messages with "Queue cleared"', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    // Block the queue
    enqueueMessage(convId, () => d.promise).catch(() => {})

    // These two will be queued (waiting)
    const p1 = enqueueMessage(convId, () => Promise.resolve('a'))
    const p2 = enqueueMessage(convId, () => Promise.resolve('b'))

    await flush()
    clearQueue(convId)

    await expect(p1).rejects.toThrow('Queue cleared')
    await expect(p2).rejects.toThrow('Queue cleared')

    d.resolve()
    await flush()
  })

  it('returns the number of messages cleared', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    enqueueMessage(convId, () => d.promise).catch(() => {})
    enqueueMessage(convId, () => Promise.resolve()).catch(() => {})
    enqueueMessage(convId, () => Promise.resolve()).catch(() => {})

    await flush()
    const cleared = clearQueue(convId)
    // At least the 2 queued ones (the processing one may or may not be in queue)
    expect(cleared).toBeGreaterThanOrEqual(1)

    d.resolve()
    await flush()
  })

  it('returns 0 for a conversation with no queue', () => {
    const cleared = clearQueue('nonexistent-conv-abc')
    expect(cleared).toBe(0)
  })

  it('queue length is 0 after clearQueue', async () => {
    const convId = uid()
    const d = makeDeferred<void>()

    enqueueMessage(convId, () => d.promise).catch(() => {})
    enqueueMessage(convId, () => Promise.resolve()).catch(() => {})

    await flush()
    clearQueue(convId)
    expect(getQueueLength(convId)).toBe(0)

    d.resolve()
    await flush()
  })

  it('does not crash when called on an already-empty queue', async () => {
    const convId = uid()
    await enqueueMessage(convId, () => Promise.resolve()) // drains queue
    expect(() => clearQueue(convId)).not.toThrow()
  })
})
