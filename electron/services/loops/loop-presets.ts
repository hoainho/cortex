import type { LoopConfig, LoopState } from './types'

export function createRalphConfig(overrides?: Partial<LoopConfig>): LoopConfig {
  return {
    type: 'ralph',
    maxIterations: 50,
    maxDurationMs: 1_800_000,
    pauseBetweenIterationsMs: 0,
    autoRecover: true,
    completionCheck: (state: LoopState) => {
      const lastStep = state.steps[state.steps.length - 1]
      if (!lastStep) return false
      return lastStep.result === 'DONE' || lastStep.result === 'ALL_COMPLETE'
    },
    ...overrides
  }
}

export function createUltraworkConfig(overrides?: Partial<LoopConfig>): LoopConfig {
  return {
    type: 'ultrawork',
    maxIterations: 100,
    maxDurationMs: 3_600_000,
    pauseBetweenIterationsMs: 0,
    autoRecover: true,
    completionCheck: (state: LoopState) => {
      const lastStep = state.steps[state.steps.length - 1]
      if (!lastStep) return false
      return lastStep.result === 'DONE' || lastStep.result === 'ALL_COMPLETE'
    },
    ...overrides
  }
}

export function createBoulderConfig(overrides?: Partial<LoopConfig>): LoopConfig {
  return {
    type: 'boulder',
    maxIterations: 200,
    maxDurationMs: 7_200_000,
    pauseBetweenIterationsMs: 100,
    autoRecover: true,
    completionCheck: (state: LoopState) => {
      if (state.steps.length === 0) return false
      const completedSteps = state.steps.filter(s => s.status === 'completed')
      const failedSteps = state.steps.filter(s => s.status === 'failed')
      if (failedSteps.length >= 3) return true
      const lastStep = state.steps[state.steps.length - 1]
      return lastStep?.result === 'DONE' || completedSteps.length >= state.config.maxIterations
    },
    ...overrides
  }
}
