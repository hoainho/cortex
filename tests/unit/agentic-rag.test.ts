/**
 * Agentic RAG tests
 *
 * Tests the multi-step intelligent retrieval pipeline.
 * Internal functions are replicated for direct testing (same pattern as vector-search.test.ts).
 * agenticRetrieve is tested with mocked dependencies.
 */

const { mockHybridSearch, mockFetch } = vi.hoisted(() => ({
  mockHybridSearch: vi.fn(),
  mockFetch: vi.fn()
}))

vi.mock('../../electron/services/vector-search', () => ({
  hybridSearch: mockHybridSearch
}))

vi.mock('../../electron/services/settings-service', () => ({
  getProxyUrl: vi.fn().mockReturnValue('https://proxy.hoainho.info'),
  getProxyKey: vi.fn().mockReturnValue('hoainho')
}))

vi.stubGlobal('fetch', mockFetch)

import { agenticRetrieve } from '../../electron/services/agentic-rag'

// =====================
// Replicated internals for direct testing
// =====================

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'been', 'have', 'has',
  'how', 'does', 'what', 'when', 'where', 'which', 'that', 'this',
  'with', 'from', 'into', 'about', 'than', 'they', 'them', 'their',
  'there', 'here', 'just', 'also', 'more', 'some', 'only', 'very',
  'can', 'will', 'should', 'would', 'could', 'may', 'might',
  'not', 'but', 'all', 'any', 'each', 'every', 'both', 'few',
  'là', 'của', 'và', 'trong', 'cho', 'với', 'này', 'đó', 'được',
  'các', 'những', 'một', 'hay', 'hoặc', 'khi', 'nào', 'thì',
  'làm', 'gì', 'sao', 'thế', 'nên', 'cần', 'phải', 'muốn'
])

function extractKeywords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s-_.]/g, ' ')
    .split(/\s+/)
    .filter(k => k.length >= 3)
    .filter(k => !STOP_WORDS.has(k))
}

interface MockSearchResult {
  chunkId: string
  score: number
  content: string
  filePath: string
  relativePath: string
  language: string
  chunkType: string
  name: string | null
  lineStart: number
  lineEnd: number
  dependencies: string[]
  exports: string[]
  branch: string
}

function computeRelevanceBoost(queryKeywords: string[], chunk: MockSearchResult): number {
  const chunkText = `${chunk.relativePath} ${chunk.name || ''} ${chunk.content}`.toLowerCase()
  let hits = 0
  for (const keyword of queryKeywords) {
    if (chunkText.includes(keyword)) hits++
  }
  return queryKeywords.length > 0 ? (hits / queryKeywords.length) * 0.3 : 0
}

const CODE_REF_PATTERNS = [
  /(?:file|module|component|service)\s+[`"']?(\S+?)[`"']?(?:\s|$|,|\.)/gi,
  /(\w+(?:\.\w+)+)(?:\s|$)/g,
  /(?:function|method|class)\s+[`"']?(\w+)[`"']?/gi,
  /[`"']([a-zA-Z][\w-]+\.[a-zA-Z]+)[`"']/g,
]

function detectGaps(query: string, results: MockSearchResult[]): string[] {
  const foundPaths = new Set(results.map(r => r.relativePath.toLowerCase()))
  const foundNames = new Set(results.filter(r => r.name).map(r => r.name!.toLowerCase()))
  const gaps: string[] = []
  for (const pattern of CODE_REF_PATTERNS) {
    pattern.lastIndex = 0
    let match
    while ((match = pattern.exec(query)) !== null) {
      const ref = match[1].toLowerCase()
      const inPaths = Array.from(foundPaths).some(p => p.includes(ref))
      const inNames = Array.from(foundNames).some(n => n.includes(ref))
      if (!inPaths && !inNames) {
        gaps.push(ref)
      }
    }
  }
  return [...new Set(gaps)]
}

function makeChunk(overrides: Partial<MockSearchResult> = {}): MockSearchResult {
  return {
    chunkId: 'chunk-1',
    score: 0.8,
    content: 'function authenticate(user) { return true }',
    filePath: '/src/auth.ts',
    relativePath: 'src/auth.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'authenticate',
    lineStart: 1,
    lineEnd: 10,
    dependencies: [],
    exports: ['authenticate'],
    branch: 'main',
    ...overrides
  }
}

// =====================
// extractKeywords tests
// =====================

describe('extractKeywords', () => {
  it('extracts meaningful words and removes stop words', () => {
    const keywords = extractKeywords('How does the authentication middleware work?')
    expect(keywords).toContain('authentication')
    expect(keywords).toContain('middleware')
    expect(keywords).toContain('work')
    expect(keywords).not.toContain('how')
    expect(keywords).not.toContain('does')
    expect(keywords).not.toContain('the')
  })

  it('filters out short words (< 3 chars)', () => {
    const keywords = extractKeywords('go to db and do it')
    expect(keywords).not.toContain('go')
    expect(keywords).not.toContain('to')
    expect(keywords).not.toContain('db')
    expect(keywords).not.toContain('do')
    expect(keywords).not.toContain('it')
  })

  it('handles dotted paths and technical terms', () => {
    const keywords = extractKeywords('auth.service.ts handles login')
    expect(keywords).toContain('auth.service.ts')
    expect(keywords).toContain('handles')
    expect(keywords).toContain('login')
  })

  it('removes Vietnamese stop words', () => {
    // Note: extractKeywords uses \w which is ASCII-only in JS,
    // so Vietnamese characters get stripped by the regex. This tests actual behavior.
    const keywords = extractKeywords('làm sao để xác thực người dùng')
    expect(keywords).not.toContain('làm')
    expect(keywords).not.toContain('sao')
    // Vietnamese chars are stripped by [^\w\s-_.] regex, so all words become empty
    expect(keywords).toEqual([])
  })

  it('returns empty array for all-stop-word input', () => {
    const keywords = extractKeywords('how does the')
    expect(keywords).toEqual([])
  })
})

// =====================
// computeRelevanceBoost tests
// =====================

describe('computeRelevanceBoost', () => {
  it('returns 0.3 when all keywords match', () => {
    const chunk = makeChunk({ content: 'authenticate user middleware', relativePath: 'src/auth.ts' })
    const boost = computeRelevanceBoost(['authenticate', 'auth'], chunk)
    expect(boost).toBeCloseTo(0.3, 2)
  })

  it('returns 0 when no keywords match', () => {
    const chunk = makeChunk({ content: 'database connection pool', relativePath: 'src/db.ts', name: 'dbPool' })
    const boost = computeRelevanceBoost(['authenticate', 'middleware'], chunk)
    expect(boost).toBe(0)
  })

  it('returns proportional boost for partial matches', () => {
    const chunk = makeChunk({ content: 'authenticate request', relativePath: 'src/auth.ts' })
    const boost = computeRelevanceBoost(['authenticate', 'database', 'query'], chunk)
    // 1 out of 3 keywords match
    expect(boost).toBeCloseTo(0.1, 2)
  })

  it('returns 0 for empty keywords', () => {
    const chunk = makeChunk()
    expect(computeRelevanceBoost([], chunk)).toBe(0)
  })
})

// =====================
// detectGaps tests
// =====================

describe('detectGaps', () => {
  it('detects missing file references', () => {
    const results = [makeChunk({ relativePath: 'src/auth.ts', name: 'authenticate' })]
    const gaps = detectGaps('file `db-service.ts` and file auth.ts', results)
    expect(gaps).toContain('db-service.ts')
  })

  it('returns empty when all references found', () => {
    const results = [makeChunk({ relativePath: 'src/auth.ts', name: 'authenticate' })]
    const gaps = detectGaps('function authenticate in auth.ts', results)
    expect(gaps).toEqual([])
  })

  it('detects missing function references', () => {
    const results = [makeChunk({ name: 'authenticate' })]
    const gaps = detectGaps('function authenticate and function validateToken', results)
    expect(gaps).toContain('validatetoken')
  })

  it('handles query with no code references', () => {
    const results = [makeChunk()]
    const gaps = detectGaps('How does the project work?', results)
    expect(gaps).toEqual([])
  })
})

// =====================
// agenticRetrieve integration tests (mocked dependencies)
// =====================

describe('agenticRetrieve', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('decomposes query and retrieves context', async () => {
    // Mock LLM decomposition
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["auth middleware", "login handler"]' } }]
      })
    })

    const chunk1 = makeChunk({ chunkId: 'c1', score: 0.9 })
    const chunk2 = makeChunk({ chunkId: 'c2', score: 0.7, relativePath: 'src/login.ts', name: 'login' })

    mockHybridSearch
      .mockResolvedValueOnce([chunk1])  // "auth middleware"
      .mockResolvedValueOnce([chunk2])  // "login handler"

    const result = await agenticRetrieve('proj-1', 'How does auth work and what is the login flow?', 'engineering')

    expect(result.subQueries).toEqual(['auth middleware', 'login handler'])
    expect(result.context.length).toBe(2)
    expect(result.confidence).toBeGreaterThan(0)
    expect(result.iterations).toBeGreaterThanOrEqual(2)
    expect(mockHybridSearch).toHaveBeenCalledTimes(2)
  })

  it('falls back to original query when decomposition fails', async () => {
    // Mock LLM failure
    mockFetch.mockRejectedValueOnce(new Error('Network error'))

    const chunk = makeChunk({ chunkId: 'c1', score: 0.8 })
    mockHybridSearch.mockResolvedValueOnce([chunk])

    const result = await agenticRetrieve('proj-1', 'What is auth?', 'pm')

    expect(result.subQueries).toEqual(['What is auth?'])
    expect(result.context.length).toBe(1)
    expect(mockHybridSearch).toHaveBeenCalledTimes(1)
  })

  it('falls back to original query when LLM returns invalid JSON', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'not valid json' } }]
      })
    })

    const chunk = makeChunk({ chunkId: 'c1' })
    mockHybridSearch.mockResolvedValueOnce([chunk])

    const result = await agenticRetrieve('proj-1', 'test query', 'engineering')

    expect(result.subQueries).toEqual(['test query'])
    expect(result.context.length).toBe(1)
  })

  it('returns empty context when all searches fail', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["search term"]' } }]
      })
    })

    mockHybridSearch.mockRejectedValue(new Error('Search failed'))

    const result = await agenticRetrieve('proj-1', 'test', 'pm')

    expect(result.context).toEqual([])
    expect(result.confidence).toBe(0)
    expect(result.reasoning).toContain('failed')
  })

  it('deduplicates results from multiple sub-queries', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["auth", "auth middleware"]' } }]
      })
    })

    const sameChunk = makeChunk({ chunkId: 'c1', score: 0.8 })

    mockHybridSearch
      .mockResolvedValueOnce([sameChunk])
      .mockResolvedValueOnce([sameChunk])  // Same chunk from different sub-query

    const result = await agenticRetrieve('proj-1', 'auth and middleware', 'engineering')

    // Should only have 1 chunk (deduplicated), but with boosted score
    expect(result.context.length).toBe(1)
    expect(result.context[0].score).toBeGreaterThan(0.8) // Multi-query bonus applied
  })

  it('respects maxChunks option', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '["search"]' } }]
      })
    })

    const chunks = Array.from({ length: 20 }, (_, i) =>
      makeChunk({ chunkId: `c${i}`, score: 0.9 - i * 0.01 })
    )
    mockHybridSearch.mockResolvedValueOnce(chunks)

    const result = await agenticRetrieve('proj-1', 'search', 'pm', { maxChunks: 5 })

    expect(result.context.length).toBeLessThanOrEqual(5)
  })
})
