const { mockPrepare, mockAll, mockRun, mockTransaction } = vi.hoisted(() => ({
  mockPrepare: vi.fn(),
  mockAll: vi.fn().mockReturnValue([]),
  mockRun: vi.fn(),
  mockTransaction: vi.fn((fn: Function) => fn)
}))

const mockPipeFn = vi.hoisted(() => vi.fn())
const mockPipelineFactory = vi.hoisted(() => vi.fn())

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

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/cortex-test-models')
  }
}))

vi.mock('@huggingface/transformers', () => ({
  pipeline: mockPipelineFactory,
  env: {
    cacheDir: '',
    allowLocalModels: true,
    allowRemoteModels: true
  }
}))

async function loadEmbedder() {
  vi.resetModules()
  return await import('../../electron/services/embedder')
}

describe('embedQuery', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue([[0.1, 0.2, 0.3]])
    })
    mockPipelineFactory.mockResolvedValue(mockPipeFn)
  })

  it('calls local embedding pipeline with correct parameters', async () => {
    const { embedQuery } = await loadEmbedder()
    const result = await embedQuery('test query')

    expect(mockPipelineFactory).toHaveBeenCalledWith(
      'feature-extraction',
      'Xenova/all-MiniLM-L6-v2',
      expect.objectContaining({ dtype: 'fp32' })
    )
    expect(result).toEqual([0.1, 0.2, 0.3])
  })

  it('returns embedding array from pipeline response', async () => {
    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue([[0.5, 0.6, 0.7]])
    })

    const { embedQuery } = await loadEmbedder()
    const result = await embedQuery('test')
    expect(result).toEqual([0.5, 0.6, 0.7])
  })

  it('returns empty array when pipeline returns empty', async () => {
    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue([])
    })

    const { embedQuery } = await loadEmbedder()
    const result = await embedQuery('test')
    expect(result).toEqual([])
  })
})

describe('embedProjectChunks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue([[0.1, 0.2, 0.3]])
    })
    mockPipelineFactory.mockResolvedValue(mockPipeFn)
  })

  it('returns 0 when no chunks need embedding', async () => {
    mockAll.mockReturnValueOnce([])
    const { embedProjectChunks } = await loadEmbedder()
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

    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue(
        chunks.map(() => [0.1, 0.2, 0.3])
      )
    })

    const { embedProjectChunks } = await loadEmbedder()
    const onProgress = vi.fn()
    const result = await embedProjectChunks('project-1', onProgress)

    expect(result).toBe(5)
    expect(onProgress).toHaveBeenCalledWith(5, 5)
  })

  it('continues processing on batch failure', async () => {
    const chunks = Array.from({ length: 25 }, (_, i) => ({
      id: `chunk-${i}`,
      content: `content ${i}`,
      name: `func${i}`,
      relative_path: `src/file${i}.ts`,
      chunk_type: 'function'
    }))
    mockAll.mockReturnValueOnce(chunks)

    mockPipeFn
      .mockRejectedValueOnce(new Error('Pipeline error'))
      .mockResolvedValueOnce({
        tolist: vi.fn().mockReturnValue(
          Array.from({ length: 5 }, () => [0.1, 0.2])
        )
      })

    const { embedProjectChunks } = await loadEmbedder()
    const result = await embedProjectChunks('project-1')
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

    mockPipeFn.mockResolvedValue({
      tolist: vi.fn().mockReturnValue(
        Array.from({ length: 20 }, () => [0.1])
      )
    })

    const { embedProjectChunks } = await loadEmbedder()
    await embedProjectChunks('project-1')
    expect(mockPipeFn).toHaveBeenCalledTimes(2)
  })
})
