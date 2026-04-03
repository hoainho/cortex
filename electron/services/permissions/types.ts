export type PermissionAction = 'allow' | 'ask' | 'deny'
export type PermissionMode = 'default' | 'acceptEdits' | 'plan' | 'auto' | 'dontAsk'
export type PermissionScope = 'managed' | 'project' | 'user'

export interface PermissionRule {
  tool: string
  specifier?: string
  action: PermissionAction
  scope: PermissionScope
}

export interface PermissionConfig {
  allow: string[]
  ask: string[]
  deny: string[]
  defaultMode: PermissionMode
}

export interface PermissionDecision {
  action: PermissionAction
  rule?: string
  reason: string
}
