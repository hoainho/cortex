import { describe, it, expect, beforeEach } from 'vitest'
import {
  registerCapability,
  registerDefaultCapabilities,
  getCapability,
  getAllCapabilities,
  canDelegate,
  isReadOnly,
  isBackgroundCapable,
  getToolWhitelist,
  canAcceptDelegation,
  recordDelegation,
  getDelegationHistory,
  createDelegationRequest,
  getActiveDelegationCount,
  resetCapabilities
} from '../../electron/services/agents/agent-capabilities'
import {
  classifyIntent
} from '../../electron/services/agents/agent-orchestrator'
import { oracleAgent } from '../../electron/services/agents/specialized/oracle-agent'
import { exploreAgent } from '../../electron/services/agents/specialized/explore-agent'
import { librarianAgent } from '../../electron/services/agents/specialized/librarian-agent'
import type { AgentCapability } from '../../electron/services/agents/types'

beforeEach(() => {
  resetCapabilities()
})

describe('agent capabilities', () => {
  describe('registerDefaultCapabilities', () => {
    it('registers capabilities for all known agents', () => {
      registerDefaultCapabilities()
      const all = getAllCapabilities()
      const roles = Object.keys(all)
      expect(roles).toContain('sisyphus')
      expect(roles).toContain('oracle')
      expect(roles).toContain('explore')
      expect(roles).toContain('librarian')
      expect(roles).toContain('hephaestus')
      expect(roles).toContain('implementation')
      expect(roles.length).toBeGreaterThanOrEqual(15)
    })
  })

  describe('getCapability', () => {
    it('returns undefined for unregistered role', () => {
      expect(getCapability('oracle')).toBeUndefined()
    })

    it('returns capability after registration', () => {
      registerDefaultCapabilities()
      const cap = getCapability('oracle')
      expect(cap).toBeDefined()
      expect(cap?.role).toBe('oracle')
    })
  })

  describe('registerCapability', () => {
    it('registers a custom capability', () => {
      const custom: AgentCapability = {
        role: 'writer',
        canDelegate: true,
        delegateTo: ['explore'],
        readOnly: false,
        backgroundCapable: false
      }
      registerCapability(custom)
      expect(getCapability('writer')?.canDelegate).toBe(true)
    })

    it('overrides existing capability', () => {
      registerDefaultCapabilities()
      expect(getCapability('oracle')?.readOnly).toBe(true)
      registerCapability({ role: 'oracle', canDelegate: false, readOnly: false, backgroundCapable: false })
      expect(getCapability('oracle')?.readOnly).toBe(false)
    })
  })

  describe('oracle capabilities', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('is read-only', () => {
      expect(isReadOnly('oracle')).toBe(true)
    })

    it('cannot delegate', () => {
      expect(canDelegate('oracle', 'explore')).toBe(false)
    })

    it('is background-capable', () => {
      expect(isBackgroundCapable('oracle')).toBe(true)
    })

    it('has read-only tool whitelist', () => {
      const tools = getToolWhitelist('oracle')
      expect(tools).toContain('read')
      expect(tools).toContain('grep')
      expect(tools).not.toContain('write')
      expect(tools).not.toContain('edit')
    })
  })

  describe('explore capabilities', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('is read-only', () => {
      expect(isReadOnly('explore')).toBe(true)
    })

    it('is background-capable', () => {
      expect(isBackgroundCapable('explore')).toBe(true)
    })

    it('has search-focused tools', () => {
      const tools = getToolWhitelist('explore')
      expect(tools).toContain('grep')
      expect(tools).toContain('glob')
      expect(tools).toContain('ast_grep_search')
    })
  })

  describe('librarian capabilities', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('is read-only', () => {
      expect(isReadOnly('librarian')).toBe(true)
    })

    it('is background-capable', () => {
      expect(isBackgroundCapable('librarian')).toBe(true)
    })

    it('has external search tools', () => {
      const tools = getToolWhitelist('librarian')
      expect(tools).toContain('web_search')
      expect(tools).toContain('context7')
    })
  })

  describe('sisyphus capabilities', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('can delegate to oracle, explore, librarian', () => {
      expect(canDelegate('sisyphus', 'oracle')).toBe(true)
      expect(canDelegate('sisyphus', 'explore')).toBe(true)
      expect(canDelegate('sisyphus', 'librarian')).toBe(true)
    })

    it('can delegate to hephaestus and atlas', () => {
      expect(canDelegate('sisyphus', 'hephaestus')).toBe(true)
      expect(canDelegate('sisyphus', 'atlas')).toBe(true)
    })

    it('cannot delegate to writer', () => {
      expect(canDelegate('sisyphus', 'writer')).toBe(false)
    })

    it('has max 5 concurrent delegations', () => {
      expect(getCapability('sisyphus')?.maxConcurrentDelegations).toBe(5)
    })

    it('is not read-only', () => {
      expect(isReadOnly('sisyphus')).toBe(false)
    })

    it('has full tool access', () => {
      const tools = getToolWhitelist('sisyphus')
      expect(tools).toContain('read')
      expect(tools).toContain('write')
      expect(tools).toContain('edit')
      expect(tools).toContain('bash')
    })
  })

  describe('canDelegate', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('returns false for agents that cannot delegate', () => {
      expect(canDelegate('review', 'explore')).toBe(false)
      expect(canDelegate('security', 'explore')).toBe(false)
    })

    it('returns false for invalid delegation targets', () => {
      expect(canDelegate('sisyphus', 'feedback')).toBe(false)
    })

    it('returns true for valid delegation chains', () => {
      expect(canDelegate('hephaestus', 'explore')).toBe(true)
      expect(canDelegate('hephaestus', 'librarian')).toBe(true)
    })

    it('atlas can delegate to explore', () => {
      expect(canDelegate('atlas', 'explore')).toBe(true)
    })
  })

  describe('isReadOnly', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('oracle, explore, librarian, review, security are read-only', () => {
      expect(isReadOnly('oracle')).toBe(true)
      expect(isReadOnly('explore')).toBe(true)
      expect(isReadOnly('librarian')).toBe(true)
      expect(isReadOnly('review')).toBe(true)
      expect(isReadOnly('security')).toBe(true)
    })

    it('sisyphus, hephaestus, implementation are not read-only', () => {
      expect(isReadOnly('sisyphus')).toBe(false)
      expect(isReadOnly('hephaestus')).toBe(false)
      expect(isReadOnly('implementation')).toBe(false)
    })

    it('returns false for unknown role', () => {
      expect(isReadOnly('nonexistent' as never)).toBe(false)
    })
  })

  describe('isBackgroundCapable', () => {
    beforeEach(() => registerDefaultCapabilities())

    it('explore, librarian, oracle, feedback are background-capable', () => {
      expect(isBackgroundCapable('explore')).toBe(true)
      expect(isBackgroundCapable('librarian')).toBe(true)
      expect(isBackgroundCapable('oracle')).toBe(true)
      expect(isBackgroundCapable('feedback')).toBe(true)
    })

    it('sisyphus, implementation, writer are not background-capable', () => {
      expect(isBackgroundCapable('sisyphus')).toBe(false)
      expect(isBackgroundCapable('implementation')).toBe(false)
      expect(isBackgroundCapable('writer')).toBe(false)
    })
  })
})

describe('delegation protocol', () => {
  beforeEach(() => registerDefaultCapabilities())

  describe('createDelegationRequest', () => {
    it('creates a request for valid delegation', () => {
      const req = createDelegationRequest('sisyphus', 'oracle', 'Analyze this architecture')
      expect(req).not.toBeNull()
      expect(req?.id).toMatch(/^del_/)
      expect(req?.fromAgent).toBe('sisyphus')
      expect(req?.toAgent).toBe('oracle')
      expect(req?.prompt).toBe('Analyze this architecture')
    })

    it('returns null for invalid delegation', () => {
      const req = createDelegationRequest('review', 'oracle', 'test')
      expect(req).toBeNull()
    })

    it('includes context and priority', () => {
      const req = createDelegationRequest('sisyphus', 'explore', 'find auth', 'checking auth flow', 1)
      expect(req?.context).toBe('checking auth flow')
      expect(req?.priority).toBe(1)
    })

    it('uses default priority of 5', () => {
      const req = createDelegationRequest('sisyphus', 'explore', 'find auth')
      expect(req?.priority).toBe(5)
    })
  })

  describe('canAcceptDelegation', () => {
    it('respects max concurrent delegations', () => {
      for (let i = 0; i < 5; i++) {
        recordDelegation({
          requestId: `del_${i}`,
          status: 'running',
          fromAgent: 'sisyphus',
          toAgent: 'explore',
          durationMs: 0
        })
      }
      expect(canAcceptDelegation('sisyphus', 'explore')).toBe(false)
    })

    it('allows delegation when under limit', () => {
      recordDelegation({
        requestId: 'del_1',
        status: 'running',
        fromAgent: 'sisyphus',
        toAgent: 'explore',
        durationMs: 0
      })
      expect(canAcceptDelegation('sisyphus', 'oracle')).toBe(true)
    })

    it('completed delegations do not count toward limit', () => {
      for (let i = 0; i < 10; i++) {
        recordDelegation({
          requestId: `del_${i}`,
          status: 'completed',
          fromAgent: 'sisyphus',
          toAgent: 'explore',
          durationMs: 100
        })
      }
      expect(canAcceptDelegation('sisyphus', 'explore')).toBe(true)
    })
  })

  describe('getDelegationHistory', () => {
    it('returns empty array when no delegations', () => {
      expect(getDelegationHistory()).toEqual([])
    })

    it('returns all delegations', () => {
      recordDelegation({ requestId: 'a', status: 'completed', fromAgent: 'sisyphus', toAgent: 'oracle', durationMs: 100 })
      recordDelegation({ requestId: 'b', status: 'completed', fromAgent: 'hephaestus', toAgent: 'explore', durationMs: 50 })
      expect(getDelegationHistory()).toHaveLength(2)
    })

    it('filters by fromAgent', () => {
      recordDelegation({ requestId: 'a', status: 'completed', fromAgent: 'sisyphus', toAgent: 'oracle', durationMs: 100 })
      recordDelegation({ requestId: 'b', status: 'completed', fromAgent: 'hephaestus', toAgent: 'explore', durationMs: 50 })
      expect(getDelegationHistory('sisyphus')).toHaveLength(1)
      expect(getDelegationHistory('hephaestus')).toHaveLength(1)
    })
  })

  describe('getActiveDelegationCount', () => {
    it('counts only running delegations', () => {
      recordDelegation({ requestId: 'a', status: 'running', fromAgent: 'sisyphus', toAgent: 'oracle', durationMs: 0 })
      recordDelegation({ requestId: 'b', status: 'completed', fromAgent: 'sisyphus', toAgent: 'explore', durationMs: 100 })
      recordDelegation({ requestId: 'c', status: 'running', fromAgent: 'sisyphus', toAgent: 'librarian', durationMs: 0 })
      expect(getActiveDelegationCount('sisyphus')).toBe(2)
    })
  })

  describe('resetCapabilities', () => {
    it('clears all capabilities and delegation history', () => {
      registerDefaultCapabilities()
      recordDelegation({ requestId: 'a', status: 'completed', fromAgent: 'sisyphus', toAgent: 'oracle', durationMs: 100 })
      resetCapabilities()
      expect(getCapability('sisyphus')).toBeUndefined()
      expect(getDelegationHistory()).toEqual([])
    })
  })
})

describe('new agent definitions', () => {
  describe('oracle agent', () => {
    it('has correct role', () => {
      expect(oracleAgent.role).toBe('oracle')
    })

    it('uses premium model tier', () => {
      expect(oracleAgent.config.modelTier).toBe('premium')
    })

    it('has low temperature for precise analysis', () => {
      expect(oracleAgent.config.temperature).toBeLessThanOrEqual(0.15)
    })

    it('has long timeout for deep analysis', () => {
      expect(oracleAgent.config.timeoutMs).toBeGreaterThanOrEqual(120000)
    })

    it('is not async by default', () => {
      expect(oracleAgent.config.async).toBe(false)
    })

    it('activates on architecture and complex_analysis intents', () => {
      const intents = oracleAgent.activationRules.flatMap(r => r.intents)
      expect(intents).toContain('architecture')
      expect(intents).toContain('complex_analysis')
    })
  })

  describe('explore agent', () => {
    it('has correct role', () => {
      expect(exploreAgent.role).toBe('explore')
    })

    it('uses fast model tier', () => {
      expect(exploreAgent.config.modelTier).toBe('fast')
    })

    it('is async for background execution', () => {
      expect(exploreAgent.config.async).toBe(true)
    })

    it('has short timeout', () => {
      expect(exploreAgent.config.timeoutMs).toBeLessThanOrEqual(30000)
    })
  })

  describe('librarian agent', () => {
    it('has correct role', () => {
      expect(librarianAgent.role).toBe('librarian')
    })

    it('uses fast model tier', () => {
      expect(librarianAgent.config.modelTier).toBe('fast')
    })

    it('is async for background execution', () => {
      expect(librarianAgent.config.async).toBe(true)
    })

    it('has short timeout', () => {
      expect(librarianAgent.config.timeoutMs).toBeLessThanOrEqual(30000)
    })
  })
})

describe('intent classification with new agents', () => {
  it('architecture intent still works', () => {
    const result = classifyIntent('design the system architecture for the new feature')
    expect(result.primaryIntent).toBe('architecture')
  })

  it('complex analysis triggers complex_analysis', () => {
    const result = classifyIntent('analyze and evaluate the performance of this approach')
    expect(result.primaryIntent).toBe('complex_analysis')
  })

  it('debugging intent still works', () => {
    const result = classifyIntent('there is a bug in the error handling')
    expect(result.primaryIntent).toBe('debugging')
  })

  it('code question still works', () => {
    const result = classifyIntent('explain the function and class in this service module')
    expect(result.primaryIntent).toBe('code_question')
  })
})
