export type MarkdownAgentModel = 'fast' | 'balanced' | 'premium' | 'inherit'
export type MarkdownAgentMemory = 'user' | 'project' | 'local' | 'none'
export type MarkdownAgentIsolation = 'none' | 'worktree'
export type MarkdownAgentPermissionMode = 'default' | 'acceptEdits' | 'plan' | 'dontAsk'
export type MarkdownAgentColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'pink' | 'cyan'
export type MarkdownAgentScope = 'project' | 'user'

export interface MarkdownAgentDefinition {
  name: string
  description: string
  systemPrompt: string
  model: MarkdownAgentModel
  tools?: string[]
  disallowedTools?: string[]
  memory: MarkdownAgentMemory
  background: boolean
  maxTurns: number
  skills: string[]
  permissionMode: MarkdownAgentPermissionMode
  isolation: MarkdownAgentIsolation
  color?: MarkdownAgentColor
  filePath: string
  scope: MarkdownAgentScope
}
