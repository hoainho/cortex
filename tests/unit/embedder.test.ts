const { mockPrepare, mockAll, mockRun, mockTransaction, mockFetch } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockAll: vi.fn().mockReturnValue([]),
  mockRun: vi.fn(),
  mockTransaction: vi.fn((fn: Function) => fn),
  mockFetch: vi.fn()
}))

    vi.mock('../../electron/services/db', () => ({
  getDb: vi.fn().mockReturnValue({
    prepare: mockPrepare.mockReturnValue({
      all: mockAll,
      run: mockRun
    }),
    transaction: mockTransaction
  }),
  chunkQueries: {
    updateEmbedding: vi.fn().mockReturnValue({
      run: mockRun
    })
  }
}))

vi.mock('../../electron/services/settings-service', () => ({
  getProxyUrl: vi.fn().mockReturnValue('https://proxy.hoainho.info'),
  getProxyKey: vi.fn().mockReturnValue('hoainho')
}))

vi.stubGlobal('fetch', mockFetch)

import { embedQuery, embedProjectChunks } from '../../electron/services/embedder'

describe('embedQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls embedding API with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }]
      })
    })

    await embedQuery('test query')

    expect(mockFetch).toHaveBeenCalledWith(
      'https://proxy.hoainho.info/v1/embeddings',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          Authorization: 'Bearer hoainho'
        })
      })
    )

    const body = JSON.parse(mockFetch.mock.calls[0][1].body)
    expect(body.model).toBe('text-embedding-3-small')
    expect(body.input).toEqual(['test query'])
    expect(body.dimensions).toBe(1536)
  })

  it('returns embedding array from API response', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [{ embedding: [0.1, 0.2, 0.3], index: 0 }]
      })
    })

    const result = await embedQuery('test')
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('returns empty array on API failure', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server error'
    })

    await expect(embedQuery('test')).rejects.toThrow('Embedding API error 500')
  })
})

describe('embedProjectChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns 0 when no chunks need embedding', async () => {
    mockAll.mockReturnValueOnce([])
    const result = await embedProjectChunks('project-1')
    expect(result).toBe(0)
  })

  it('processes chunks and calls onProgress', async () => {
    const chunks = Array.from({ length: 5 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
      name: `func${i}`,
      relative_path: `src/file${i}.ts`,
      chunk_type: 'function'
    }))
    mockAll.mockReturnValueOnce(chunks)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: chunks.map((_, i) => ({
          embedding: [0.1, 0.2, 0.3],
          index: i
        }))
      })
    })

    const onProgress = vi.fn()
    const result = await embedProjectChunks('project-1', onProgress)

    expect(result).toBe(5)
    expect(onProgress).toHaveBeenCalledWith(5, 5)
  })

  it('continues processing on batch failure', async () => {
    // 25 chunks → 2 batches (20 + 5)
    const chunks = Array.from({ length: 25 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
      name: `func${i}`,
      relative_path: `src/file${i}.ts`,
      chunk_type: 'function'
    }))
    mockAll.mockReturnValueOnce(chunks)

    // First batch fails, second succeeds
    mockFetch
      .mockRejectedValueOnce(new Error('Network error'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: Array.from({ length: 5 }, (_, i) => ({
            embedding: [0.1, 0.2],
            index: i
          }))
        })
      })

    const result = await embedProjectChunks('project-1')
    // Only second batch succeeded
    expect(result).toBe(5)
  })

  it('uses batch size of 20', async () => {
    const chunks = Array.from({ length: 25 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
      name: null,
      relative_path: `src/file${i}.ts`,
      chunk_type: 'other'
    }))
    mockAll.mockReturnValueOnce(chunks)

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: Array.from({ length: 20 }, (_, i) => ({
          embedding: [0.1],
          index: i
        }))
      })
    })

    await embedProjectChunks('project-1')
    // Should have been called twice (batch of 20 + batch of 5)
    expect(mockFetch).toHaveBeenCalledTimes(2)
  })
})
