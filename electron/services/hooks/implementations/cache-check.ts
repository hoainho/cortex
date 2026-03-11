import type { HookDefinition, HookContext, HookResult } from '../types'

export const cacheCheckHook: HookDefinition = {
  id: 'cache-check',
  name: 'Cache Check',
  description: 'Checks for cached response before sending to LLM',
  trigger: 'before:chat',
  priority: 'critical',
  enabled: true,
  handler(context: HookContext): HookResult {
    const cachedResponse = context.metadata?.cachedResponse as string | undefined
    if (cachedResponse) {
      return {
        abort: true,
        modified: true,
        data: {
          response: cachedResponse,
          metadata: {
            ...context.metadata,
            cacheHit: true
          }
        },
        message: 'Cache hit — returning cached response'
      }
    }
    return {}
  }
}
