import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  createLoop,
  getLoop,
  getAllLoops,
  getLoopsByStatus,
  startLoop,
  pauseLoop,
  resumeLoop,
  cancelLoop,
  onLoopEvent,
  resetLoopEngine,
  saveBoulder,
  getBoulder,
  getBoulderBySession,
  getBoulderByProject,
  updateBoulderCheckpoint,
  addModifiedFile,
  updateTodoSnapshot,
  restoreBoulder,
  deleteBoulder,
  getAllBoulders,
  onBoulderEvent,
  resetBoulderState,
  createRalphConfig,
  createUltraworkConfig,
  createBoulderConfig
} from '../../electron/services/loops'
import type { LoopStep, LoopEvent, LoopState, BoulderState } from '../../electron/services/loops'

beforeEach(() => {
  resetLoopEngine()
  resetBoulderState()
})

function makeStep(iteration: number, result: string = 'ok'): LoopStep {
  return {
    id: `step_${iteration}`,
    description: `Step ${iteration}`,
    status: 'completed',
    result,
    startedAt: Date.now(),
    completedAt: Date.now(),
    iteration
  }
}

describe('loop-engine', () => {
  describe('createLoop', () => {
    it('creates a loop with idle status', () => {
      const config = createRalphConfig()
      const loop = createLoop(config)
      expect(loop.id).toMatch(/^loop_ralph_/)
      expect(loop.status).toBe('idle')
      expect(loop.currentIteration).toBe(0)
      expect(loop.steps).toEqual([])
    })

    it('stores metadata', () => {
      const config = createRalphConfig()
      const loop = createLoop(config, { projectId: 'p1' })
      expect(loop.metadata).toEqual({ projectId: 'p1' })
    })

    it('creates with correct type', () => {
      expect(createLoop(createRalphConfig()).type).toBe('ralph')
      expect(createLoop(createUltraworkConfig()).type).toBe('ultrawork')
      expect(createLoop(createBoulderConfig()).type).toBe('boulder')
    })
  })

  describe('getLoop', () => {
    it('returns undefined for unknown id', () => {
      expect(getLoop('nonexistent')).toBeUndefined()
    })

    it('returns a copy', () => {
      const config = createRalphConfig()
      const loop = createLoop(config)
      const a = getLoop(loop.id)
      const b = getLoop(loop.id)
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('getAllLoops', () => {
    it('returns all loops', () => {
      createLoop(createRalphConfig())
      createLoop(createUltraworkConfig())
      expect(getAllLoops()).toHaveLength(2)
    })
  })

  describe('getLoopsByStatus', () => {
    it('filters by status', () => {
      createLoop(createRalphConfig())
      createLoop(createUltraworkConfig())
      expect(getLoopsByStatus('idle')).toHaveLength(2)
      expect(getLoopsByStatus('running')).toHaveLength(0)
    })
  })

  describe('startLoop', () => {
    it('runs to completion when completionCheck passes', async () => {
      const config = createRalphConfig({
        maxIterations: 5,
        completionCheck: (state: LoopState) => state.currentIteration >= 3
      })
      const loop = createLoop(config)

      const result = await startLoop(loop.id, async (iteration) => makeStep(iteration, 'ok'))
      expect(result.status).toBe('completed')
      expect(result.currentIteration).toBe(3)
      expect(result.steps).toHaveLength(3)
    })

    it('fails after max iterations without completion', async () => {
      const config = createRalphConfig({
        maxIterations: 3,
        completionCheck: () => false
      })
      const loop = createLoop(config)

      const result = await startLoop(loop.id, async (iteration) => makeStep(iteration))
      expect(result.status).toBe('failed')
      expect(result.currentIteration).toBe(3)
    })

    it('fails on step failure when autoRecover is false', async () => {
      const config = createRalphConfig({
        maxIterations: 10,
        autoRecover: false
      })
      const loop = createLoop(config)

      const result = await startLoop(loop.id, async (iteration) => ({
        id: `step_${iteration}`,
        description: 'failing step',
        status: 'failed',
        error: 'boom',
        startedAt: Date.now(),
        completedAt: Date.now(),
        iteration
      }))

      expect(result.status).toBe('failed')
      expect(result.currentIteration).toBe(1)
    })

    it('continues past failures when autoRecover is true', async () => {
      const config = createRalphConfig({
        maxIterations: 3,
        autoRecover: true,
        completionCheck: (state: LoopState) => state.currentIteration >= 3
      })
      const loop = createLoop(config)

      let callCount = 0
      const result = await startLoop(loop.id, async (iteration) => {
        callCount++
        if (callCount === 1) {
          return { id: `step_${iteration}`, description: 'fail', status: 'failed', error: 'err', startedAt: Date.now(), completedAt: Date.now(), iteration }
        }
        return makeStep(iteration)
      })

      expect(result.status).toBe('completed')
      expect(result.steps).toHaveLength(3)
    })

    it('throws for unknown loop id', async () => {
      await expect(startLoop('nonexistent', async () => makeStep(1))).rejects.toThrow('not found')
    })

    it('throws if loop is already running', async () => {
      const config = createRalphConfig({ maxIterations: 2, completionCheck: () => false })
      const loop = createLoop(config)

      let resolveFirst: (() => void) | null = null
      const blockingPromise = new Promise<void>(resolve => { resolveFirst = resolve })

      const promise = startLoop(loop.id, async (iteration) => {
        if (iteration === 1) await blockingPromise
        return makeStep(iteration)
      })

      await vi.waitFor(() => {
        expect(getLoop(loop.id)?.status).toBe('running')
      })

      await expect(startLoop(loop.id, async () => makeStep(1))).rejects.toThrow('already running')
      resolveFirst!()
      await promise
    })

    it('respects max duration', async () => {
      const config = createRalphConfig({
        maxIterations: 1000,
        maxDurationMs: 0
      })
      const loop = createLoop(config)

      const result = await startLoop(loop.id, async (iteration) => makeStep(iteration))
      expect(result.status).toBe('failed')
    })

    it('emits loop events', async () => {
      const events: LoopEvent[] = []
      onLoopEvent(e => events.push(e))

      const config = createRalphConfig({
        maxIterations: 2,
        completionCheck: (state: LoopState) => state.currentIteration >= 2
      })
      const loop = createLoop(config)
      await startLoop(loop.id, async (iteration) => makeStep(iteration))

      expect(events.some(e => e.type === 'loop:started')).toBe(true)
      expect(events.some(e => e.type === 'loop:iteration')).toBe(true)
      expect(events.some(e => e.type === 'loop:step:completed')).toBe(true)
      expect(events.some(e => e.type === 'loop:completed')).toBe(true)
    })
  })

  describe('cancelLoop', () => {
    it('cancels an idle loop', () => {
      const loop = createLoop(createRalphConfig())
      expect(cancelLoop(loop.id)).toBe(true)
      expect(getLoop(loop.id)?.status).toBe('cancelled')
    })

    it('cancels a paused loop', async () => {
      const config = createRalphConfig({ maxIterations: 100 })
      const loop = createLoop(config)

      let iterationCount = 0
      const promise = startLoop(loop.id, async (iteration) => {
        iterationCount++
        if (iterationCount === 2) pauseLoop(loop.id)
        return makeStep(iteration)
      })

      await promise
      expect(getLoop(loop.id)?.status).toBe('paused')

      expect(cancelLoop(loop.id)).toBe(true)
      expect(getLoop(loop.id)?.status).toBe('cancelled')
    })

    it('returns false for completed loop', async () => {
      const config = createRalphConfig({
        maxIterations: 1,
        completionCheck: () => true
      })
      const loop = createLoop(config)
      await startLoop(loop.id, async (iteration) => makeStep(iteration, 'DONE'))

      expect(cancelLoop(loop.id)).toBe(false)
    })

    it('returns false for unknown loop', () => {
      expect(cancelLoop('nonexistent')).toBe(false)
    })
  })

  describe('pauseLoop and resumeLoop', () => {
    it('resumeLoop returns false for non-paused loop', () => {
      const loop = createLoop(createRalphConfig())
      expect(resumeLoop(loop.id)).toBe(false)
    })

    it('pauseLoop returns false for idle loop', () => {
      const loop = createLoop(createRalphConfig())
      expect(pauseLoop(loop.id)).toBe(false)
    })
  })

  describe('event listener', () => {
    it('unsubscribe stops events', async () => {
      const events: LoopEvent[] = []
      const unsub = onLoopEvent(e => events.push(e))
      unsub()

      const config = createRalphConfig({ maxIterations: 1, completionCheck: () => true })
      const loop = createLoop(config)
      await startLoop(loop.id, async (iteration) => makeStep(iteration))

      expect(events).toHaveLength(0)
    })

    it('swallows listener errors', async () => {
      onLoopEvent(() => { throw new Error('listener crash') })
      const config = createRalphConfig({ maxIterations: 1, completionCheck: () => true })
      const loop = createLoop(config)

      await expect(startLoop(loop.id, async (iteration) => makeStep(iteration))).resolves.toBeDefined()
    })
  })
})

describe('boulder-state', () => {
  function makeBoulder(loopId: string = 'loop_1', projectId: string = 'proj_1'): BoulderState {
    return {
      loopId,
      projectId,
      sessionId: `ses_${loopId}`,
      checkpoint: { step: 3 },
      todoSnapshot: [{ content: 'task 1', status: 'completed', priority: 'high' }],
      filesModified: ['src/a.ts'],
      createdAt: Date.now(),
      updatedAt: Date.now()
    }
  }

  describe('saveBoulder / getBoulder', () => {
    it('saves and retrieves boulder', () => {
      saveBoulder(makeBoulder())
      const b = getBoulder('loop_1')
      expect(b).toBeDefined()
      expect(b?.projectId).toBe('proj_1')
    })

    it('returns undefined for unknown id', () => {
      expect(getBoulder('nonexistent')).toBeUndefined()
    })

    it('returns a copy', () => {
      saveBoulder(makeBoulder())
      const a = getBoulder('loop_1')
      const b = getBoulder('loop_1')
      expect(a).toEqual(b)
      expect(a).not.toBe(b)
    })
  })

  describe('getBoulderBySession', () => {
    it('finds by session id', () => {
      saveBoulder(makeBoulder('loop_1'))
      const b = getBoulderBySession('ses_loop_1')
      expect(b?.loopId).toBe('loop_1')
    })

    it('returns undefined for unknown session', () => {
      expect(getBoulderBySession('nonexistent')).toBeUndefined()
    })
  })

  describe('getBoulderByProject', () => {
    it('finds all boulders for a project', () => {
      saveBoulder(makeBoulder('loop_1', 'proj_a'))
      saveBoulder(makeBoulder('loop_2', 'proj_a'))
      saveBoulder(makeBoulder('loop_3', 'proj_b'))
      expect(getBoulderByProject('proj_a')).toHaveLength(2)
      expect(getBoulderByProject('proj_b')).toHaveLength(1)
    })
  })

  describe('updateBoulderCheckpoint', () => {
    it('merges checkpoint data', () => {
      saveBoulder(makeBoulder())
      updateBoulderCheckpoint('loop_1', { step: 5, extra: true })
      const b = getBoulder('loop_1')
      expect(b?.checkpoint).toEqual({ step: 5, extra: true })
    })

    it('returns false for unknown boulder', () => {
      expect(updateBoulderCheckpoint('nonexistent', {})).toBe(false)
    })
  })

  describe('addModifiedFile', () => {
    it('adds a file to the list', () => {
      saveBoulder(makeBoulder())
      addModifiedFile('loop_1', 'src/b.ts')
      const b = getBoulder('loop_1')
      expect(b?.filesModified).toContain('src/a.ts')
      expect(b?.filesModified).toContain('src/b.ts')
    })

    it('does not duplicate files', () => {
      saveBoulder(makeBoulder())
      addModifiedFile('loop_1', 'src/a.ts')
      const b = getBoulder('loop_1')
      expect(b?.filesModified.filter(f => f === 'src/a.ts')).toHaveLength(1)
    })

    it('returns false for unknown boulder', () => {
      expect(addModifiedFile('nonexistent', 'f.ts')).toBe(false)
    })
  })

  describe('updateTodoSnapshot', () => {
    it('replaces todo snapshot', () => {
      saveBoulder(makeBoulder())
      updateTodoSnapshot('loop_1', [{ content: 'new task', status: 'pending', priority: 'medium' }])
      const b = getBoulder('loop_1')
      expect(b?.todoSnapshot).toHaveLength(1)
      expect(b?.todoSnapshot[0].content).toBe('new task')
    })

    it('returns false for unknown boulder', () => {
      expect(updateTodoSnapshot('nonexistent', [])).toBe(false)
    })
  })

  describe('restoreBoulder', () => {
    it('restores and emits event', () => {
      const events: LoopEvent[] = []
      onBoulderEvent(e => events.push(e))
      saveBoulder(makeBoulder())
      const b = restoreBoulder('loop_1')
      expect(b).toBeDefined()
      expect(events.some(e => e.type === 'boulder:restored')).toBe(true)
    })

    it('returns undefined for unknown boulder', () => {
      expect(restoreBoulder('nonexistent')).toBeUndefined()
    })
  })

  describe('deleteBoulder', () => {
    it('deletes boulder', () => {
      saveBoulder(makeBoulder())
      expect(deleteBoulder('loop_1')).toBe(true)
      expect(getBoulder('loop_1')).toBeUndefined()
    })

    it('returns false for unknown boulder', () => {
      expect(deleteBoulder('nonexistent')).toBe(false)
    })
  })

  describe('getAllBoulders', () => {
    it('returns all boulders', () => {
      saveBoulder(makeBoulder('l1'))
      saveBoulder(makeBoulder('l2'))
      expect(getAllBoulders()).toHaveLength(2)
    })
  })

  describe('boulder events', () => {
    it('emits boulder:saved on save', () => {
      const events: LoopEvent[] = []
      onBoulderEvent(e => events.push(e))
      saveBoulder(makeBoulder())
      expect(events.some(e => e.type === 'boulder:saved')).toBe(true)
    })

    it('unsubscribe stops boulder events', () => {
      const events: LoopEvent[] = []
      const unsub = onBoulderEvent(e => events.push(e))
      unsub()
      saveBoulder(makeBoulder())
      expect(events).toHaveLength(0)
    })
  })
})

describe('loop presets', () => {
  describe('createRalphConfig', () => {
    it('has ralph type', () => {
      expect(createRalphConfig().type).toBe('ralph')
    })

    it('has 50 max iterations', () => {
      expect(createRalphConfig().maxIterations).toBe(50)
    })

    it('has 30min max duration', () => {
      expect(createRalphConfig().maxDurationMs).toBe(1_800_000)
    })

    it('has autoRecover enabled', () => {
      expect(createRalphConfig().autoRecover).toBe(true)
    })

    it('accepts overrides', () => {
      const config = createRalphConfig({ maxIterations: 10 })
      expect(config.maxIterations).toBe(10)
      expect(config.type).toBe('ralph')
    })

    it('completion check returns true for DONE result', () => {
      const config = createRalphConfig()
      const state = { steps: [makeStep(1, 'DONE')] } as LoopState
      expect(config.completionCheck(state)).toBe(true)
    })

    it('completion check returns false for non-DONE result', () => {
      const config = createRalphConfig()
      const state = { steps: [makeStep(1, 'ok')] } as LoopState
      expect(config.completionCheck(state)).toBe(false)
    })
  })

  describe('createUltraworkConfig', () => {
    it('has ultrawork type', () => {
      expect(createUltraworkConfig().type).toBe('ultrawork')
    })

    it('has 100 max iterations', () => {
      expect(createUltraworkConfig().maxIterations).toBe(100)
    })

    it('has 1hr max duration', () => {
      expect(createUltraworkConfig().maxDurationMs).toBe(3_600_000)
    })
  })

  describe('createBoulderConfig', () => {
    it('has boulder type', () => {
      expect(createBoulderConfig().type).toBe('boulder')
    })

    it('has 200 max iterations', () => {
      expect(createBoulderConfig().maxIterations).toBe(200)
    })

    it('has 2hr max duration', () => {
      expect(createBoulderConfig().maxDurationMs).toBe(7_200_000)
    })

    it('has pause between iterations', () => {
      expect(createBoulderConfig().pauseBetweenIterationsMs).toBe(100)
    })
  })
})
