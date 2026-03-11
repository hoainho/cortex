import type { HookDefinition, HookContext, HookResult } from '../types'

export const thinkingStepEmitterHook: HookDefinition = {
  id: 'thinking-step-emitter',
  name: 'Thinking Step Emitter',
  description: 'Tracks thinking step status for UI progress indicators',
  trigger: ['before:chat', 'after:chat'],
  priority: 'normal',
  enabled: true,
  handler(context: HookContext): HookResult {
    const isBeforeChat = !context.response
    const stepName = isBeforeChat ? 'processing' : 'complete'
    const stepStatus = isBeforeChat ? 'running' : 'done'

    return {
      modified: true,
      data: {
        metadata: {
          ...context.metadata,
          thinkingStep: stepName,
          thinkingStatus: stepStatus,
          thinkingTimestamp: Date.now()
        }
      }
    }
  }
}
