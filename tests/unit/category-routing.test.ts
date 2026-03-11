import { describe, it, expect } from 'vitest'
import { CATEGORY_CONFIGS, resolveCategory, routeToModel } from '../../electron/services/routing'
import type { TaskCategory, RoutingDecision } from '../../electron/services/routing'

describe('category-config', () => {
  const ALL_CATEGORIES: TaskCategory[] = [
    'deep', 'visual-engineering', 'ultrabrain', 'artistry',
    'quick', 'unspecified-low', 'unspecified-high', 'writing'
  ]

  it('defines all 8 categories', () => {
    expect(Object.keys(CATEGORY_CONFIGS)).toHaveLength(8)
    for (const cat of ALL_CATEGORIES) {
      expect(CATEGORY_CONFIGS[cat]).toBeDefined()
    }
  })

  it('each config has required fields', () => {
    for (const [key, config] of Object.entries(CATEGORY_CONFIGS)) {
      expect(config.category).toBe(key)
      expect(config.description).toBeTruthy()
      expect(config.defaultModel).toBeTruthy()
      expect(config.fallbackChain.length).toBeGreaterThan(0)
      expect(config.temperature).toBeGreaterThanOrEqual(0)
      expect(config.temperature).toBeLessThanOrEqual(1)
      expect(config.maxTokens).toBeGreaterThan(0)
    }
  })

  it('ultrabrain has highest thinking budget', () => {
    expect(CATEGORY_CONFIGS.ultrabrain.thinkingBudget).toBeGreaterThanOrEqual(
      CATEGORY_CONFIGS.deep.thinkingBudget || 0
    )
  })

  it('quick has lowest maxTokens', () => {
    const quickTokens = CATEGORY_CONFIGS.quick.maxTokens
    for (const [cat, config] of Object.entries(CATEGORY_CONFIGS)) {
      if (cat !== 'quick') {
        expect(config.maxTokens).toBeGreaterThanOrEqual(quickTokens)
      }
    }
  })

  it('writing and visual-engineering have promptAppend', () => {
    expect(CATEGORY_CONFIGS.writing.promptAppend).toBeTruthy()
    expect(CATEGORY_CONFIGS['visual-engineering'].promptAppend).toBeTruthy()
  })
})

describe('category-resolver', () => {
  describe('explicit category', () => {
    it('uses provided category with confidence 1.0', () => {
      const result = resolveCategory({ category: 'deep' })
      expect(result.category).toBe('deep')
      expect(result.confidence).toBe(1.0)
      expect(result.model).toBe(CATEGORY_CONFIGS.deep.defaultModel)
    })

    it('works for all categories', () => {
      const cats: TaskCategory[] = ['deep', 'visual-engineering', 'ultrabrain', 'artistry', 'quick', 'unspecified-low', 'unspecified-high', 'writing']
      for (const cat of cats) {
        const result = resolveCategory({ category: cat })
        expect(result.category).toBe(cat)
        expect(result.confidence).toBe(1.0)
      }
    })
  })

  describe('slash command routing', () => {
    it('maps /review to deep', () => {
      const result = resolveCategory({ slashCommand: '/review' })
      expect(result.category).toBe('deep')
      expect(result.confidence).toBe(0.9)
    })

    it('maps /frontend-ui-ux to visual-engineering', () => {
      const result = resolveCategory({ slashCommand: '/frontend-ui-ux' })
      expect(result.category).toBe('visual-engineering')
    })

    it('maps /architect to ultrabrain', () => {
      const result = resolveCategory({ slashCommand: '/architect' })
      expect(result.category).toBe('ultrabrain')
    })

    it('maps /blog to writing', () => {
      const result = resolveCategory({ slashCommand: '/blog' })
      expect(result.category).toBe('writing')
    })

    it('maps /implement to unspecified-high', () => {
      const result = resolveCategory({ slashCommand: '/implement' })
      expect(result.category).toBe('unspecified-high')
    })

    it('maps /test to quick', () => {
      const result = resolveCategory({ slashCommand: '/test' })
      expect(result.category).toBe('quick')
    })

    it('handles commands without leading slash', () => {
      const result = resolveCategory({ slashCommand: 'review' })
      expect(result.category).toBe('deep')
    })

    it('falls through for unknown slash commands', () => {
      const result = resolveCategory({ slashCommand: '/unknown-command', prompt: 'do something' })
      expect(result.confidence).toBeLessThan(0.9)
    })
  })

  describe('keyword analysis', () => {
    it('detects frontend keywords → visual-engineering', () => {
      const result = resolveCategory({ prompt: 'Create a new UI component with CSS styling' })
      expect(result.category).toBe('visual-engineering')
    })

    it('detects architecture keywords → ultrabrain', () => {
      const result = resolveCategory({ prompt: 'Design the system architecture with scalability' })
      expect(result.category).toBe('ultrabrain')
    })

    it('detects fix/typo keywords → quick', () => {
      const result = resolveCategory({ prompt: 'Fix the typo in the readme and rename the function' })
      expect(result.category).toBe('quick')
    })

    it('detects documentation keywords → writing', () => {
      const result = resolveCategory({ prompt: 'Write a README document and explain the API' })
      expect(result.category).toBe('writing')
    })

    it('single keyword match gives lower confidence', () => {
      const result = resolveCategory({ prompt: 'Fix the bug in the auth module please' })
      expect(result.confidence).toBeLessThanOrEqual(0.5)
    })

    it('multiple keyword matches give higher confidence', () => {
      const result = resolveCategory({ prompt: 'Create a new frontend UI component with Tailwind CSS' })
      expect(result.confidence).toBeGreaterThanOrEqual(0.8)
    })
  })

  describe('default fallback', () => {
    it('uses unspecified-high for long prompts', () => {
      const longPrompt = 'a'.repeat(600)
      const result = resolveCategory({ prompt: longPrompt })
      expect(result.category).toBe('unspecified-high')
      expect(result.confidence).toBe(0.3)
    })

    it('uses unspecified-low for short prompts', () => {
      const result = resolveCategory({ prompt: 'hello world' })
      expect(result.category).toBe('unspecified-low')
      expect(result.confidence).toBe(0.3)
    })

    it('uses unspecified-low for empty input', () => {
      const result = resolveCategory({})
      expect(result.category).toBe('unspecified-low')
      expect(result.confidence).toBe(0.1)
    })
  })

  describe('priority: explicit > slash > keyword > default', () => {
    it('explicit category overrides slash command', () => {
      const result = resolveCategory({ category: 'writing', slashCommand: '/review' })
      expect(result.category).toBe('writing')
      expect(result.confidence).toBe(1.0)
    })

    it('slash command overrides keyword analysis', () => {
      const result = resolveCategory({ slashCommand: '/review', prompt: 'Fix the CSS styling' })
      expect(result.category).toBe('deep')
    })
  })
})

describe('model-router', () => {
  function makeDecision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
    return {
      category: 'deep',
      model: 'claude-sonnet-4-20250514',
      config: CATEGORY_CONFIGS.deep,
      confidence: 1.0,
      reason: 'test',
      ...overrides
    }
  }

  it('uses default model when available', () => {
    const result = routeToModel(
      makeDecision(),
      ['claude-sonnet-4-20250514', 'gpt-4o']
    )
    expect(result.model).toBe('claude-sonnet-4-20250514')
    expect(result.fallbackUsed).toBe(false)
  })

  it('falls back when default not available', () => {
    const result = routeToModel(
      makeDecision(),
      ['gpt-4o', 'gemini-2.5-flash']
    )
    expect(result.model).toBe('gpt-4o')
    expect(result.fallbackUsed).toBe(true)
  })

  it('walks fallback chain in order', () => {
    const result = routeToModel(
      makeDecision(),
      ['gemini-2.5-pro', 'gemini-2.5-flash']
    )
    expect(result.model).toBe('gemini-2.5-pro')
    expect(result.fallbackUsed).toBe(true)
  })

  it('uses first available when no fallback matches', () => {
    const result = routeToModel(
      makeDecision(),
      ['completely-unknown-model']
    )
    expect(result.model).toBe('completely-unknown-model')
    expect(result.fallbackUsed).toBe(true)
  })

  it('returns default model when no models available', () => {
    const result = routeToModel(makeDecision(), [])
    expect(result.model).toBe('claude-sonnet-4-20250514')
    expect(result.fallbackUsed).toBe(false)
  })

  it('preserves config in result', () => {
    const result = routeToModel(makeDecision(), ['claude-sonnet-4-20250514'])
    expect(result.config.category).toBe('deep')
    expect(result.config.temperature).toBe(0.3)
  })

  it('works with ultrabrain category', () => {
    const decision = resolveCategory({ category: 'ultrabrain' })
    const result = routeToModel(decision, ['o3', 'claude-sonnet-4-20250514'])
    expect(result.model).toBe('o3')
    expect(result.fallbackUsed).toBe(false)
  })

  it('falls back correctly for ultrabrain', () => {
    const decision = resolveCategory({ category: 'ultrabrain' })
    const result = routeToModel(decision, ['claude-sonnet-4-20250514', 'gpt-4o'])
    expect(result.model).toBe('claude-sonnet-4-20250514')
    expect(result.fallbackUsed).toBe(true)
  })
})
