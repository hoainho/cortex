import { describe, it, expect, beforeEach, vi } from 'vitest'

import {
  registerHook,
  unregisterHook,
  runHooks,
  resetRegistry
} from '../../electron/services/hooks'
import type { HookDefinition, HookContext } from '../../electron/services/hooks'

import {
  resolveCategory,
  routeToModel
} from '../../electron/services/routing'

import {
  launchTask,
  cancelTask,
  getTask,
  onTaskEvent,
  resetBackgroundManager,
  resetConcurrency,
  configureConcurrency
} from '../../electron/services/background'
import type { BackgroundTaskEvent } from '../../electron/services/background'

import {
  createLoop,
  startLoop,
  getLoop,
  resetLoopEngine,
  createRalphConfig,
  saveBoulder,
  getBoulder,
  updateBoulderCheckpoint,
  addModifiedFile,
  updateTodoSnapshot,
  resetBoulderState,
  onLoopEvent
} from '../../electron/services/loops'
import type { LoopStep, LoopState, LoopEvent } from '../../electron/services/loops'

import {
  registerDefaultCapabilities,
  canDelegate,
  isReadOnly,
  isBackgroundCapable,
  getToolWhitelist,
  createDelegationRequest,
  resetCapabilities
} from '../../electron/services/agents/agent-capabilities'

beforeEach(() => {
  resetRegistry()
  resetConcurrency()
  resetBackgroundManager()
  resetLoopEngine()
  resetBoulderState()
  resetCapabilities()
})

describe('hooks + routing integration', () => {
  it('hook can modify routing category before processing', async () => {
    const overrideHook: HookDefinition = {
      id: 'route-override',
      name: 'Route Override',
      description: 'Forces ultrabrain for architecture queries',
      trigger: 'before:chat',
      priority: 'critical',
      enabled: true,
      handler: (ctx: HookContext) => {
        if (ctx.query?.includes('architecture')) {
          return { modified: true, data: { metadata: { forcedCategory: 'ultrabrain' } } }
        }
        return { modified: false }
      }
    }
    registerHook(overrideHook)

    const ctx: HookContext = { projectId: 'p1', query: 'design the system architecture' }
    const result = await runHooks('before:chat', ctx)

    expect(result.context.metadata).toEqual({ forcedCategory: 'ultrabrain' })

    const forcedCategory = (result.context.metadata as Record<string, string>)?.forcedCategory
    if (forcedCategory === 'ultrabrain') {
      const routing = resolveCategory({ category: 'ultrabrain' })
      expect(routing.category).toBe('ultrabrain')
      expect(routing.confidence).toBe(1.0)
    }
  })

  it('cost-guard hook can use routing info to estimate cost', async () => {
    const routing = resolveCategory({ prompt: 'Create a new UI component with CSS styling' })
    expect(routing.category).toBe('visual-engineering')

    const costHook: HookDefinition = {
      id: 'cost-check',
      name: 'Cost Check',
      description: 'Checks cost based on model routing',
      trigger: 'before:chat',
      priority: 'high',
      enabled: true,
      handler: (ctx: HookContext) => {
        const model = ctx.model
        if (model === routing.model) {
          return { modified: true, data: { metadata: { costEstimate: 0.05 } } }
        }
        return { modified: false }
      }
    }
    registerHook(costHook)

    const ctx: HookContext = { projectId: 'p1', model: routing.model }
    const result = await runHooks('before:chat', ctx)
    expect(result.context.metadata).toEqual({ costEstimate: 0.05 })
  })
})

describe('background + routing integration', () => {
  it('launches a task with category from routing', async () => {
    const routing = resolveCategory({ prompt: 'Investigate the bug in error handling' })

    const events: BackgroundTaskEvent[] = []
    onTaskEvent(e => events.push(e))

    const taskId = launchTask({
      description: 'Background investigation',
      execute: () => Promise.resolve('found the bug'),
      category: routing.category,
      provider: 'anthropic'
    })

    await vi.waitFor(() => {
      expect(getTask(taskId)?.status).toBe('completed')
    })

    const task = getTask(taskId)
    expect(task?.category).toBe(routing.category)
    expect(task?.result).toBe('found the bug')
  })

  it('respects concurrency limits per category', () => {
    configureConcurrency({ maxPerCategory: { deep: 1 } })

    const id1 = launchTask({
      description: 'task 1',
      execute: () => new Promise(() => {}),
      category: 'deep'
    })
    const id2 = launchTask({
      description: 'task 2',
      execute: () => new Promise(() => {}),
      category: 'deep'
    })

    expect(getTask(id1)?.status).toBe('running')
    expect(getTask(id2)?.status).toBe('pending')

    cancelTask(id1)
    cancelTask(id2)
  })
})

describe('loops + boulder integration', () => {
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

  it('boulder state persists across loop iterations', async () => {
    const config = createRalphConfig({
      maxIterations: 3,
      completionCheck: (state: LoopState) => state.currentIteration >= 3
    })
    const loop = createLoop(config, { projectId: 'proj_1' })

    saveBoulder({
      loopId: loop.id,
      projectId: 'proj_1',
      sessionId: 'ses_1',
      checkpoint: {},
      todoSnapshot: [],
      filesModified: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    await startLoop(loop.id, async (iteration) => {
      updateBoulderCheckpoint(loop.id, { lastIteration: iteration })
      addModifiedFile(loop.id, `src/file_${iteration}.ts`)
      return makeStep(iteration)
    })

    const boulder = getBoulder(loop.id)
    expect(boulder?.checkpoint).toEqual({ lastIteration: 3 })
    expect(boulder?.filesModified).toEqual([
      'src/file_1.ts',
      'src/file_2.ts',
      'src/file_3.ts'
    ])
  })

  it('boulder todo snapshot updates with loop progress', async () => {
    const config = createRalphConfig({
      maxIterations: 2,
      completionCheck: (state: LoopState) => state.currentIteration >= 2
    })
    const loop = createLoop(config)

    saveBoulder({
      loopId: loop.id,
      projectId: 'proj_1',
      sessionId: 'ses_1',
      checkpoint: {},
      todoSnapshot: [{ content: 'initial', status: 'pending', priority: 'high' }],
      filesModified: [],
      createdAt: Date.now(),
      updatedAt: Date.now()
    })

    await startLoop(loop.id, async (iteration) => {
      updateTodoSnapshot(loop.id, [
        { content: 'initial', status: iteration >= 2 ? 'completed' : 'in_progress', priority: 'high' }
      ])
      return makeStep(iteration)
    })

    const boulder = getBoulder(loop.id)
    expect(boulder?.todoSnapshot[0].status).toBe('completed')
  })
})

describe('capabilities + background integration', () => {
  beforeEach(() => registerDefaultCapabilities())

  it('background-capable agents can be launched as background tasks', () => {
    expect(isBackgroundCapable('explore')).toBe(true)
    expect(isBackgroundCapable('librarian')).toBe(true)

    const taskId = launchTask({
      description: 'explore codebase',
      execute: () => new Promise(() => {}),
      agentType: 'explore'
    })

    const task = getTask(taskId)
    expect(task?.agentType).toBe('explore')
    expect(task?.status).toBe('running')
    cancelTask(taskId)
  })

  it('delegation request integrates with background task launch', () => {
    const req = createDelegationRequest('sisyphus', 'explore', 'Find auth patterns')
    expect(req).not.toBeNull()

    const taskId = launchTask({
      description: req!.prompt,
      execute: () => Promise.resolve('found 5 auth patterns'),
      agentType: req!.toAgent,
      category: 'deep'
    })

    expect(getTask(taskId)?.description).toBe('Find auth patterns')
    cancelTask(taskId)
  })

  it('read-only agents have restricted tool whitelist', () => {
    const oracleTools = getToolWhitelist('oracle')
    const sisyphusTools = getToolWhitelist('sisyphus')

    expect(oracleTools).not.toContain('write')
    expect(oracleTools).not.toContain('edit')
    expect(sisyphusTools).toContain('write')
    expect(sisyphusTools).toContain('edit')
  })
})

describe('routing + model capabilities', () => {
  it('routes to available model from fallback chain', () => {
    const decision = resolveCategory({ category: 'deep' })
    const result = routeToModel(decision, ['gpt-4o', 'claude-3.5-sonnet'])
    expect(result.model).toBeDefined()
    expect(result.fallbackUsed).toBeDefined()
  })

  it('falls back to first available when no match', () => {
    const decision = resolveCategory({ category: 'deep' })
    const result = routeToModel(decision, ['custom-model-xyz'])
    expect(result.model).toBe('custom-model-xyz')
    expect(result.fallbackUsed).toBe(true)
  })

  it('uses default model when no models available', () => {
    const decision = resolveCategory({ category: 'deep' })
    const result = routeToModel(decision, [])
    expect(result.model).toBe(decision.config.defaultModel)
    expect(result.fallbackUsed).toBe(false)
  })
})

describe('full lifecycle: hook → route → background → loop', () => {
  it('simulates an end-to-end V3 workflow', async () => {
    const events: string[] = []

    registerHook({
      id: 'lifecycle-logger',
      name: 'Lifecycle Logger',
      description: 'Logs events',
      trigger: 'before:chat',
      priority: 'normal',
      enabled: true,
      handler: () => {
        events.push('hook:before:chat')
        return { modified: false }
      }
    })

    await runHooks('before:chat', { projectId: 'p1', query: 'implement feature' })
    events.push('hook:done')

    const routing = resolveCategory({ prompt: 'implement feature' })
    events.push(`route:${routing.category}`)

    const taskId = launchTask({
      description: 'implement feature',
      execute: () => Promise.resolve('feature implemented'),
      category: routing.category
    })
    events.push('task:launched')

    await vi.waitFor(() => {
      expect(getTask(taskId)?.status).toBe('completed')
    })
    events.push('task:completed')

    expect(events).toEqual([
      'hook:before:chat',
      'hook:done',
      `route:${routing.category}`,
      'task:launched',
      'task:completed'
    ])
  })
})
