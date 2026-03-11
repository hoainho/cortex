import type { HookDefinition, HookContext, HookResult } from '../types'

const DEFAULT_FALLBACK_CHAIN = [
  'claude-sonnet-4-20250514',
  'gpt-4o',
  'gemini-2.5-flash'
]

export const modelFallbackHook: HookDefinition = {
  id: 'model-fallback',
  name: 'Model Fallback',
  description: 'Suggests next model in fallback chain on error',
  trigger: 'on:error',
  priority: 'high',
  enabled: true,
  handler(context: HookContext): HookResult {
    if (!context.error || !context.model) return {}
    const chain = (context.metadata?.fallbackChain as string[]) || DEFAULT_FALLBACK_CHAIN
    const currentIndex = chain.indexOf(context.model)
    const nextModel = currentIndex >= 0 && currentIndex < chain.length - 1
      ? chain[currentIndex + 1]
      : chain.find(m => m !== context.model)

    if (nextModel) {
      return {
        modified: true,
        data: {
          model: nextModel,
          metadata: {
            ...context.metadata,
            fallbackFrom: context.model,
            fallbackTo: nextModel,
            fallbackReason: context.error.message
          }
        },
        message: `Model fallback: ${context.model} → ${nextModel}`
      }
    }
    return { message: 'No fallback model available' }
  }
}
