import type {
  LoopState,
  LoopConfig,
  LoopStep,
  LoopStatus,
  LoopEvent,
  LoopEventListener,
  LoopType
} from './types'

const loops = new Map<string, LoopState>()
const listeners = new Set<LoopEventListener>()
const cancelFlags = new Map<string, boolean>()

function generateId(type: LoopType): string {
  return `loop_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

function emit(event: LoopEvent): void {
  for (const listener of listeners) {
    try {
      listener(event)
    } catch {
    }
  }
}

export function createLoop(config: LoopConfig, metadata: Record<string, unknown> = {}): LoopState {
  const id = generateId(config.type)
  const state: LoopState = {
    id,
    type: config.type,
    status: 'idle',
    config,
    currentIteration: 0,
    steps: [],
    startedAt: null,
    completedAt: null,
    lastActivityAt: Date.now(),
    metadata
  }
  loops.set(id, state)
  return { ...state }
}

export function getLoop(loopId: string): LoopState | undefined {
  const state = loops.get(loopId)
  return state ? { ...state, steps: state.steps.map(s => ({ ...s })) } : undefined
}

export function getAllLoops(): LoopState[] {
  return Array.from(loops.values()).map(s => ({ ...s, steps: s.steps.map(step => ({ ...step })) }))
}

export function getLoopsByStatus(status: LoopStatus): LoopState[] {
  return Array.from(loops.values())
    .filter(s => s.status === status)
    .map(s => ({ ...s, steps: s.steps.map(step => ({ ...step })) }))
}

export async function startLoop(
  loopId: string,
  stepExecutor: (iteration: number, state: LoopState) => Promise<LoopStep>
): Promise<LoopState> {
  const state = loops.get(loopId)
  if (!state) throw new Error(`Loop ${loopId} not found`)
  if (state.status === 'running') throw new Error(`Loop ${loopId} is already running`)

  state.status = 'running'
  state.startedAt = state.startedAt ?? Date.now()
  state.lastActivityAt = Date.now()
  cancelFlags.set(loopId, false)
  emit({ type: 'loop:started', state: { ...state } })

  try {
    while (state.currentIteration < state.config.maxIterations) {
      if (cancelFlags.get(loopId)) {
        state.status = 'cancelled'
        state.completedAt = Date.now()
        emit({ type: 'loop:cancelled', state: { ...state } })
        return { ...state }
      }

      const currentState = loops.get(loopId)
      if (currentState && currentState.status === 'paused') {
        return { ...currentState }
      }

      const elapsed = Date.now() - (state.startedAt ?? Date.now())
      if (elapsed > state.config.maxDurationMs) {
        state.status = 'failed'
        state.completedAt = Date.now()
        const error = `Max duration exceeded (${state.config.maxDurationMs}ms)`
        emit({ type: 'loop:failed', state: { ...state }, error })
        return { ...state }
      }

      state.currentIteration++
      state.lastActivityAt = Date.now()
      emit({ type: 'loop:iteration', state: { ...state }, iteration: state.currentIteration })

      const step = await stepExecutor(state.currentIteration, { ...state })
      state.steps.push(step)

      if (step.status === 'completed') {
        emit({ type: 'loop:step:completed', state: { ...state }, step: { ...step } })
      } else if (step.status === 'failed') {
        emit({ type: 'loop:step:failed', state: { ...state }, step: { ...step } })
        if (!state.config.autoRecover) {
          state.status = 'failed'
          state.completedAt = Date.now()
          emit({ type: 'loop:failed', state: { ...state }, error: step.error ?? 'Step failed' })
          return { ...state }
        }
      }

      if (state.config.completionCheck(state)) {
        state.status = 'completed'
        state.completedAt = Date.now()
        emit({ type: 'loop:completed', state: { ...state } })
        return { ...state }
      }

      if (state.config.pauseBetweenIterationsMs > 0) {
        await new Promise(resolve => setTimeout(resolve, state.config.pauseBetweenIterationsMs))
      }
    }

    state.status = state.config.completionCheck(state) ? 'completed' : 'failed'
    state.completedAt = Date.now()
    if (state.status === 'completed') {
      emit({ type: 'loop:completed', state: { ...state } })
    } else {
      emit({ type: 'loop:failed', state: { ...state }, error: 'Max iterations reached' })
    }
  } catch (err) {
    state.status = 'failed'
    state.completedAt = Date.now()
    const error = err instanceof Error ? err.message : String(err)
    emit({ type: 'loop:failed', state: { ...state }, error })
  }

  return { ...state }
}

export function pauseLoop(loopId: string): boolean {
  const state = loops.get(loopId)
  if (!state || state.status !== 'running') return false
  state.status = 'paused'
  state.lastActivityAt = Date.now()
  emit({ type: 'loop:paused', state: { ...state } })
  return true
}

export function resumeLoop(loopId: string): boolean {
  const state = loops.get(loopId)
  if (!state || state.status !== 'paused') return false
  state.status = 'running'
  state.lastActivityAt = Date.now()
  emit({ type: 'loop:resumed', state: { ...state } })
  return true
}

export function cancelLoop(loopId: string): boolean {
  const state = loops.get(loopId)
  if (!state) return false
  if (state.status === 'completed' || state.status === 'failed' || state.status === 'cancelled') return false
  cancelFlags.set(loopId, true)
  if (state.status === 'idle' || state.status === 'paused') {
    state.status = 'cancelled'
    state.completedAt = Date.now()
    emit({ type: 'loop:cancelled', state: { ...state } })
  }
  return true
}

export function onLoopEvent(listener: LoopEventListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

export function resetLoopEngine(): void {
  loops.clear()
  listeners.clear()
  cancelFlags.clear()
}
