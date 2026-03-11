export type TaskCategory =
  | 'deep'
  | 'visual-engineering'
  | 'ultrabrain'
  | 'artistry'
  | 'quick'
  | 'unspecified-low'
  | 'unspecified-high'
  | 'writing'

export interface CategoryConfig {
  category: TaskCategory
  description: string
  defaultModel: string
  fallbackChain: string[]
  temperature: number
  maxTokens: number
  thinkingBudget?: number
  reasoningEffort?: 'low' | 'medium' | 'high'
  toolWhitelist?: string[]
  promptAppend?: string
}

export interface RoutingDecision {
  category: TaskCategory
  model: string
  config: CategoryConfig
  confidence: number
  reason: string
}

export interface ModelCapability {
  id: string
  provider: string
  contextWindow: number
  supportsTools: boolean
  supportsVision: boolean
  supportsThinking: boolean
  costPerMToken: { input: number; output: number }
  tier: number
}
