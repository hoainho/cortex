import type { HookTrigger, HookContext, HookResult } from './types'
import { getHooksByTrigger, updateHookStats } from './hook-registry'
import { executeHttpHook } from './http-hook-executor'

export interface HookPipelineResult {
  context: HookContext
  aborted: boolean
  abortMessage?: string
}

function matchesHookMatcher(matcher: string | undefined, context: HookContext): boolean {
  if (!matcher) return true
  const target = context.toolName ?? context.agentName ?? context.filePath ?? ''
  try {
    return new RegExp(matcher, 'i').test(target)
  } catch {
    return target.includes(matcher)
  }
}

async function dispatchHook(hook: ReturnType<typeof getHooksByTrigger>[number], context: HookContext): Promise<HookResult> {
  if ('type' in hook && hook.type === 'http') {
    return executeHttpHook(hook, context)
  }
  if ('handler' in hook) {
    return hook.handler(context)
  }
  return { modified: false }
}

export async function runHooks(trigger: HookTrigger, context: HookContext): Promise<HookPipelineResult> {
  const hooks = getHooksByTrigger(trigger)
  if (hooks.length === 0) return { context, aborted: false }

  let currentContext = { ...context }

  for (const hook of hooks) {
    if ('matcher' in hook && !matchesHookMatcher(hook.matcher, currentContext)) continue

    const start = Date.now()
    try {
      const result = await dispatchHook(hook, currentContext)
      const latencyMs = Date.now() - start
      updateHookStats(hook.id, true, latencyMs)

      if (result.abort) {
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
