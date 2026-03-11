import type { HookDefinition, HookContext, HookResult } from '../types'

const DEFAULT_CONTEXT_LIMIT = 128000
const WARNING_THRESHOLD = 0.8

export const contextWindowMonitorHook: HookDefinition = {
  id: 'context-window-monitor',
  name: 'Context Window Monitor',
  description: 'Warns when token usage approaches context window limit',
  trigger: 'before:chat',
  priority: 'high',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.tokens) return {}
    const totalTokens = context.tokens.input + context.tokens.output
    const limit = (context.metadata?.contextLimit as number) || DEFAULT_CONTEXT_LIMIT
    const usage = totalTokens / limit

    if (usage >= WARNING_THRESHOLD) {
      return {
        modified: true,
        data: {
          metadata: {
            ...context.metadata,
            contextUsage: Math.round(usage * 100),
            contextWarning: true,
            contextLimit: limit
          }
        },
        message: `Context window at ${Math.round(usage * 100)}% capacity (${totalTokens}/${limit} tokens)`
      }
    }
    return {}
  }
}
