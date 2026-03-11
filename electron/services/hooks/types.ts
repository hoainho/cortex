export type HookTrigger =
  | 'before:chat'
  | 'after:chat'
  | 'on:error'
  | 'on:stream'
  | 'before:delegation'
  | 'after:delegation'
  | 'on:model:switch'
  | 'on:context:overflow'
  | 'on:tool:call'
  | 'on:session:start'
  | 'on:session:end'

export type HookPriority = 'critical' | 'high' | 'normal' | 'low'

export interface HookContext {
  projectId: string
  conversationId?: string
  query?: string
  response?: string
  error?: Error
  model?: string
  tokens?: { input: number; output: number }
  metadata?: Record<string, unknown>
}

export interface HookResult {
  modified?: boolean
  data?: Partial<HookContext>
  abort?: boolean
  message?: string
}

export interface HookDefinition {
  id: string
  name: string
  description: string
  trigger: HookTrigger | HookTrigger[]
  priority: HookPriority
  enabled: boolean
  handler: (context: HookContext) => Promise<HookResult> | HookResult
}

export interface HookStats {
  totalExecutions: number
  successCount: number
  errorCount: number
  avgLatencyMs: number
  lastExecutedAt: number | null
}
