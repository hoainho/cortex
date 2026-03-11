import type { HookDefinition, HookContext, HookResult } from '../types'

const RATE_LIMIT_PATTERNS = [/rate.?limit/i, /429/i, /too many requests/i, /quota/i]
const TIMEOUT_PATTERNS = [/timeout/i, /ETIMEDOUT/i, /ECONNRESET/i, /socket hang up/i]
const AUTH_PATTERNS = [/401/i, /403/i, /unauthorized/i, /forbidden/i, /invalid.*key/i, /auth.*fail/i]

function classifyError(error: Error): { type: 'rate_limit' | 'timeout' | 'auth' | 'unknown'; suggestion: string } {
  const msg = error.message || ''
  if (RATE_LIMIT_PATTERNS.some(p => p.test(msg))) {
    return { type: 'rate_limit', suggestion: 'Rate limited — retry with exponential backoff or switch model' }
  }
  if (TIMEOUT_PATTERNS.some(p => p.test(msg))) {
    return { type: 'timeout', suggestion: 'Request timed out — retry or reduce context size' }
  }
  if (AUTH_PATTERNS.some(p => p.test(msg))) {
    return { type: 'auth', suggestion: 'Authentication failed — check API key or switch model' }
  }
  return { type: 'unknown', suggestion: 'Unknown error — consider retrying with a different model' }
}

export const errorRecoveryHook: HookDefinition = {
  id: 'error-recovery',
  name: 'Error Recovery',
  description: 'Detects common LLM errors and returns recovery suggestions',
  trigger: 'on:error',
  priority: 'critical',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.error) return {}
    const classification = classifyError(context.error)
    return {
      modified: true,
      data: {
        metadata: {
          ...context.metadata,
          errorType: classification.type,
          recoverySuggestion: classification.suggestion
        }
      },
      message: classification.suggestion
    }
  }
}
