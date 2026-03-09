/**
 * Result Aggregator — Merges multi-agent outputs into a single coherent response
 *
 * Strategies vary by intent type:
 * - Implementation/debugging: primary agent + supporting sections
 * - Code review: labeled sections from each specialist
 * - Simple questions: writer primary, formatter applied
 */

import type {
  AgentOutput, IntentClassificationResult, AgentConflict, AgentRole
} from './types'

// =====================
// Role Display Names
// =====================

const ROLE_LABELS: Record<AgentRole, string> = {
  orchestrator: 'Orchestrator',
  performance: 'Performance Analysis',
  security: 'Security Audit',
  review: 'Code Review',
  writer: 'Response',
  formatter: 'Formatting',
  feedback: 'Feedback',
  implementation: 'Implementation',
  'knowledge-crystallizer': 'Knowledge',
  sisyphus: 'Sisyphus (Ultraworker)',
  hephaestus: 'Hephaestus (Deep Agent)',
  prometheus: 'Prometheus (Strategic Planner)',
  atlas: 'Atlas (Heavy Lifter)'
}

// =====================
// Aggregation
// =====================

export function aggregateResults(
  outputs: AgentOutput[],
  intent: IntentClassificationResult
): { response: string; conflicts: AgentConflict[]; estimatedCost: number } {
  const completed = outputs.filter(o => o.status === 'completed')

  if (completed.length === 0) {
    console.log('[Aggregator] No agents produced results')
    return {
      response: 'No agents were able to produce results. Please try again.',
      conflicts: [],
      estimatedCost: estimateCost(outputs)
    }
  }

  if (completed.length === 1) {
    console.log(`[Aggregator] Single agent result: ${completed[0].role}`)
    return {
      response: completed[0].content,
      conflicts: [],
      estimatedCost: estimateCost(outputs)
    }
  }

  const conflicts = detectConflicts(completed)
  const cost = estimateCost(outputs)

  let response: string

  switch (intent.primaryIntent) {
    case 'implementation':
    case 'debugging':
    case 'tool_use':
      response = mergeImplementation(completed)
      break
    case 'code_review':
    case 'complex_analysis':
      response = mergeCodeReview(completed)
      break
    case 'simple_question':
    case 'general_chat':
    case 'memory_query':
      response = mergeSimple(completed)
      break
    case 'architecture':
      response = mergeArchitecture(completed)
      break
    default:
      response = mergeDefault(completed)
  }

  if (conflicts.length > 0) {
    response += '\n\n---\n\n> **Agent Conflicts Detected:**\n'
    for (const conflict of conflicts) {
      response += `> - ${conflict.agents[0]} vs ${conflict.agents[1]}: ${conflict.description}\n>   Resolution: ${conflict.resolution}\n`
    }
  }

  console.log(`[Aggregator] Merged ${completed.length} outputs (strategy: ${intent.primaryIntent}, conflicts: ${conflicts.length})`)

  return { response, conflicts, estimatedCost: cost }
}

// =====================
// Merge Strategies
// =====================

function mergeImplementation(outputs: AgentOutput[]): string {
  const impl = outputs.find(o => o.role === 'implementation')
  const others = outputs.filter(o => o.role !== 'implementation' && o.role !== 'formatter')

  let result = impl?.content || ''

  for (const output of others) {
    if (output.content.trim()) {
      result += `\n\n---\n\n## ${ROLE_LABELS[output.role] || output.role}\n\n${output.content}`
    }
  }

  return result
}

function mergeCodeReview(outputs: AgentOutput[]): string {
  const sections: string[] = []
  const order: AgentRole[] = ['performance', 'security', 'review', 'writer']

  for (const role of order) {
    const output = outputs.find(o => o.role === role)
    if (output?.content.trim()) {
      sections.push(`## ${ROLE_LABELS[role]}\n\n${output.content}`)
    }
  }

  // Add any remaining agents not in the predefined order
  for (const output of outputs) {
    if (!order.includes(output.role) && output.role !== 'formatter' && output.content.trim()) {
      sections.push(`## ${ROLE_LABELS[output.role] || output.role}\n\n${output.content}`)
    }
  }

  return sections.join('\n\n---\n\n')
}

function mergeSimple(outputs: AgentOutput[]): string {
  const writer = outputs.find(o => o.role === 'writer')
  if (writer) return writer.content

  // Fallback: highest confidence
  const sorted = [...outputs].sort((a, b) => b.confidence - a.confidence)
  return sorted[0].content
}

function mergeArchitecture(outputs: AgentOutput[]): string {
  const sections: string[] = []
  const order: AgentRole[] = ['review', 'performance', 'writer']

  for (const role of order) {
    const output = outputs.find(o => o.role === role)
    if (output?.content.trim()) {
      sections.push(`## ${ROLE_LABELS[role]}\n\n${output.content}`)
    }
  }

  for (const output of outputs) {
    if (!order.includes(output.role) && output.role !== 'formatter' && output.content.trim()) {
      sections.push(`## ${ROLE_LABELS[output.role] || output.role}\n\n${output.content}`)
    }
  }

  return sections.join('\n\n---\n\n')
}

function mergeDefault(outputs: AgentOutput[]): string {
  const sorted = [...outputs]
    .filter(o => o.role !== 'formatter')
    .sort((a, b) => b.confidence - a.confidence)

  return sorted
    .map(o => `## ${ROLE_LABELS[o.role] || o.role}\n\n${o.content}`)
    .join('\n\n---\n\n')
}

// =====================
// Conflict Detection
// =====================

const SECURITY_RISK_KEYWORDS = ['avoid', 'vulnerable', 'risk', 'insecure', 'unsafe', 'injection', 'exploit', 'danger']

export function detectConflicts(outputs: AgentOutput[]): AgentConflict[] {
  const conflicts: AgentConflict[] = []
  const completed = outputs.filter(o => o.status === 'completed')

  const security = completed.find(o => o.role === 'security')
  const implementation = completed.find(o => o.role === 'implementation')

  if (security && implementation) {
    const secContent = security.content.toLowerCase()
    const implContent = implementation.content.toLowerCase()

    const securityRisks = SECURITY_RISK_KEYWORDS.filter(kw => secContent.includes(kw))
    const implMentionsRisks = SECURITY_RISK_KEYWORDS.some(kw => implContent.includes(kw))

    if (securityRisks.length > 0 && !implMentionsRisks) {
      conflicts.push({
        agents: ['security', 'implementation'],
        description: `Security agent flagged risks (${securityRisks.join(', ')}) not addressed in implementation`,
        resolution: 'Review security concerns before merging implementation. Security analysis takes precedence for risk items.'
      })
    }
  }

  const performance = completed.find(o => o.role === 'performance')
  if (performance && implementation) {
    const perfContent = performance.content.toLowerCase()
    const hasPerformanceConcerns = ['bottleneck', 'slow', 'n+1', 'memory leak', 'o(n²)', 'o(n^2)'].some(kw => perfContent.includes(kw))
    const implAddressesPerf = ['optimize', 'cache', 'batch', 'index', 'memo'].some(kw => implementation.content.toLowerCase().includes(kw))

    if (hasPerformanceConcerns && !implAddressesPerf) {
      conflicts.push({
        agents: ['performance', 'implementation'],
        description: 'Performance agent identified bottlenecks not addressed in implementation',
        resolution: 'Consider applying performance suggestions to the implementation.'
      })
    }
  }

  return conflicts
}

// =====================
// Cost Estimation
// =====================

const INPUT_TOKEN_COST = 0.00001   // $0.01 per 1K input tokens
const OUTPUT_TOKEN_COST = 0.00003  // $0.03 per 1K output tokens

export function estimateCost(outputs: AgentOutput[]): number {
  let totalCost = 0

  for (const output of outputs) {
    const usage = output.metadata.tokensUsed
    if (usage) {
      totalCost += usage.input * INPUT_TOKEN_COST + usage.output * OUTPUT_TOKEN_COST
    }
  }

  return Math.round(totalCost * 1000000) / 1000000 // Round to 6 decimal places
}
