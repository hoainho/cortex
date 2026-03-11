import type { AgentRole, AgentCapability, AgentCapabilityMap, DelegationRequest, DelegationResult } from './types'

const capabilities: AgentCapabilityMap = {}
const delegationHistory: DelegationResult[] = []

const DEFAULT_CAPABILITIES: Record<string, AgentCapability> = {
  sisyphus: {
    role: 'sisyphus',
    toolWhitelist: ['read', 'write', 'edit', 'grep', 'glob', 'bash', 'lsp_diagnostics'],
    canDelegate: true,
    delegateTo: ['oracle', 'explore', 'librarian', 'hephaestus', 'atlas', 'implementation'],
    maxConcurrentDelegations: 5,
    readOnly: false,
    backgroundCapable: false
  },
  oracle: {
    role: 'oracle',
    toolWhitelist: ['read', 'grep', 'glob', 'lsp_diagnostics'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: true
  },
  explore: {
    role: 'explore',
    toolWhitelist: ['read', 'grep', 'glob', 'ast_grep_search'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: true
  },
  librarian: {
    role: 'librarian',
    toolWhitelist: ['web_search', 'context7', 'grep_app'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: true
  },
  hephaestus: {
    role: 'hephaestus',
    toolWhitelist: ['read', 'write', 'edit', 'grep', 'glob', 'bash', 'lsp_diagnostics'],
    canDelegate: true,
    delegateTo: ['explore', 'librarian'],
    maxConcurrentDelegations: 3,
    readOnly: false,
    backgroundCapable: false
  },
  prometheus: {
    role: 'prometheus',
    toolWhitelist: ['read', 'grep', 'glob'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: false
  },
  atlas: {
    role: 'atlas',
    toolWhitelist: ['read', 'write', 'edit', 'grep', 'glob', 'bash', 'lsp_diagnostics', 'ast_grep_replace'],
    canDelegate: true,
    delegateTo: ['explore'],
    maxConcurrentDelegations: 2,
    readOnly: false,
    backgroundCapable: false
  },
  implementation: {
    role: 'implementation',
    toolWhitelist: ['read', 'write', 'edit', 'bash', 'lsp_diagnostics'],
    canDelegate: false,
    readOnly: false,
    backgroundCapable: false
  },
  review: {
    role: 'review',
    toolWhitelist: ['read', 'grep', 'glob'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: false
  },
  security: {
    role: 'security',
    toolWhitelist: ['read', 'grep', 'glob'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: false
  },
  performance: {
    role: 'performance',
    toolWhitelist: ['read', 'grep', 'glob', 'bash'],
    canDelegate: false,
    readOnly: true,
    backgroundCapable: false
  },
  writer: {
    role: 'writer',
    canDelegate: false,
    readOnly: false,
    backgroundCapable: false
  },
  formatter: {
    role: 'formatter',
    canDelegate: false,
    readOnly: false,
    backgroundCapable: false
  },
  feedback: {
    role: 'feedback',
    canDelegate: false,
    readOnly: true,
    backgroundCapable: true
  },
  'knowledge-crystallizer': {
    role: 'knowledge-crystallizer',
    canDelegate: false,
    readOnly: false,
    backgroundCapable: true
  }
}

export function registerCapability(capability: AgentCapability): void {
  capabilities[capability.role] = capability
}

export function registerDefaultCapabilities(): void {
  for (const [role, cap] of Object.entries(DEFAULT_CAPABILITIES)) {
    capabilities[role] = cap
  }
}

export function getCapability(role: AgentRole): AgentCapability | undefined {
  return capabilities[role]
}

export function getAllCapabilities(): AgentCapabilityMap {
  return { ...capabilities }
}

export function canDelegate(from: AgentRole, to: AgentRole): boolean {
  const cap = capabilities[from]
  if (!cap?.canDelegate) return false
  if (!cap.delegateTo) return false
  return cap.delegateTo.includes(to)
}

export function isReadOnly(role: AgentRole): boolean {
  return capabilities[role]?.readOnly ?? false
}

export function isBackgroundCapable(role: AgentRole): boolean {
  return capabilities[role]?.backgroundCapable ?? false
}

export function getToolWhitelist(role: AgentRole): string[] | undefined {
  return capabilities[role]?.toolWhitelist
}

export function getActiveDelegationCount(fromAgent: AgentRole): number {
  return delegationHistory.filter(
    d => d.fromAgent === fromAgent && d.status === 'running'
  ).length
}

export function canAcceptDelegation(from: AgentRole, to: AgentRole): boolean {
  if (!canDelegate(from, to)) return false
  const cap = capabilities[from]
  if (cap?.maxConcurrentDelegations !== undefined) {
    return getActiveDelegationCount(from) < cap.maxConcurrentDelegations
  }
  return true
}

export function recordDelegation(result: DelegationResult): void {
  delegationHistory.push(result)
}

export function getDelegationHistory(fromAgent?: AgentRole): DelegationResult[] {
  if (fromAgent) {
    return delegationHistory.filter(d => d.fromAgent === fromAgent)
  }
  return [...delegationHistory]
}

export function createDelegationRequest(
  fromAgent: AgentRole,
  toAgent: AgentRole,
  prompt: string,
  context?: string,
  priority: number = 5
): DelegationRequest | null {
  if (!canAcceptDelegation(fromAgent, toAgent)) return null
  return {
    id: `del_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    fromAgent,
    toAgent,
    prompt,
    context,
    priority,
    createdAt: Date.now()
  }
}

export function resetCapabilities(): void {
  for (const key of Object.keys(capabilities)) {
    delete capabilities[key]
  }
  delegationHistory.length = 0
}
