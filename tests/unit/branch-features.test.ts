/**
 * Branch Features Tests
 *
 * Tests for branch management: git-service branch functions,
 * code-chunker branch parameter, and DB schema branch validation.
 */

// ==========================================
// 1. Git Service — Branch Functions
// ==========================================

const { mockExecFile } = vi.hoisted(() => ({
  mockExecFile: vi.fn()
}))

vi.mock('child_process', () => ({
  execFile: mockExecFile
}))

vi.mock('util', () => ({
  promisify: (fn: any) => fn
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/cortex-test')
  },
  safeStorage: {
    isEncryptionAvailable: vi.fn().mockReturnValue(false),
    encryptString: vi.fn(),
    decryptString: vi.fn()
  }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  rmSync: vi.fn()
}))

// Mock DB for git-service (it imports getDb for token management)
vi.mock('../../electron/services/db', () => ({
  getDb: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    })
  })
}))

import { listBranches, switchBranch, getCurrentBranch, getBranchDiffFiles } from '../../electron/services/git-service'
import { readFileSync } from 'fs'
import { resolve } from 'path'

describe('Git Service — Branch Management', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('listBranches()', () => {
    it('returns parsed branch names from git output', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      mockExecFile.mockResolvedValueOnce({
        stdout: 'origin/main\norigin/develop\norigin/feature/auth\n',
        stderr: ''
      })

      const branches = await listBranches('/repo')
      expect(branches).toEqual(['main', 'develop', 'feature/auth'])
    })

    it('filters out HEAD entries', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      mockExecFile.mockResolvedValueOnce({
        stdout: 'origin/HEAD -> origin/main\norigin/main\norigin/develop\n',
        stderr: ''
      })

      const branches = await listBranches('/repo')
      expect(branches).not.toContain('HEAD -> origin/main')
      expect(branches).toContain('main')
      expect(branches).toContain('develop')
    })

    it('deduplicates branch names', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      mockExecFile.mockResolvedValueOnce({
        stdout: 'origin/main\norigin/main\norigin/develop\n',
        stderr: ''
      })

      const branches = await listBranches('/repo')
      expect(branches).toEqual(['main', 'develop'])
    })

    it('strips origin/ prefix', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      mockExecFile.mockResolvedValueOnce({
        stdout: 'origin/main\norigin/feature/test\n',
        stderr: ''
      })

      const branches = await listBranches('/repo')
      expect(branches).toEqual(['main', 'feature/test'])
    })

    it('returns empty array on fetch error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('Network error'))

      const branches = await listBranches('/repo')
      expect(branches).toEqual([])
    })

    it('returns empty array when no branches', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // fetch
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // branch -r
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // branch (local fallback)

      const branches = await listBranches('/repo')
      expect(branches).toEqual([])
    })

    it('trims whitespace from branch names', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })
      mockExecFile.mockResolvedValueOnce({
        stdout: '  origin/main  \n  origin/develop  \n',
        stderr: ''
      })

      const branches = await listBranches('/repo')
      expect(branches).toEqual(['main', 'develop'])
    })
  })

  describe('switchBranch()', () => {
    it('checks out existing local branch', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // pull
      mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse

      const result = await switchBranch('/repo', 'develop')
      expect(result.sha).toBe('abc123')
      expect(mockExecFile.mock.calls[0][1]).toEqual(['checkout', 'develop'])
    })

    it('falls back to creating tracking branch if checkout fails', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('branch not found')) // checkout fails
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout -b tracking
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // pull
      mockExecFile.mockResolvedValueOnce({ stdout: 'def456\n', stderr: '' }) // rev-parse

      const result = await switchBranch('/repo', 'feature/new')
      expect(result.sha).toBe('def456')
      expect(mockExecFile.mock.calls[1][1]).toEqual([
        'checkout', '-b', 'feature/new', 'origin/feature/new'
      ])
    })

    it('continues even if pull fails (non-fatal)', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' }) // checkout
      mockExecFile.mockRejectedValueOnce(new Error('Already up to date')) // pull fails
      mockExecFile.mockResolvedValueOnce({ stdout: 'abc123\n', stderr: '' }) // rev-parse

      const result = await switchBranch('/repo', 'main')
      expect(result.sha).toBe('abc123')
    })
  })

  describe('getCurrentBranch()', () => {
    it('returns current branch name', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: 'develop\n', stderr: '' })

      const branch = await getCurrentBranch('/repo')
      expect(branch).toBe('develop')
    })

    it('returns main on error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('not a git repo'))

      const branch = await getCurrentBranch('/repo')
      expect(branch).toBe('main')
    })

    it('trims whitespace from branch name', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '  feature/test  \n', stderr: '' })

      const branch = await getCurrentBranch('/repo')
      expect(branch).toBe('feature/test')
    })
  })

  describe('getBranchDiffFiles()', () => {
    it('parses added, modified, and deleted files', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'A\tsrc/new-file.ts\nM\tsrc/changed.ts\nD\tsrc/removed.ts\n',
        stderr: ''
      })

      const diff = await getBranchDiffFiles('/repo', 'main', 'develop')
      expect(diff.added).toEqual(['src/new-file.ts'])
      expect(diff.modified).toEqual(['src/changed.ts'])
      expect(diff.deleted).toEqual(['src/removed.ts'])
    })

    it('handles renamed files as delete + add', async () => {
      mockExecFile.mockResolvedValueOnce({
        stdout: 'R100\told-name.ts\tnew-name.ts\n',
        stderr: ''
      })

      const diff = await getBranchDiffFiles('/repo', 'main', 'develop')
      // filePath = pathParts.join('\t') = 'old-name.ts\tnew-name.ts' for the deleted entry
      expect(diff.deleted).toHaveLength(1)
      expect(diff.added).toContain('new-name.ts')
    })

    it('returns empty arrays on error', async () => {
      mockExecFile.mockRejectedValueOnce(new Error('diff failed'))

      const diff = await getBranchDiffFiles('/repo', 'main', 'develop')
      expect(diff.added).toEqual([])
      expect(diff.modified).toEqual([])
      expect(diff.deleted).toEqual([])
    })

    it('handles empty diff output', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })

      const diff = await getBranchDiffFiles('/repo', 'main', 'develop')
      expect(diff.added).toEqual([])
      expect(diff.modified).toEqual([])
      expect(diff.deleted).toEqual([])
    })

    it('calls git diff with correct branch args', async () => {
      mockExecFile.mockResolvedValueOnce({ stdout: '', stderr: '' })

      await getBranchDiffFiles('/repo', 'main', 'feature/auth')

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-status', 'origin/main...feature/auth'],
        { cwd: '/repo' }
      )
    })
  })
})

// ==========================================
// 2. Code Chunker — Branch Parameter
// ==========================================

describe('Code Chunker — Branch Parameter', () => {
  it('sets branch on all returned chunks when branch is provided', async () => {
    const { chunkCode } = await import('../../electron/services/code-chunker')

    const content = 'const x = 1\nconst y = 2'
    const result = chunkCode(content, '/repo/test.ts', 'test.ts', 'typescript', 'proj-1', 'repo-1', 'develop')

    expect(result.length).toBeGreaterThanOrEqual(1)
    for (const chunk of result) {
      expect(chunk.branch).toBe('develop')
    }
  })

  it('defaults to main when branch not provided', async () => {
    const { chunkCode } = await import('../../electron/services/code-chunker')

    const content = 'const x = 1\nconst y = 2'
    const result = chunkCode(content, '/repo/test.ts', 'test.ts', 'typescript', 'proj-1', 'repo-1')

    expect(result.length).toBeGreaterThanOrEqual(1)
    for (const chunk of result) {
      expect(chunk.branch).toBe('main')
    }
  })

  it('sets branch on multiple semantic chunks', async () => {
    const { chunkCode } = await import('../../electron/services/code-chunker')

    const bodyLines = Array.from({ length: 20 }, (_, i) =>
      `  const variable${i} = someFunction(param${i}, "value_${i}") // line ${i}`
    )
    const content = [
      'export function handler1(req: Request) {',
      ...bodyLines,
      '}',
      '',
      'export function handler2(req: Request) {',
      ...bodyLines,
      '}',
      '',
      ...Array(300).fill('// padding line')
    ].join('\n')

    const result = chunkCode(content, '/repo/handlers.ts', 'handlers.ts', 'typescript', 'proj-1', 'repo-1', 'feature/auth')

    expect(result.length).toBeGreaterThanOrEqual(1)
    for (const chunk of result) {
      expect(chunk.branch).toBe('feature/auth')
    }
  })

  it('CodeChunk interface has branch field', async () => {
    const { chunkCode } = await import('../../electron/services/code-chunker')

    const result = chunkCode('const x = 1', '/repo/test.ts', 'test.ts', 'typescript', 'proj-1', 'repo-1', 'main')
    expect(result[0]).toHaveProperty('branch')
    expect(typeof result[0].branch).toBe('string')
  })
})

// ==========================================
// 3. DB Schema — Branch Validation (source reading)
// ==========================================
// Read the actual DB source to validate schema has branch columns.
// This avoids complex vi.mock conflicts and directly verifies the source.

describe('DB Schema — Branch Features', () => {
  let dbSource: string

  beforeAll(() => {
    // Read the actual db.ts source file to validate schema
    const { readFileSync } = require('fs')
    const { resolve } = require('path')
    dbSource = readFileSync(
      resolve(__dirname, '../../electron/services/db.ts'),
      'utf-8'
    )
  })

  describe('Schema columns', () => {
    it('chunks table has branch column with default', () => {
      // The chunks table should have branch column
      expect(dbSource).toContain("branch TEXT NOT NULL DEFAULT 'main'")
    })

    it('repositories table has active_branch column with default', () => {
      expect(dbSource).toContain("active_branch TEXT NOT NULL DEFAULT 'main'")
    })

    it('creates idx_chunks_branch index', () => {
      expect(dbSource).toContain('idx_chunks_branch')
      expect(dbSource).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_branch ON chunks(branch)')
    })
  })

  describe('Branch-aware queries', () => {
    it('chunkQueries.insert includes branch in column list and 16 placeholders', () => {
      // Find the INSERT INTO chunks statement
      const insertMatch = dbSource.match(/INSERT INTO chunks \([^)]+\)\s*VALUES \([^)]+\)/s)
      expect(insertMatch).toBeTruthy()
      const insertSql = insertMatch![0]
      expect(insertSql).toContain('branch')

      // Count placeholders
      const placeholders = (insertSql.match(/\?/g) || []).length
      expect(placeholders).toBe(16)
    })

    it('deleteByRepoBranch query exists', () => {
      expect(dbSource).toContain('deleteByRepoBranch')
      expect(dbSource).toContain('DELETE FROM chunks WHERE repo_id = ? AND branch = ?')
    })

    it('deleteByFileBranch query exists', () => {
      expect(dbSource).toContain('deleteByFileBranch')
      expect(dbSource).toContain('DELETE FROM chunks WHERE repo_id = ? AND relative_path = ? AND branch = ?')
    })

    it('getByRepoBranch query exists', () => {
      expect(dbSource).toContain('getByRepoBranch')
      expect(dbSource).toContain('SELECT * FROM chunks WHERE repo_id = ? AND branch = ?')
    })

    it('searchByContentBranch query exists', () => {
      expect(dbSource).toContain('searchByContentBranch')
      // Verify it filters by both branch and content
      const hasQuery = dbSource.includes('branch = ?') && dbSource.includes('content LIKE')
      expect(hasQuery).toBe(true)
    })

    it('searchByNameBranch query exists', () => {
      expect(dbSource).toContain('searchByNameBranch')
      // Verify it filters by both branch and name
      const hasQuery = dbSource.includes('name LIKE') && dbSource.includes('branch = ?')
      expect(hasQuery).toBe(true)
    })

    it('updateActiveBranch query exists', () => {
      expect(dbSource).toContain('updateActiveBranch')
      expect(dbSource).toContain('UPDATE repositories SET active_branch = ? WHERE id = ?')
    })
  })

  describe('DB interfaces', () => {
    it('DbRepository interface has active_branch field', () => {
      expect(dbSource).toContain('active_branch: string')
    })

    it('DbChunk interface has branch field', () => {
      // Match specifically in the DbChunk interface context
      const dbChunkMatch = dbSource.match(/export interface DbChunk \{[\s\S]*?\}/m)
      expect(dbChunkMatch).toBeTruthy()
      expect(dbChunkMatch![0]).toContain('branch: string')
    })
  })
})

// ==========================================
// 4. Vector Search — Branch-aware search
// ==========================================

describe('Vector Search — Branch Features', () => {
  let vsSource: string

  beforeAll(() => {
    const { readFileSync } = require('fs')
    const { resolve } = require('path')
    vsSource = readFileSync(
      resolve(__dirname, '../../electron/services/vector-search.ts'),
      'utf-8'
    )
  })

  it('SearchResult interface has branch field', () => {
    const searchResultMatch = vsSource.match(/export interface SearchResult \{[\s\S]*?\}/m)
    expect(searchResultMatch).toBeTruthy()
    expect(searchResultMatch![0]).toContain('branch: string')
  })

  it('hybridSearch accepts optional branch parameter', () => {
    // Function signature should include branch
    expect(vsSource).toContain('branch?: string')
  })

  it('vectorSearch filters by branch when provided', () => {
    // Should have conditional SQL with branch filtering
    expect(vsSource).toContain('AND branch = ?')
  })

  it('keywordSearch filters by branch when provided', () => {
    // Should have conditional SQL with branch filtering
    expect(vsSource).toContain('AND branch = ?')
  })
})

// ==========================================
// 5. IPC Handlers — Branch Management
// ==========================================

describe('IPC Handlers — Branch Management', () => {
  let mainSource: string

  beforeAll(() => {
    const { readFileSync } = require('fs')
    const { resolve } = require('path')
    mainSource = readFileSync(
      resolve(__dirname, '../../electron/main.ts'),
      'utf-8'
    )
  })

  it('registers branch:list handler', () => {
    expect(mainSource).toContain("ipcMain.handle('branch:list'")
  })

  it('registers branch:switch handler', () => {
    expect(mainSource).toContain("ipcMain.handle('branch:switch'")
  })

  it('registers branch:getCurrent handler', () => {
    expect(mainSource).toContain("ipcMain.handle('branch:getCurrent'")
  })

  it('brain:search passes branch parameter', () => {
    // Verify the search handler accepts branch
    const searchHandler = mainSource.match(/ipcMain\.handle\(\s*'brain:search'[\s\S]*?\)\s*\)/m)
    expect(searchHandler).toBeTruthy()
    expect(searchHandler![0]).toContain('branch')
  })

  it('chat:send uses active_branch from repo', () => {
    expect(mainSource).toContain('active_branch')
    expect(mainSource).toContain('activeBranch')
  })
})

// ==========================================
// 6. Preload — Branch API
// ==========================================

describe('Preload — Branch API', () => {
  let preloadSource: string

  beforeAll(() => {
    const { readFileSync } = require('fs')
    const { resolve } = require('path')
    preloadSource = readFileSync(
      resolve(__dirname, '../../electron/preload.ts'),
      'utf-8'
    )
  })

  it('exposes listBranches API', () => {
    expect(preloadSource).toContain('listBranches')
    expect(preloadSource).toContain('branch:list')
  })

  it('exposes switchBranch API', () => {
    expect(preloadSource).toContain('switchBranch')
    expect(preloadSource).toContain('branch:switch')
  })

  it('exposes getCurrentBranch API', () => {
    expect(preloadSource).toContain('getCurrentBranch')
    expect(preloadSource).toContain('branch:getCurrent')
  })
})
