import type { HookDefinition, HookContext, HookResult } from '../types'

export const auditLoggerHook: HookDefinition = {
  id: 'audit-logger',
  name: 'Audit Logger',
  description: 'Logs chat events and errors to audit trail',
  trigger: ['after:chat', 'on:error'],
  priority: 'low',
  enabled: true,
  handler(context: HookContext): HookResult {
    const isError = !!context.error
    const eventType = isError ? 'chat.error' : 'chat.complete'

    return {
      modified: true,
      data: {
        metadata: {
          ...context.metadata,
          auditEvent: eventType,
          auditTimestamp: Date.now(),
          auditModel: context.model,
          auditTokens: context.tokens,
          auditProjectId: context.projectId
        }
      }
    }
  }
}
