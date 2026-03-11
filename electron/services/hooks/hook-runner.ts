import type { HookTrigger, HookContext } from './types'
import { getHooksByTrigger, updateHookStats } from './hook-registry'

export interface HookPipelineResult {
  context: HookContext
  aborted: boolean
  abortMessage?: string
}

export async function runHooks(trigger: HookTrigger, context: HookContext): Promise<HookPipelineResult> {
  const hooks = getHooksByTrigger(trigger)
  if (hooks.length === 0) return { context, aborted: false }

  let currentContext = { ...context }

  for (const hook of hooks) {
    const start = Date.now()
    try {
      const result = await hook.handler(currentContext)
      const latencyMs = Date.now() - start
      updateHookStats(hook.id, true, latencyMs)

      console.log(`[Hook] ${hook.name} (${trigger}): ok (${latencyMs}ms)`)

      if (result.abort) {
        if (result.message) {
          console.log(`[Hook] ${hook.name} aborted pipeline: ${result.message}`)
        }
        if (result.modified && result.data) {
          currentContext = { ...currentContext, ...result.data }
        }
        return { context: currentContext, aborted: true, abortMessage: result.message }
      }

      if (result.modified && result.data) {
        currentContext = { ...currentContext, ...result.data }
      }
    } catch (err) {
      const latencyMs = Date.now() - start
      updateHookStats(hook.id, false, latencyMs)
      console.error(`[Hook] ${hook.name} (${trigger}): error (${latencyMs}ms)`, err)
    }
  }

  return { context: currentContext, aborted: false }
}
