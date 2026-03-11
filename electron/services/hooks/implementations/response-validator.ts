import type { HookDefinition, HookContext, HookResult } from '../types'

const REFUSAL_PATTERNS = [
  /I cannot (help|assist|do) (with )?(that|this)/i,
  /I'm (not able|unable) to/i,
  /as an AI/i,
  /I don't have (the ability|access)/i
]

const REPETITION_THRESHOLD = 5

function hasExcessiveRepetition(text: string): boolean {
  const lines = text.split('\n').filter(l => l.trim())
  if (lines.length < REPETITION_THRESHOLD) return false
  const seen = new Map<string, number>()
  for (const line of lines) {
    const normalized = line.trim().toLowerCase()
    if (normalized.length < 10) continue
    seen.set(normalized, (seen.get(normalized) || 0) + 1)
    if ((seen.get(normalized) || 0) >= REPETITION_THRESHOLD) return true
  }
  return false
}

export const responseValidatorHook: HookDefinition = {
  id: 'response-validator',
  name: 'Response Validator',
  description: 'Validates LLM response quality (empty, truncated, refusal, repetition)',
  trigger: 'after:chat',
  priority: 'high',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.response) {
      return {
        modified: true,
        data: {
          metadata: { ...context.metadata, responseIssue: 'empty' }
        },
        message: 'Response is empty'
      }
    }

    if (REFUSAL_PATTERNS.some(p => p.test(context.response || ''))) {
      return {
        modified: true,
        data: {
          metadata: { ...context.metadata, responseIssue: 'refusal' }
        },
        message: 'Response contains refusal pattern'
      }
    }

    if (hasExcessiveRepetition(context.response)) {
      return {
        modified: true,
        data: {
          metadata: { ...context.metadata, responseIssue: 'repetition' }
        },
        message: 'Response contains excessive repetition'
      }
    }

    return {}
  }
}
