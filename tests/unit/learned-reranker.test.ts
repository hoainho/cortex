const { mockRun, mockGet, mockAll } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn().mockReturnValue([])
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-reranker'),
  createHash: vi.fn().mockReturnValue({
    update: vi.fn().mockReturnValue({
      digest: vi.fn().mockReturnValue('abcdef1234567890abcdef')
    })
  })
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

import { hashQuery, rerank, trainFromPairs, getLearnedWeightCount } from '../../electron/services/learned-reranker'
import type { SearchResult } from '../../electron/services/vector-search'

function makeResult(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: 'chunk-1',
    score: 0.8,
    content: 'test content',
    filePath: '/repo/test.ts',
    relativePath: 'test.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'test',
    lineStart: 1,
    lineEnd: 10,
    dependencies: [],
    exports: [],
    branch: 'main',
    ...overrides
  }
}

describe('hashQuery', () => {
  it('returns a 16-character hash', () => {
    const hash = hashQuery('how does auth work')
    expect(hash).toHaveLength(16)
  })

  it('normalizes whitespace before hashing', () => {
    const h1 = hashQuery('how  does   auth work')
    const h2 = hashQuery('how does auth work')
    expect(h1).toBe(h2)
  })

  it('is case-insensitive', () => {
    const h1 = hashQuery('How Does Auth Work')
    const h2 = hashQuery('how does auth work')
    expect(h1).toBe(h2)
  })
})

describe('rerank', () => {
  it('returns empty array for empty results', () => {
    expect(rerank('proj-1', 'test', [])).toEqual([])
  })

  it('returns original order when no weights exist', () => {
    mockAll.mockReturnValueOnce([])
    const results = [
      makeResult({ chunkId: 'c1', score: 0.9 }),
      makeResult({ chunkId: 'c2', score: 0.7 })
    ]

    const reranked = rerank('proj-1', 'test', results)
    expect(reranked[0].chunkId).toBe('c1')
    expect(reranked[1].chunkId).toBe('c2')
  })

  it('adjusts scores based on learned weights', () => {
    mockAll.mockReturnValueOnce([
      { chunk_id: 'c2', score_adjustment: 0.5, confidence: 1.0 }
    ])

    const results = [
      makeResult({ chunkId: 'c1', score: 0.9 }),
      makeResult({ chunkId: 'c2', score: 0.5 })
    ]

    const reranked = rerank('proj-1', 'boost query', results)
    expect(reranked[0].chunkId).toBe('c2')
    expect(reranked[0].score).toBe(1.0)
  })

  it('handles database errors gracefully', () => {
    mockAll.mockImplementationOnce(() => { throw new Error('DB error') })
    const results = [makeResult({ chunkId: 'c1', score: 0.9 })]
    const reranked = rerank('proj-1', 'test', results)
    expect(reranked).toEqual(results)
  })
})

describe('trainFromPairs', () => {
  it('returns zeros when no pairs exist', () => {
    mockAll.mockReturnValueOnce([])
    const result = trainFromPairs('proj-1')
    expect(result.trained).toBe(0)
    expect(result.weightsUpdated).toBe(0)
  })

  it('processes pairs and creates weights', () => {
    mockAll.mockReturnValueOnce([
      { query: 'auth question', chunk_id: 'chunk-1', label: 1.0 },
      { query: 'auth question', chunk_id: 'chunk-1', label: 0.7 }
    ])

    const result = trainFromPairs('proj-1')
    expect(result.trained).toBe(2)
    expect(result.weightsUpdated).toBeGreaterThan(0)
  })
})

describe('getLearnedWeightCount', () => {
  it('returns count from database', () => {
    mockGet.mockReturnValueOnce({ count: 42 })
    expect(getLearnedWeightCount('proj-1')).toBe(42)
  })

  it('returns 0 when no weights', () => {
    mockGet.mockReturnValueOnce(null)
    expect(getLearnedWeightCount('proj-1')).toBe(0)
  })
})
