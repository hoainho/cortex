import { describe, it, expect, beforeEach, vi } from 'vitest'

vi.mock('../../electron/services/db', () => ({
  getDb: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn().mockReturnValue(null),
      all: vi.fn().mockReturnValue([])
    }),
    exec: vi.fn()
  })
}))

vi.mock('../../electron/services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(1024).fill(0.1))
}))

vi.mock('../../electron/services/memory/memory-db', () => ({
  initMemorySchema: vi.fn(),
  archivalMemoryQueries: {
    insert: vi.fn().mockReturnValue({ run: vi.fn() }),
    getByProject: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    getWithEmbeddings: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    updateAccess: vi.fn().mockReturnValue({ run: vi.fn() }),
    decayRelevance: vi.fn().mockReturnValue({ run: vi.fn().mockReturnValue({ changes: 3 }) }),
    getStats: vi.fn().mockReturnValue({
      get: vi.fn().mockReturnValue({ total: 0, oldest: null, newest: null, avg_relevance: null })
    }),
    delete: vi.fn().mockReturnValue({ run: vi.fn() })
  },
  recallMemoryQueries: {
    insert: vi.fn().mockReturnValue({ run: vi.fn() }),
    getRecent: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    count: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ count: 0 }) }),
    getWithEmbeddings: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    deleteByConversation: vi.fn().mockReturnValue({ run: vi.fn() }),
    getByConversation: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) })
  },
  coreMemoryQueries: {
    upsert: vi.fn().mockReturnValue({ run: vi.fn() }),
    getByProject: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    getBySection: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(null) }),
    delete: vi.fn().mockReturnValue({ run: vi.fn() }),
    deleteAll: vi.fn().mockReturnValue({ run: vi.fn() }),
    count: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue({ count: 0 }) })
  }
}))

vi.mock('../../electron/services/memory/archival-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/services/memory/archival-memory')>()
  return {
    ...actual,
    addArchivalMemory: vi.fn().mockResolvedValue(null),
    searchArchivalMemory: vi.fn().mockResolvedValue([]),
    getArchivalMemories: vi.fn().mockReturnValue([]),
    decayRelevance: vi.fn().mockReturnValue(3),
    getArchivalStats: vi.fn().mockReturnValue({ total: 0, oldest: null, newest: null, avgRelevance: 0 })
  }
})

vi.mock('../../electron/services/memory/recall-memory', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../electron/services/memory/recall-memory')>()
  return {
    ...actual,
    addRecallMemory: vi.fn().mockResolvedValue(null),
    searchRecallMemory: vi.fn().mockResolvedValue([]),
    getRecentRecall: vi.fn().mockReturnValue([]),
    getRecallCount: vi.fn().mockReturnValue(0)
  }
})

vi.mock('../../electron/services/memory/core-memory', () => ({
  getCoreMemory: vi.fn().mockReturnValue([]),
  getCoreMemorySection: vi.fn().mockReturnValue(null),
  getCoreMemoryForPrompt: vi.fn().mockReturnValue(''),
  updateCoreMemory: vi.fn(),
  getCoreMemoryTokenCount: vi.fn().mockReturnValue(100)
}))

import {
  autoExtractArchival,
  saveInteraction,
  loadMemoryContext,
  buildMemoryPrompt,
  getMemoryStats,
  compactMemory
} from '../../electron/services/memory/memory-manager'

import { addArchivalMemory, decayRelevance, getArchivalStats } from '../../electron/services/memory/archival-memory'
import { addRecallMemory, getRecallCount } from '../../electron/services/memory/recall-memory'
import { getCoreMemoryTokenCount } from '../../electron/services/memory/core-memory'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('autoExtractArchival — pure function', () => {
  it('returns null for content with no recognized keywords', () => {
    expect(autoExtractArchival('The weather today is nice and sunny.')).toBeNull()
  })

  it('extracts content containing "decided"', () => {
    const result = autoExtractArchival('We decided to use React for the frontend component structure.')
    expect(result).not.toBeNull()
    expect(result).toContain('decided')
  })

  it('extracts content containing "learned" keyword', () => {
    const result = autoExtractArchival('I learned that always validating inputs at the service boundary layer prevents security issues.')
    expect(result).not.toBeNull()
    expect(result).toContain('learned')
  })

  it('extracts content containing "pattern"', () => {
    const result = autoExtractArchival('We use the repository pattern for all database access.')
    expect(result).not.toBeNull()
    expect(result).toContain('pattern')
  })

  it('extracts content containing "architecture"', () => {
    const result = autoExtractArchival('The architecture uses microservices with event-driven communication.')
    expect(result).not.toBeNull()
    expect(result).toContain('architecture')
  })

  it('extracts content containing "fixed"', () => {
    const result = autoExtractArchival('Fixed the memory leak by clearing the cache on component unmount.')
    expect(result).not.toBeNull()
    expect(result).toContain('Fixed')
  })

  it('extracts content containing "prefer"', () => {
    const result = autoExtractArchival('I prefer to always use TypeScript strict mode in new projects always.')
    expect(result).not.toBeNull()
    expect(result).toContain('prefer')
  })

  it('slices output to at most 1000 characters', () => {
    const longContent = 'We decided to use this approach. '.repeat(100)
    const result = autoExtractArchival(longContent)
    expect(result).not.toBeNull()
    expect(result!.length).toBeLessThanOrEqual(1000)
  })

  it('returns null for very short content without markers', () => {
    expect(autoExtractArchival('ok')).toBeNull()
  })
})

describe('saveInteraction — conditional archival logic (guards auto-extract growth fix)', () => {
  it('calls addRecallMemory for assistant role', async () => {
    await saveInteraction('proj-1', 'conv-1', 'assistant', 'We decided to use React for this component structure here.')
    expect(addRecallMemory).toHaveBeenCalledWith('proj-1', 'conv-1', 'assistant', expect.any(String))
  })

  it('calls addRecallMemory for user role', async () => {
    await saveInteraction('proj-1', 'conv-1', 'user', 'What is the best way to handle auth?')
    expect(addRecallMemory).toHaveBeenCalledWith('proj-1', 'conv-1', 'user', expect.any(String))
  })

  it('calls addArchivalMemory for assistant with content>100 chars AND marker present', async () => {
    const content = 'We decided to use the repository pattern for all database operations in this codebase going forward now.'
    expect(content.length).toBeGreaterThan(100)
    await saveInteraction('proj-1', 'conv-1', 'assistant', content)
    expect(addArchivalMemory).toHaveBeenCalled()
  })

  it('does NOT call addArchivalMemory for assistant content>100 chars WITHOUT any marker', async () => {
    const content = 'The component renders a list of items using a simple map function over the array of data provided to it.'
    expect(content.length).toBeGreaterThan(100)
    await saveInteraction('proj-1', 'conv-1', 'assistant', content)
    expect(addArchivalMemory).not.toHaveBeenCalled()
  })

  it('does NOT call addArchivalMemory for user role even with markers', async () => {
    const content = 'We decided to use React for the frontend architecture pattern of this whole project system indeed here.'
    expect(content.length).toBeGreaterThan(100)
    await saveInteraction('proj-1', 'conv-1', 'user', content)
    expect(addArchivalMemory).not.toHaveBeenCalled()
  })

  it('does NOT call addArchivalMemory for assistant content<=100 chars', async () => {
    const content = 'We decided to use React.'
    expect(content.length).toBeLessThanOrEqual(100)
    await saveInteraction('proj-1', 'conv-1', 'assistant', content)
    expect(addArchivalMemory).not.toHaveBeenCalled()
  })
})

describe('loadMemoryContext', () => {
  it('returns correct structure with core, archival, recall keys', async () => {
    const ctx = await loadMemoryContext('proj-1')
    expect(ctx).toHaveProperty('core')
    expect(ctx).toHaveProperty('archival')
    expect(ctx).toHaveProperty('recall')
  })

  it('recall is an array', async () => {
    const ctx = await loadMemoryContext('proj-1')
    expect(Array.isArray(ctx.recall)).toBe(true)
  })

  it('archival is an array', async () => {
    const ctx = await loadMemoryContext('proj-1')
    expect(Array.isArray(ctx.archival)).toBe(true)
  })
})

describe('buildMemoryPrompt', () => {
  it('returns a string', () => {
    expect(typeof buildMemoryPrompt('proj-1')).toBe('string')
  })
})

describe('getMemoryStats', () => {
  it('returns object with all required fields', () => {
    const stats = getMemoryStats('proj-1')
    expect(stats).toHaveProperty('coreEntries')
    expect(stats).toHaveProperty('archivalEntries')
    expect(stats).toHaveProperty('recallEntries')
    expect(stats).toHaveProperty('totalTokens')
  })

  it('totalTokens = coreTokens + archival*100 + recall*50', () => {
    vi.mocked(getCoreMemoryTokenCount).mockReturnValue(200)
    vi.mocked(getArchivalStats).mockReturnValue({ total: 10, oldest: null, newest: null, avgRelevance: 1 })
    vi.mocked(getRecallCount).mockReturnValue(4)

    const stats = getMemoryStats('proj-1')
    expect(stats.totalTokens).toBe(200 + 10 * 100 + 4 * 50)
  })

  it('archivalEntries reflects archivalStats.total', () => {
    vi.mocked(getArchivalStats).mockReturnValue({ total: 42, oldest: null, newest: null, avgRelevance: 0.8 })
    const stats = getMemoryStats('proj-1')
    expect(stats.archivalEntries).toBe(42)
  })

  it('recallEntries reflects getRecallCount', () => {
    vi.mocked(getRecallCount).mockReturnValue(17)
    const stats = getMemoryStats('proj-1')
    expect(stats.recallEntries).toBe(17)
  })
})

describe('compactMemory', () => {
  it('returns { decayed: number }', async () => {
    vi.mocked(decayRelevance).mockReturnValue(5)
    const result = await compactMemory('proj-1')
    expect(result).toHaveProperty('decayed')
    expect(typeof result.decayed).toBe('number')
  })

  it('calls decayRelevance with the projectId', async () => {
    await compactMemory('proj-xyz')
    expect(decayRelevance).toHaveBeenCalledWith('proj-xyz')
  })

  it('decayed count matches what decayRelevance returns', async () => {
    vi.mocked(decayRelevance).mockReturnValue(7)
    const result = await compactMemory('proj-1')
    expect(result.decayed).toBe(7)
  })
})
