export type LoopType = 'ralph' | 'ultrawork' | 'boulder'

export type LoopStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'

export type LoopStepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped'

export interface LoopStep {
  id: string
  description: string
  status: LoopStepStatus
  result?: string
  error?: string
  startedAt: number | null
  completedAt: number | null
  iteration: number
}

export interface LoopConfig {
  type: LoopType
  maxIterations: number
  maxDurationMs: number
  pauseBetweenIterationsMs: number
  autoRecover: boolean
  completionCheck: (state: LoopState) => boolean
}

export interface LoopState {
  id: string
  type: LoopType
  status: LoopStatus
  config: LoopConfig
  currentIteration: number
  steps: LoopStep[]
  startedAt: number | null
  completedAt: number | null
  lastActivityAt: number
  metadata: Record<string, unknown>
}

export interface BoulderState {
  loopId: string
  projectId: string
  sessionId: string
  checkpoint: Record<string, unknown>
  todoSnapshot: Array<{ content: string; status: string; priority: string }>
  filesModified: string[]
  createdAt: number
  updatedAt: number
}

export type LoopEvent =
  | { type: 'loop:started'; state: LoopState }
  | { type: 'loop:iteration'; state: LoopState; iteration: number }
  | { type: 'loop:step:started'; state: LoopState; step: LoopStep }
  | { type: 'loop:step:completed'; state: LoopState; step: LoopStep }
  | { type: 'loop:step:failed'; state: LoopState; step: LoopStep }
  | { type: 'loop:paused'; state: LoopState }
  | { type: 'loop:resumed'; state: LoopState }
  | { type: 'loop:completed'; state: LoopState }
  | { type: 'loop:failed'; state: LoopState; error: string }
  | { type: 'loop:cancelled'; state: LoopState }
  | { type: 'boulder:saved'; boulder: BoulderState }
  | { type: 'boulder:restored'; boulder: BoulderState }

export type LoopEventListener = (event: LoopEvent) => void
