/**
 * Multi-Agent System Types — Cortex V2 Agent Architecture
 *
 * 8+1 specialized agents running in parallel, orchestrated by a central coordinator.
 * Each agent has a domain-specific role and model assignment.
 */

// =====================
// Agent Roles
// =====================

export type AgentRole =
  | 'orchestrator'
  | 'performance'
  | 'security'
  | 'review'
  | 'writer'
  | 'formatter'
  | 'feedback'
  | 'implementation'
  | 'knowledge-crystallizer'
  | 'sisyphus'
  | 'hephaestus'
  | 'prometheus'
  | 'atlas'
  | 'oracle'
  | 'explore'
  | 'librarian'

export type AgentStatus = 'idle' | 'running' | 'completed' | 'error' | 'skipped'

export type ModelTier = 'fast' | 'balanced' | 'premium'

// =====================
// Agent Configuration
// =====================

export interface AgentConfig {
  /** Which LLM model tier to use */
  modelTier: ModelTier
  /** Model override (specific model ID) */
  modelOverride?: string
  /** Max tokens for output */
  maxTokens: number
  /** Temperature (0-1) */
  temperature: number
  /** Timeout in ms */
  timeoutMs: number
  /** Whether this agent runs async (fire-and-forget) */
  async: boolean
}

export interface AgentDefinition {
  role: AgentRole
  name: string
  description: string
  systemPrompt: string
  config: AgentConfig
  /** Skills this agent composes */
  skills: string[]
  /** When should this agent be activated */
  activationRules: ActivationRule[]
}

// =====================
// Activation Rules
// =====================

export type IntentType =
  | 'simple_question'
  | 'code_question'
  | 'code_review'
  | 'implementation'
  | 'debugging'
  | 'architecture'
  | 'general_chat'
  | 'memory_query'
  | 'tool_use'
  | 'complex_analysis'

export interface ActivationRule {
  /** Intent types that activate this agent */
  intents: IntentType[]
  /** Minimum complexity score (0-1) to activate */
  minComplexity?: number
  /** Always activate regardless of intent */
  always?: boolean
}

// =====================
// Agent Input/Output
// =====================

export interface AgentInput {
  query: string
  projectId: string
  conversationId?: string
  sharedContext: SharedAgentContext
  instructions?: string
  mode?: 'pm' | 'engineering'
  constraints?: {
    readOnly: boolean
    allowedTools: string[]
  }
}

export interface SharedAgentContext {
  /** Core memory (always in prompt) */
  coreMemory: string
  /** Relevant archival memories */
  archivalMemories: Array<{ content: string; score: number; type?: string }>
  /** Recent recall (conversation history) */
  recentRecall: Array<{ role: string; content: string }>
  /** Retrieved code chunks from RAG */
  codeChunks: Array<{
    relativePath: string
    name?: string
    content: string
    chunkType: string
    language: string
    lineStart: number
    lineEnd: number
    score: number
  }>
  /** Directory tree */
  directoryTree?: string
  /** Project stats */
  projectStats?: {
    totalFiles: number
    totalChunks: number
    languages: Array<{ language: string; count: number }>
  }
  /** External context (Jira, Confluence, etc.) */
  externalContext?: string
}

export interface AgentOutput {
  /** Agent role */
  role: AgentRole
  /** Status */
  status: AgentStatus
  /** Main content/analysis */
  content: string
  /** Confidence score 0-1 */
  confidence: number
  /** Execution time in ms */
  durationMs: number
  /** Metadata */
  metadata: AgentOutputMetadata
}

export interface AgentOutputMetadata {
  /** Model used */
  model?: string
  /** Tokens consumed */
  tokensUsed?: { input: number; output: number }
  /** Skills invoked */
  skillsUsed?: string[]
  /** Errors encountered */
  errors?: string[]
  /** Artifacts produced (code, files, etc.) */
  artifacts?: AgentArtifact[]
  /** Suggested follow-ups */
  suggestedFollowups?: string[]
}

export interface AgentArtifact {
  type: 'code' | 'file' | 'diagram' | 'data' | 'suggestion'
  name: string
  content: string
  language?: string
}

// =====================
// Orchestrator Types
// =====================

export interface OrchestratorInput {
  query: string
  projectId: string
  conversationId?: string
  mode?: 'pm' | 'engineering'
  history?: Array<{ role: string; content: string }>
}

export interface OrchestratorResult {
  /** Final aggregated response */
  response: string
  /** Individual agent outputs */
  agentOutputs: AgentOutput[]
  /** Which agents were activated */
  activatedAgents: AgentRole[]
  /** Total execution time */
  totalDurationMs: number
  /** Intent classification */
  intent: IntentClassificationResult
  /** Aggregation metadata */
  aggregation: AggregationMetadata
}

export interface IntentClassificationResult {
  primaryIntent: IntentType
  confidence: number
  complexity: number // 0-1
  keywords: string[]
  reasoning?: string
}

export interface AggregationMetadata {
  /** How results were merged */
  strategy: 'single' | 'parallel_merge' | 'chain'
  /** Any conflicts between agents */
  conflicts: AgentConflict[]
  /** Total cost estimate */
  estimatedCost: number
}

export interface AgentConflict {
  agents: [AgentRole, AgentRole]
  description: string
  resolution: string
}

// =====================
// Agent Pool Types
// =====================

export interface AgentTask {
  id: string
  agent: AgentDefinition
  input: AgentInput
  status: AgentStatus
  output?: AgentOutput
  startedAt?: number
  completedAt?: number
}

export interface PoolConfig {
  /** Max concurrent agent executions */
  maxConcurrency: number
  /** Default timeout per agent */
  defaultTimeoutMs: number
  /** Whether to continue if some agents fail */
  continueOnFailure: boolean
}

// =====================
// Knowledge Crystallizer Types
// =====================

export type CrystalType =
  | 'decision'
  | 'pattern'
  | 'insight'
  | 'error_fix'
  | 'code_pattern'
  | 'concept'
  | 'architecture'
  | 'preference'

export interface KnowledgeCrystal {
  id: string
  projectId: string
  sourceResponseId?: string
  sourceAgent?: AgentRole
  crystalType: CrystalType
  content: string
  summary: string
  confidence: number
  domain?: string
  tags: string[]
  embedding?: Buffer | null
  relatedCrystals: string[]
  archivalMemoryId?: string
  graphNodeIds: string[]
  accessCount: number
  reinforcementCount: number
  createdAt: number
  lastReinforcedAt: number
}

export interface CrystalExtractionResult {
  crystals: KnowledgeCrystal[]
  graphUpdates: { nodesAdded: number; edgesAdded: number }
  memoryUpdates: { archivalAdded: number; coreUpdated: boolean }
  deduplication: { merged: number; linked: number; new: number }
}

export interface DbKnowledgeCrystal {
  id: string
  project_id: string
  source_response_id: string | null
  source_agent: string | null
  crystal_type: string
  content: string
  summary: string | null
  confidence: number
  domain: string | null
  tags: string | null
  embedding: Buffer | null
  related_crystals: string | null
  archival_memory_id: string | null
  graph_node_ids: string | null
  access_count: number
  reinforcement_count: number
  created_at: number
  last_reinforced_at: number
}

// =====================
// Agent Capabilities & Delegation (V3)
// =====================

export interface AgentCapability {
  role: AgentRole
  toolWhitelist?: string[]
  canDelegate: boolean
  delegateTo?: AgentRole[]
  maxConcurrentDelegations?: number
  readOnly: boolean
  backgroundCapable: boolean
}

export type DelegationStatus = 'pending' | 'accepted' | 'running' | 'completed' | 'failed' | 'rejected'

export interface DelegationRequest {
  id: string
  fromAgent: AgentRole
  toAgent: AgentRole
  prompt: string
  context?: string
  priority: number
  createdAt: number
}

export interface DelegationResult {
  requestId: string
  status: DelegationStatus
  fromAgent: AgentRole
  toAgent: AgentRole
  result?: string
  error?: string
  durationMs: number
}

export interface AgentCapabilityMap {
  [role: string]: AgentCapability
}
