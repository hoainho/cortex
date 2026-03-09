/**
 * Nano-brain service tests
 *
 * Tests the CLI wrapper for nano-brain commands.
 * Mocks child_process.execFile with CALLBACK-style signatures
 * so util.promisify works correctly.
 */

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: mockExecFile
}))

import {
  initNanoBrain,
  addCollection,
  removeCollection,
  listCollections,
  getNanoBrainStatus,
  queryNanoBrain,
  searchNanoBrain,
  triggerEmbedding
} from '../../electron/services/nano-brain-service'

/**
 * Helper: configure mockExecFile to call back with given stdout/stderr.
 * util.promisify will call execFile(cmd, args, opts, callback)
 * and expects the callback(err, {stdout, stderr}) pattern.
 */
function setExecResult(stdout: string, stderr = '') {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: any, callback: Function) => {
      process.nextTick(() => callback(null, { stdout, stderr }))
    }
  )
}

function setExecResultByArgs(handler: (args: string[]) => { stdout: string; stderr: string }) {
  mockExecFile.mockImplementation(
    (_cmd: string, args: string[], _opts: any, callback: Function) => {
      const result = handler(args)
      process.nextTick(() => callback(null, result))
    }
  )
}

function setExecError(errorMsg: string) {
  mockExecFile.mockImplementation(
    (_cmd: string, _args: string[], _opts: any, callback: Function) => {
      const err = new Error(errorMsg) as any
      err.stderr = errorMsg
      err.stdout = ''
      process.nextTick(() => callback(err))
    }
  )
}

describe('initNanoBrain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('initializes workspace and adds collection', async () => {
    setExecResult('initialized')

    const result = await initNanoBrain('My Project', '/path/to/project')

    expect(result).toBe(true)
    // Should call init and then collection add
    expect(mockExecFile).toHaveBeenCalledTimes(2)
  })

  it('sanitizes project name for collection', async () => {
    setExecResult('ok')

    await initNanoBrain('My Project @#$!', '/path')

    // Second call should be collection add with sanitized name
    const secondCall = mockExecFile.mock.calls[1]
    const args = secondCall[1] as string[]
    expect(args).toContain('nano-brain')
    expect(args).toContain('collection')
    expect(args).toContain('add')
    // Sanitized name should not contain special chars
    const collectionName = args[args.indexOf('add') + 1]
    expect(collectionName).toMatch(/^[a-z0-9_-]+$/)
    expect(collectionName).toBe('my-project')
  })

  it('still returns true on CLI failure (execNanoBrain swallows errors)', async () => {
    setExecError('init failed')

    // execNanoBrain catches CLI errors and returns partial output,
    // so initNanoBrain proceeds through its try block without hitting catch
    const result = await initNanoBrain('test', '/path')
    expect(result).toBe(true)
  })
})

describe('addCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls npx nano-brain collection add', async () => {
    setExecResult('added')

    const result = await addCollection('my-project', '/path/to/project')

    expect(result).toBe(true)
    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['nano-brain', 'collection', 'add', 'my-project', '/path/to/project'],
      expect.any(Object),
      expect.any(Function)
    )
  })

  it('includes pattern arg when provided', async () => {
    setExecResult('added')

    await addCollection('test', '/path', '*.ts')

    const callArgs = mockExecFile.mock.calls[0][1] as string[]
    expect(callArgs).toContain('--pattern=*.ts')
  })
})

describe('removeCollection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls npx nano-brain collection remove', async () => {
    setExecResult('removed')

    const result = await removeCollection('my-project')

    expect(result).toBe(true)
    expect(mockExecFile).toHaveBeenCalledWith(
      'npx',
      ['nano-brain', 'collection', 'remove', 'my-project'],
      expect.any(Object),
      expect.any(Function)
    )
  })
})

describe('listCollections', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses collection names from output', async () => {
    setExecResult('Collections:\n---\nmy-project\ncortex\ntest-repo\n')

    const collections = await listCollections()

    expect(collections).toEqual(['my-project', 'cortex', 'test-repo'])
  })

  it('returns empty array on failure', async () => {
    setExecError('command not found')

    const collections = await listCollections()
    expect(collections).toEqual([])
  })
})

describe('getNanoBrainStatus', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses status output correctly', async () => {
    setExecResultByArgs((args) => {
      if (args.includes('status')) {
        return { stdout: 'nano-brain v1.0\nembeddings: ready\n42 chunks indexed\n', stderr: '' }
      }
      // listCollections call
      return { stdout: 'Collections:\n---\nmy-project\n', stderr: '' }
    })

    const status = await getNanoBrainStatus()

    expect(status.initialized).toBe(true)
    expect(status.totalChunks).toBe(42)
    expect(status.embeddingStatus).toBe('ready')
    expect(status.collections).toEqual(['my-project'])
  })

  it('detects not initialized state', async () => {
    setExecResultByArgs((args) => {
      if (args.includes('status')) {
        return { stdout: 'not initialized', stderr: '' }
      }
      return { stdout: '', stderr: '' }
    })

    const status = await getNanoBrainStatus()
    expect(status.initialized).toBe(false)
  })

  it('returns default status on failure', async () => {
    setExecError('failed')

    const status = await getNanoBrainStatus()

    expect(status).toEqual({
      initialized: false,
      collections: [],
      totalChunks: 0,
      embeddingStatus: 'unknown'
    })
  })
})

describe('queryNanoBrain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('parses JSON array results', async () => {
    setExecResult(JSON.stringify([
      { content: 'auth code', filePath: 'src/auth.ts', score: 0.9, collection: 'project' },
      { content: 'login code', filePath: 'src/login.ts', score: 0.7, collection: 'project' }
    ]))

    const results = await queryNanoBrain('authentication')

    expect(results).toHaveLength(2)
    expect(results[0].content).toBe('auth code')
    expect(results[0].score).toBe(0.9)
    expect(results[1].filePath).toBe('src/login.ts')
  })

  it('parses wrapped results format', async () => {
    setExecResult(JSON.stringify({
      results: [{ text: 'some code', file: 'src/main.ts', score: 0.8, source: 'cortex' }]
    }))

    const results = await queryNanoBrain('main')

    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('some code')
    expect(results[0].filePath).toBe('src/main.ts')
    expect(results[0].collection).toBe('cortex')
  })

  it('returns empty array on empty output', async () => {
    setExecResult('')

    const results = await queryNanoBrain('nothing')
    expect(results).toEqual([])
  })

  it('passes limit and collection options', async () => {
    setExecResult('[]')

    await queryNanoBrain('test', { limit: 5, collection: 'my-project' })

    const callArgs = mockExecFile.mock.calls[0][1] as string[]
    expect(callArgs).toContain('-n')
    expect(callArgs).toContain('5')
    expect(callArgs).toContain('-c')
    expect(callArgs).toContain('my-project')
  })

  it('returns empty array on parse failure', async () => {
    setExecResult('not json at all')

    const results = await queryNanoBrain('bad output')
    expect(results).toEqual([])
  })
})

describe('searchNanoBrain', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('calls search command and parses results', async () => {
    setExecResult(JSON.stringify([
      { content: 'exact match', filePath: 'src/exact.ts', score: 1.0, collection: 'proj' }
    ]))

    const results = await searchNanoBrain('exactTerm')

    expect(results).toHaveLength(1)
    expect(results[0].content).toBe('exact match')
    expect(results[0].score).toBe(1.0)
  })
})

describe('triggerEmbedding', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns true on success', async () => {
    setExecResult('Embedded 42 chunks')

    const result = await triggerEmbedding()
    expect(result).toBe(true)
  })

  it('still returns true on CLI failure (errors swallowed by execNanoBrain)', async () => {
    setExecError('embed failed')

    // execNanoBrain swallows errors, so triggerEmbedding completes its try block
    const result = await triggerEmbedding()
    expect(result).toBe(true)
  })
})

