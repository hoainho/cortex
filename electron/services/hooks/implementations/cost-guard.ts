import type { HookDefinition, HookContext, HookResult } from '../types'

const DEFAULT_BUDGET_LIMIT = 10.0

export const costGuardHook: HookDefinition = {
  id: 'cost-guard',
  name: 'Cost Guard',
  description: 'Aborts chat if project cost exceeds budget threshold',
  trigger: 'before:chat',
  priority: 'high',
  enabled: true,
  handler(context: HookContext): HookResult {
    const currentCost = (context.metadata?.currentCost as number) ?? 0
    const budgetLimit = (context.metadata?.budgetLimit as number) ?? DEFAULT_BUDGET_LIMIT

    if (currentCost >= budgetLimit) {
      return {
        abort: true,
        message: `Cost limit exceeded: $${currentCost.toFixed(2)} / $${budgetLimit.toFixed(2)}`
      }
    }

    if (currentCost >= budgetLimit * 0.9) {
      return {
        modified: true,
        data: {
          metadata: {
            ...context.metadata,
            costWarning: true,
            costUsagePercent: Math.round((currentCost / budgetLimit) * 100)
          }
        },
        message: `Cost warning: $${currentCost.toFixed(2)} / $${budgetLimit.toFixed(2)} (${Math.round((currentCost / budgetLimit) * 100)}%)`
      }
    }

    return {}
  }
}
