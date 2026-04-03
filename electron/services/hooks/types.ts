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
  | 'on:tool:pre'
  | 'on:tool:post'
  | 'on:tool:failure'
  | 'on:permission:request'
  | 'on:permission:denied'
  | 'on:agent:start'
  | 'on:agent:stop'
  | 'on:context:pre-compact'
  | 'on:context:post-compact'
  | 'on:file:changed'
  | 'on:config:changed'
  | 'on:instructions:loaded'
  | 'on:loop:start'
  | 'on:loop:end'
  | 'on:background:task'
  | 'on:training:complete'

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
  toolName?: string
  toolInput?: Record<string, unknown>
  toolOutput?: unknown
  agentName?: string
  filePath?: string
}

export type HookExitCode = 0 | 1 | 2

export interface HttpHookDefinition {
  id: string
  name: string
  description: string
  trigger: HookTrigger | HookTrigger[]
  priority: HookPriority
  enabled: boolean
  type: 'http'
  url: string
  method?: 'POST' | 'GET' | 'PUT'
  headers?: Record<string, string>
  body?: Record<string, unknown> | string
  async?: boolean
  retries?: number
  timeoutMs?: number
  matcher?: string
}

export type AnyHookDefinition = HookDefinition | HttpHookDefinition

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
