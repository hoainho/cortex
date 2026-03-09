const { mockRun, mockGet, mockAll } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn().mockReturnValue([])
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-optimizer')
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/tmp/cortex-test') }
}))

vi.mock('better-sqlite3', () => {
  const MockDatabase = vi.fn(function (this: any) {
    this.pragma = vi.fn()
    this.exec = vi.fn()
    this.prepare = vi.fn().mockReturnValue({ run: mockRun, get: mockGet, all: mockAll })
    this.close = vi.fn()
    this.transaction = vi.fn((fn: Function) => fn)
  })
  return { default: MockDatabase }
})

import {
  optimizeDecompositionPrompt,
  recordQueryPattern,
  recordQueryOutcome,
  initDefaultVariant
} from '../../electron/services/query-optimizer'

describe('QueryOptimizer', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('optimizeDecompositionPrompt', () => {
    it('returns base prompt when no data exists', () => {
      mockGet.mockReturnValueOnce(undefined)
      mockAll.mockReturnValueOnce([]).mockReturnValueOnce([])

      const result = optimizeDecompositionPrompt('proj-1', 'base prompt here')
      expect(result).toBe('base prompt here')
    })

    it('uses best variant template when score > 0.5', () => {
      mockGet.mockReturnValueOnce({
        id: 'v1',
        template: 'optimized template',
        score: 0.8,
        few_shot_examples: '["ex1", "ex2"]'
      })

      const result = optimizeDecompositionPrompt('proj-1', 'base prompt')
      expect(result).toContain('optimized template')
      expect(result).toContain('ex1')
      expect(result).toContain('ex2')
    })

    it('enhances with few-shot examples from positive signals', () => {
      mockGet.mockReturnValueOnce(undefined)
      mockAll
        .mockReturnValueOnce([
          { query: 'how does authentication work' },
          { query: 'explain the database schema' }
        ])
        .mockReturnValueOnce([])

      const result = optimizeDecompositionPrompt('proj-1', 'base prompt')
      expect(result).toContain('base prompt')
      expect(result).toContain('Successful query examples')
    })

    it('enhances with frequent query patterns', () => {
      mockGet.mockReturnValueOnce(undefined)
      mockAll
        .mockReturnValueOnce([])
        .mockReturnValueOnce([
          { pattern: 'auth middleware', matched_paths: '["src/auth.ts"]', frequency: 5 }
        ])

      const result = optimizeDecompositionPrompt('proj-1', 'base prompt')
      expect(result).toContain('Common patterns')
      expect(result).toContain('auth middleware')
    })
  })

  describe('recordQueryPattern', () => {
    it('upserts a pattern from query keywords', () => {
      recordQueryPattern('proj-1', 'how does the auth middleware work?', ['src/auth.ts'])
      expect(mockRun).toHaveBeenCalled()
    })

    it('skips queries with no meaningful keywords', () => {
      recordQueryPattern('proj-1', 'the and for', [])
      expect(mockRun).not.toHaveBeenCalled()
    })
  })

  describe('recordQueryOutcome', () => {
    it('updates variant score on success', () => {
      mockGet.mockReturnValueOnce({ id: 'v1', score: 0.5 })
      recordQueryOutcome('proj-1', 'test query', true)
      expect(mockRun).toHaveBeenCalledWith(expect.closeTo(0.51, 2), 'v1')
    })

    it('does not crash when no variant exists', () => {
      mockGet.mockReturnValueOnce(undefined)
      expect(() => recordQueryOutcome('proj-1', 'test', true)).not.toThrow()
    })
  })

  describe('initDefaultVariant', () => {
    it('creates variant when none exists', () => {
      mockGet.mockReturnValueOnce(undefined)
      initDefaultVariant('proj-1', 'default template')
      expect(mockRun).toHaveBeenCalledWith(
        expect.any(String),
        'proj-1',
        'default',
        'default template',
        '[]',
        0.5
      )
    })

    it('does not create when variant already exists', () => {
      mockGet.mockReturnValueOnce({ id: 'existing' })
      initDefaultVariant('proj-1', 'default template')
      expect(mockRun).not.toHaveBeenCalled()
    })
  })
})
