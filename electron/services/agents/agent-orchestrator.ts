import { randomUUID } from 'crypto'
import type {
  AgentRole, AgentDefinition, AgentInput, AgentOutput, AgentTask,
  OrchestratorInput, OrchestratorResult, IntentClassificationResult,
  IntentType, SharedAgentContext, PoolConfig
} from './types'
import { buildSharedContext } from './agent-context'
import { executeAgentPool } from './agent-pool'
import { aggregateResults, detectConflicts, estimateCost } from './result-aggregator'

const INTENT_PATTERNS: Record<IntentType, RegExp[]> = {
  simple_question: [/^(what|how|why|when|where|who|which|can|does|is|are)\b/i],
  code_question: [/\b(function|class|file|module|import|export|component|service|controller|middleware)\b/i],
  code_review: [/\b(review|quality|refactor|improve|clean|lint|pattern|best practice)\b/i],
  implementation: [/\b(implement|create|build|add|write|generate|make|develop|code)\b/i],
  debugging: [/\b(bug|error|fix|debug|crash|fail|broken|issue|problem|exception|stack trace)\b/i],
  architecture: [/\b(architecture|design|structure|pattern|diagram|flow|system|dependency|coupling)\b/i],
  general_chat: [/\b(hello|hi|hey|explain|tell me|describe|what is|concept)\b/i],
  memory_query: [/\b(remember|recall|history|previous|last time|we discussed|you said)\b/i],
  tool_use: [/\b(jira|confluence|github|browse|screenshot|terminal|git|commit|branch|deploy)\b/i],
  complex_analysis: [/\b(analyze|compare|evaluate|assess|investigate|deep dive|comprehensive)\b/i]
}

const COMPLEXITY_SIGNALS = {
  high: [/\b(and|also|plus|additionally|furthermore|moreover)\b/gi, /\?.*\?/g, /multi/i, /all\b/i],
  medium: [/\b(how|why)\b/i, /\b(between|vs|versus|compare)\b/i],
  low: [/^(what|is|does|can)\b/i, /\?$/]
}

const AGENT_TEAM_BY_INTENT: Record<IntentType, AgentRole[]> = {
  simple_question: ['writer', 'formatter'],
  code_question: ['writer', 'formatter'],
  code_review: ['review', 'security', 'performance', 'writer', 'formatter'],
  implementation: ['implementation', 'security', 'review', 'formatter'],
  debugging: ['implementation', 'performance', 'writer', 'formatter'],
  architecture: ['review', 'performance', 'writer', 'formatter'],
  general_chat: ['writer', 'formatter'],
  memory_query: ['writer', 'formatter'],
  tool_use: ['implementation', 'formatter'],
  complex_analysis: ['review', 'security', 'performance', 'writer', 'formatter']
}

const ASYNC_AGENTS: AgentRole[] = ['feedback', 'knowledge-crystallizer']

// OpenCode-style named agent modes — can be activated via slash commands
// These are registered in the pool but activated on-demand, not via intent matching
const NAMED_AGENT_MODES: AgentRole[] = ['sisyphus', 'hephaestus', 'prometheus', 'atlas']

let agentRegistry: Map<AgentRole, AgentDefinition> = new Map()

export function registerAgent(definition: AgentDefinition): void {
  agentRegistry.set(definition.role, definition)
  console.log(`[Orchestrator] Registered agent: ${definition.role} (${definition.name})`)
}

export function registerAgents(definitions: AgentDefinition[]): void {
  for (const def of definitions) {
    registerAgent(def)
  }
}

export function getRegisteredAgents(): AgentRole[] {
  return Array.from(agentRegistry.keys())
}

export function classifyIntent(query: string): IntentClassificationResult {
  const lower = query.toLowerCase()
  const scores: Array<{ intent: IntentType; score: number; keywords: string[] }> = []

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS) as Array<[IntentType, RegExp[]]>) {
    const matchedKeywords: string[] = []
    let score = 0
    for (const pattern of patterns) {
      const match = lower.match(pattern)
      if (match) {
        score += 0.3
        matchedKeywords.push(match[0])
      }
    }
    if (score > 0) {
      scores.push({ intent, score: Math.min(score, 0.9), keywords: matchedKeywords })
    }
  }

  scores.sort((a, b) => b.score - a.score)

  let complexity = 0.3
  for (const pattern of COMPLEXITY_SIGNALS.high) {
    if (pattern.test(query)) complexity = Math.min(complexity + 0.2, 1.0)
  }
  for (const pattern of COMPLEXITY_SIGNALS.medium) {
    if (pattern.test(query)) complexity = Math.min(complexity + 0.1, 1.0)
  }
  if (query.length > 200) complexity = Math.min(complexity + 0.15, 1.0)
  if (query.split('\n').length > 3) complexity = Math.min(complexity + 0.1, 1.0)

  const primary = scores[0] || { intent: 'general_chat' as IntentType, score: 0.3, keywords: [] }

  return {
    primaryIntent: primary.intent,
    confidence: primary.score,
    complexity,
    keywords: primary.keywords
  }
}

function selectAgentTeam(intent: IntentClassificationResult): AgentRole[] {
  const baseTeam = AGENT_TEAM_BY_INTENT[intent.primaryIntent] || ['writer', 'formatter']

  const team = [...baseTeam]

  for (const asyncRole of ASYNC_AGENTS) {
    if (agentRegistry.has(asyncRole) && !team.includes(asyncRole)) {
      team.push(asyncRole)
    }
  }

  return team.filter(role => agentRegistry.has(role))
}

function buildAgentTasks(
  team: AgentRole[],
  input: AgentInput
): AgentTask[] {
  return team.map(role => {
    const definition = agentRegistry.get(role)!
    return {
      id: randomUUID(),
      agent: definition,
      input,
      status: 'idle' as const
    }
  })
}

const DEFAULT_POOL_CONFIG: PoolConfig = {
  maxConcurrency: 8,
  defaultTimeoutMs: 30000,
  continueOnFailure: true
}

export async function orchestrate(input: OrchestratorInput): Promise<OrchestratorResult> {
  const startTime = Date.now()

  console.log(`[Orchestrator] Processing query: "${input.query.slice(0, 80)}..."`)

  const intent = classifyIntent(input.query)
  console.log(`[Orchestrator] Intent: ${intent.primaryIntent} (confidence: ${intent.confidence.toFixed(2)}, complexity: ${intent.complexity.toFixed(2)})`)

  const team = selectAgentTeam(intent)
  console.log(`[Orchestrator] Team: [${team.join(', ')}] (${team.length} agents)`)

  let sharedContext: SharedAgentContext
  try {
    sharedContext = await buildSharedContext(
      input.projectId,
      input.query,
      input.mode || 'engineering'
    )
  } catch (err) {
    console.error('[Orchestrator] Context building failed:', err)
    sharedContext = {
      coreMemory: '',
      archivalMemories: [],
      recentRecall: [],
      codeChunks: []
    }
  }

  const agentInput: AgentInput = {
    query: input.query,
    projectId: input.projectId,
    conversationId: input.conversationId,
    sharedContext,
    mode: input.mode
  }

  const syncTeam = team.filter(role => {
    const def = agentRegistry.get(role)
    return def && !def.config.async
  })
  const asyncTeam = team.filter(role => {
    const def = agentRegistry.get(role)
    return def && def.config.async
  })

  const syncTasks = buildAgentTasks(syncTeam, agentInput)
  const syncOutputs = await executeAgentPool(syncTasks, DEFAULT_POOL_CONFIG)

  if (asyncTeam.length > 0) {
    const asyncTasks = buildAgentTasks(asyncTeam, agentInput)
    executeAgentPool(asyncTasks, { ...DEFAULT_POOL_CONFIG, continueOnFailure: true })
      .then(outputs => {
        for (const output of outputs) {
          if (output.status === 'completed') {
            console.log(`[Orchestrator] Async agent '${output.role}' completed (${output.durationMs}ms)`)
          }
        }
      })
      .catch(err => console.error('[Orchestrator] Async agents failed:', err))
  }

  const { response, conflicts, estimatedCost } = aggregateResults(syncOutputs, intent)

  const totalDurationMs = Date.now() - startTime
  console.log(`[Orchestrator] Complete in ${totalDurationMs}ms. ${syncOutputs.filter(o => o.status === 'completed').length}/${syncOutputs.length} agents succeeded.`)

  return {
    response,
    agentOutputs: syncOutputs,
    activatedAgents: team,
    totalDurationMs,
    intent,
    aggregation: {
      strategy: syncTeam.length > 1 ? 'parallel_merge' : 'single',
      conflicts,
      estimatedCost
    }
  }
}
