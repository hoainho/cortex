/**
 * Skill System Types — Cortex V2 Plugin Architecture
 */

export type SkillCategory = 'rag' | 'memory' | 'agent' | 'code' | 'learning' | 'efficiency' | 'reasoning' | 'tool'
export type SkillPriority = 'p0' | 'p1' | 'p2'
export type SkillStatus = 'registered' | 'active' | 'inactive' | 'error' | 'loading'

export interface SkillConfig {
  [key: string]: unknown
}

export interface SkillInput {
  query: string
  projectId: string
  conversationId?: string
  context?: Record<string, unknown>
  mode?: string
  signal?: AbortSignal
}

export interface SkillOutput {
  content: string
  metadata?: Record<string, unknown>
  artifacts?: SkillArtifact[]
  suggestedFollowups?: string[]
}

export interface SkillArtifact {
  type: 'code' | 'file' | 'image' | 'data' | 'link'
  name: string
  content: string
  language?: string
}

export interface HealthStatus {
  healthy: boolean
  message?: string
  lastCheck: number
}

export interface SkillMetrics {
  totalCalls: number
  successCount: number
  errorCount: number
  avgLatencyMs: number
  lastUsed: number | null
}

export interface CortexSkill {
  readonly name: string
  readonly version: string
  readonly category: SkillCategory
  readonly priority: SkillPriority
  readonly description: string
  readonly dependencies: string[]

  initialize(config: SkillConfig): Promise<void>
  canHandle(input: SkillInput): boolean | Promise<boolean>
  execute(input: SkillInput): Promise<SkillOutput>
  shutdown(): Promise<void>
  healthCheck(): Promise<HealthStatus>
  getMetrics(): SkillMetrics
}

export interface SkillRegistryEntry {
  skill: CortexSkill
  status: SkillStatus
  config: SkillConfig
  registeredAt: number
  lastError?: string
}

export interface SkillRouteResult {
  skill: CortexSkill
  confidence: number
  reason: string
}

export interface SkillInfo {
  name: string
  version: string
  category: SkillCategory
  priority: SkillPriority
  status: SkillStatus
  description: string
  metrics: SkillMetrics
  dependencies: string[]
  lastError?: string
}