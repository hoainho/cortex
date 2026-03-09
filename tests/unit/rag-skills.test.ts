const { mockRun, mockGet, mockAll } = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockGet: vi.fn(),
  mockAll: vi.fn().mockReturnValue([])
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn().mockReturnValue('test-uuid-rag')
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

vi.mock('../../electron/services/embedder', () => ({
  embedQuery: vi.fn().mockResolvedValue(new Array(384).fill(0.1))
}))

vi.mock('../../electron/services/vector-search', () => ({
  hybridSearch: vi.fn().mockResolvedValue([
    { chunkId: 'c1', relativePath: 'src/auth.ts', content: 'function login() {}', chunkType: 'function', name: 'login', language: 'typescript', score: 0.9 },
    { chunkId: 'c2', relativePath: 'src/db.ts', content: 'function query() {}', chunkType: 'function', name: 'query', language: 'typescript', score: 0.8 }
  ])
}))

// ========================
// RAG Router Tests
// ========================
import { routeRAGQuery } from '../../electron/services/skills/rag/rag-router'

describe('RAG Router', () => {
  describe('routeRAGQuery', () => {
    it('routes relationship queries to graphrag', () => {
      const result = routeRAGQuery('proj-1', 'what imports does auth.ts use')
      expect(result.strategy).toBe('graphrag')
      expect(result.confidence).toBeGreaterThanOrEqual(0.7)
    })

    it('routes complex queries to fusion', () => {
      const result = routeRAGQuery('proj-1', 'give me a comprehensive overview of the entire authentication system and all related components')
      expect(result.strategy).toBe('fusion')
      expect(result.confidence).toBeGreaterThanOrEqual(0.6)
    })

    it('routes understanding queries to contextual', () => {
      const result = routeRAGQuery('proj-1', 'how does the login function work')
      expect(result.strategy).toBe('contextual')
    })

    it('defaults to hybrid for simple queries', () => {
      const result = routeRAGQuery('proj-1', 'login')
      expect(result.strategy).toBe('hybrid')
      expect(result.confidence).toBe(0.5)
    })
  })
})

// ========================
// RAG Fusion Tests
// ========================
import { generateQueryVariants, reciprocalRankFusion } from '../../electron/services/skills/rag/rag-fusion-skill'

describe('RAG Fusion', () => {
  describe('generateQueryVariants', () => {
    it('returns original query as first variant', () => {
      const variants = generateQueryVariants('how does auth work', 3)
      expect(variants[0]).toBe('how does auth work')
    })

    it('generates up to n variants', () => {
      const variants = generateQueryVariants('how does the authentication system work in this project', 3)
      expect(variants.length).toBeLessThanOrEqual(3)
      expect(variants.length).toBeGreaterThanOrEqual(1)
    })

    it('handles short queries gracefully', () => {
      const variants = generateQueryVariants('auth', 3)
      expect(variants.length).toBeGreaterThanOrEqual(1)
      expect(variants[0]).toBe('auth')
    })
  })

  describe('reciprocalRankFusion', () => {
    it('merges and ranks results from multiple sets', () => {
      const set1 = [
        { chunkId: 'a', relativePath: 'a.ts', content: 'a', chunkType: 'fn', name: 'a', language: 'ts', score: 1 },
        { chunkId: 'b', relativePath: 'b.ts', content: 'b', chunkType: 'fn', name: 'b', language: 'ts', score: 0.9 }
      ]
      const set2 = [
        { chunkId: 'b', relativePath: 'b.ts', content: 'b', chunkType: 'fn', name: 'b', language: 'ts', score: 1 },
        { chunkId: 'c', relativePath: 'c.ts', content: 'c', chunkType: 'fn', name: 'c', language: 'ts', score: 0.8 }
      ]

      const fused = reciprocalRankFusion([set1, set2])
      expect(fused.length).toBe(3)
      // 'b' appears in both sets, should rank highest
      expect(fused[0].chunkId).toBe('b')
    })

    it('returns empty array for empty input', () => {
      const fused = reciprocalRankFusion([])
      expect(fused).toEqual([])
    })

    it('handles single result set', () => {
      const set1 = [
        { chunkId: 'x', relativePath: 'x.ts', content: 'x', chunkType: 'fn', name: 'x', language: 'ts', score: 1 }
      ]
      const fused = reciprocalRankFusion([set1])
      expect(fused.length).toBe(1)
      expect(fused[0].chunkId).toBe('x')
    })
  })
})

// ========================
// Contextual Chunk Tests
// ========================
import { addContextToChunk } from '../../electron/services/skills/rag/contextual-chunk'

describe('Contextual Chunking', () => {
  describe('addContextToChunk', () => {
    it('adds file context prefix to chunk content', () => {
      const chunk = {
        relative_path: 'src/auth.ts',
        chunk_type: 'function',
        name: 'login',
        content: 'function login() { return true }'
      }
      const result = addContextToChunk(chunk, 'Imports: express | Exports: function: login')
      expect(result).toContain('src/auth.ts')
      expect(result).toContain('[function]')
      expect(result).toContain('login')
      expect(result).toContain('function login() { return true }')
      expect(result).toContain('Imports: express')
    })

    it('handles chunks without name', () => {
      const chunk = {
        relative_path: 'src/index.ts',
        chunk_type: 'other',
        name: null,
        content: 'import express from "express"'
      }
      const result = addContextToChunk(chunk, '')
      expect(result).toContain('src/index.ts')
      expect(result).toContain('import express')
    })
  })
})

// ========================
// Re-embed Tests
// ========================
import { needsReEmbed } from '../../electron/services/skills/rag/re-embed'

describe('Re-embed', () => {
  describe('needsReEmbed', () => {
    it('returns true when less than 50% chunks are contextualized', () => {
      mockGet.mockReturnValueOnce({ total: 100, contextualized: 20 })
      const result = needsReEmbed('proj-1')
      expect(result).toBe(true)
    })

    it('returns false when most chunks are contextualized', () => {
      mockGet.mockReturnValueOnce({ total: 100, contextualized: 80 })
      const result = needsReEmbed('proj-1')
      expect(result).toBe(false)
    })

    it('returns false when no chunks exist', () => {
      mockGet.mockReturnValueOnce({ total: 0, contextualized: 0 })
      const result = needsReEmbed('proj-1')
      expect(result).toBe(false)
    })
  })
})

// ========================
// GraphRAG Skill Tests
// ========================
import { createGraphRAGSkill } from '../../electron/services/skills/rag/graphrag-skill'

vi.mock('../../electron/services/skills/rag/graph-db', () => ({
  graphNodeQueries: {
    getByName: vi.fn().mockReturnValue({ all: vi.fn().mockReturnValue([]) }),
    getById: vi.fn().mockReturnValue({ get: vi.fn().mockReturnValue(null) })
  },
  getNodeNeighbors: vi.fn().mockReturnValue([])
}))

describe('GraphRAG Skill', () => {
  const skill = createGraphRAGSkill()

  it('has correct metadata', () => {
    expect(skill.name).toBe('graphrag')
    expect(skill.category).toBe('rag')
    expect(skill.version).toBe('2.0.0')
  })

  it('handles relationship queries', () => {
    expect(skill.canHandle({ query: 'what imports auth.ts', projectId: 'p1' })).toBe(true)
    expect(skill.canHandle({ query: 'who uses the login function', projectId: 'p1' })).toBe(true)
  })

  it('does not handle generic queries', () => {
    expect(skill.canHandle({ query: 'what is typescript', projectId: 'p1' })).toBe(false)
  })

  it('reports healthy', async () => {
    const health = await skill.healthCheck()
    expect(health.healthy).toBe(true)
  })

  it('returns clean metrics initially', () => {
    const m = skill.getMetrics()
    expect(m.totalCalls).toBe(0)
    expect(m.successCount).toBe(0)
  })
})

// ========================
// RAG Fusion Skill Tests
// ========================
import { createRAGFusionSkill } from '../../electron/services/skills/rag/rag-fusion-skill'

describe('RAG Fusion Skill', () => {
  const skill = createRAGFusionSkill()

  it('has correct metadata', () => {
    expect(skill.name).toBe('rag-fusion')
    expect(skill.category).toBe('rag')
  })

  it('handles comprehensive queries', () => {
    expect(skill.canHandle({ query: 'give me a comprehensive overview', projectId: 'p1' })).toBe(true)
    expect(skill.canHandle({ query: 'provide a thorough analysis of the codebase', projectId: 'p1' })).toBe(true)
  })

  it('handles long queries', () => {
    const longQuery = 'how does the authentication system work with the database and what are the security implications of the current approach'
    expect(skill.canHandle({ query: longQuery, projectId: 'p1' })).toBe(true)
  })

  it('does not handle short simple queries', () => {
    expect(skill.canHandle({ query: 'login', projectId: 'p1' })).toBe(false)
  })

  it('executes and returns fused results', async () => {
    const result = await skill.execute({ query: 'comprehensive analysis of auth and database integration', projectId: 'p1' })
    expect(result.content).toBeTruthy()
    expect(result.metadata?.variants).toBeDefined()
  })
})
