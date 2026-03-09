/**
 * Agent Pool — Parallel execution engine for multi-agent system
 *
 * Runs multiple agents concurrently via Promise.allSettled.
 * Each agent makes a non-streaming LLM call to the proxy.
 */

import type {
  AgentTask, AgentOutput, AgentInput, PoolConfig, ModelTier, AgentStatus
} from './types'
import { getProxyUrl, getProxyKey } from '../settings-service'

// =====================
// Model Tier Mapping
// =====================

const MODEL_BY_TIER: Record<ModelTier, string> = {
  fast: 'gemini-2.5-flash-lite',
  balanced: 'gemini-2.5-flash',
  premium: 'gpt-5.1'
}

function resolveModel(tier: ModelTier, override?: string): string {
  return override || MODEL_BY_TIER[tier]
}

// =====================
// Message Building
// =====================

function buildAgentMessages(task: AgentTask): Array<{ role: string; content: string }> {
  const { agent, input } = task
  const ctx = input.sharedContext

  let systemContent = agent.systemPrompt

  // Append shared context
  if (ctx.coreMemory) {
    systemContent += '\n\n=== MEMORY ===\n' + ctx.coreMemory
  }

  if (ctx.archivalMemories.length > 0) {
    const archival = ctx.archivalMemories
      .slice(0, 5)
      .map((m, i) => `[${i + 1}] (score: ${m.score.toFixed(2)}) ${m.content}`)
      .join('\n')
    systemContent += '\n\n=== ARCHIVAL MEMORIES ===\n' + archival
  }

  if (ctx.codeChunks.length > 0) {
    const chunks = ctx.codeChunks
      .slice(0, 10)
      .map((c, i) => {
        const header = `--- [${i + 1}] ${c.relativePath} :: ${c.name || ''} (${c.chunkType}, ${c.language}) L${c.lineStart}-${c.lineEnd}`
        return `${header}\n${c.content}`
      })
      .join('\n\n')
    systemContent += '\n\n=== CODE CONTEXT ===\n' + chunks
  }

  if (ctx.directoryTree) {
    systemContent += '\n\n=== DIRECTORY STRUCTURE ===\n' + ctx.directoryTree.slice(0, 2000)
  }

  let userContent = input.query
  if (input.instructions) {
    userContent += '\n\n[Orchestrator Instructions]: ' + input.instructions
  }

  return [
    { role: 'system', content: systemContent },
    { role: 'user', content: userContent }
  ]
}

// =====================
// Single Agent Execution
// =====================

async function executeAgent(task: AgentTask, defaultTimeoutMs: number): Promise<AgentOutput> {
  const startTime = Date.now()
  task.status = 'running'
  task.startedAt = startTime

  const model = resolveModel(task.agent.config.modelTier, task.agent.config.modelOverride)
  const messages = buildAgentMessages(task)
  const timeoutMs = task.agent.config.timeoutMs || defaultTimeoutMs

  console.log(`[AgentPool] Starting agent '${task.agent.role}' (model: ${model}, timeout: ${timeoutMs}ms)`)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${getProxyUrl()}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getProxyKey()}`
      },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        temperature: task.agent.config.temperature,
        max_tokens: task.agent.config.maxTokens
      })
    })
  } catch (err) {
    clearTimeout(timeoutId)
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error(`Agent '${task.agent.role}' timed out after ${timeoutMs}ms`)
    }
    throw err
  }
  clearTimeout(timeoutId)

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Agent '${task.agent.role}' LLM error ${response.status}: ${errorText.slice(0, 200)}`)
  }

  const data = await response.json() as {
    choices: Array<{ message: { content: string } }>
    usage?: { prompt_tokens: number; completion_tokens: number }
  }

  const content = data.choices?.[0]?.message?.content || ''
  const usage = data.usage

  const durationMs = Date.now() - startTime
  task.status = 'completed'
  task.completedAt = Date.now()

  console.log(`[AgentPool] Agent '${task.agent.role}' completed in ${durationMs}ms (${content.length} chars)`)

  return {
    role: task.agent.role,
    status: 'completed',
    content,
    confidence: 0.8,
    durationMs,
    metadata: {
      model,
      tokensUsed: usage
        ? { input: usage.prompt_tokens, output: usage.completion_tokens }
        : undefined,
      skillsUsed: task.agent.skills
    }
  }
}

// =====================
// Pool Execution
// =====================

export async function executeAgentPool(
  tasks: AgentTask[],
  config: PoolConfig
): Promise<AgentOutput[]> {
  if (tasks.length === 0) return []

  console.log(`[AgentPool] Executing ${tasks.length} agents (maxConcurrency: ${config.maxConcurrency})`)
  const startTime = Date.now()

  const concurrency = Math.max(1, config.maxConcurrency)
  const settled: PromiseSettledResult<AgentOutput>[] = []

  for (let i = 0; i < tasks.length; i += concurrency) {
    const batch = tasks.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(task => executeAgent(task, config.defaultTimeoutMs))
    )
    settled.push(...batchResults)
  }

  const outputs: AgentOutput[] = settled.map((result, i) => {
    if (result.status === 'fulfilled') {
      return result.value
    }

    // Task failed
    const task = tasks[i]
    const errorMsg = result.reason instanceof Error ? result.reason.message : String(result.reason)
    console.error(`[AgentPool] Agent '${task.agent.role}' failed: ${errorMsg}`)

    task.status = 'error'
    task.completedAt = Date.now()

    return {
      role: task.agent.role,
      status: 'error' as AgentStatus,
      content: `Agent error: ${errorMsg}`,
      confidence: 0,
      durationMs: Date.now() - (task.startedAt || Date.now()),
      metadata: {
        errors: [errorMsg]
      }
    }
  })

  const succeeded = outputs.filter(o => o.status === 'completed').length
  const totalMs = Date.now() - startTime
  console.log(`[AgentPool] Pool complete: ${succeeded}/${tasks.length} succeeded in ${totalMs}ms`)

  return outputs
}
