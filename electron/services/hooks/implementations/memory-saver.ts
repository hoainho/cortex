import type { HookDefinition, HookContext, HookResult } from '../types'

const MIN_RESPONSE_LENGTH = 100

export const memorySaverHook: HookDefinition = {
  id: 'memory-saver',
  name: 'Memory Saver',
  description: 'Flags significant interactions for memory persistence',
  trigger: 'after:chat',
  priority: 'low',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.response || !context.query) return {}
    if (context.response.length < MIN_RESPONSE_LENGTH) return {}

    return {
      modified: true,
      data: {
        metadata: {
          ...context.metadata,
          shouldSaveToMemory: true,
          memoryType: 'recall',
          interactionLength: context.query.length + context.response.length
        }
      }
    }
  }
}
