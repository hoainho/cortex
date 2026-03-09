// Use vi.hoisted so mock fns are available inside vi.mock factory
const { mockExec, mockPragma, mockClose, mockPrepare } = vi.hoisted(() => ({
  mockExec: vi.fn(),
  mockPragma: vi.fn(),
  mockClose: vi.fn(),
  mockPrepare: vi.fn().mockReturnValue({
    run: vi.fn(),
    get: vi.fn(),
    all: vi.fn()
  })
}))

vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn()
}))

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn().mockReturnValue('/tmp/cortex-test')
  }
}))

vi.mock('better-sqlite3', () => {
  const MockDatabase = vi.fn(function (this: any) {
    this.pragma = mockPragma
    this.exec = mockExec
    this.prepare = mockPrepare
    this.close = mockClose
    this.transaction = vi.fn((fn: Function) => fn)
  })
  return { default: MockDatabase }
})

import { getDb, closeDb, projectQueries, repoQueries, chunkQueries, messageQueries, conversationQueries } from '../../electron/services/db'

describe('Database', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    closeDb()
  })

  describe('getDb()', () => {
    it('creates database and initializes schema', () => {
      const db = getDb()
      expect(db).toBeDefined()
      expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL')
      expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON')
      expect(mockExec).toHaveBeenCalled()
    })

    it('schema includes all required tables', () => {
      getDb()
      const schemaCall = mockExec.mock.calls[0][0] as string
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS projects')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS repositories')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS chunks')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS conversations')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS messages')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS audit_logs')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS github_tokens')
      expect(schemaCall).toContain('CREATE TABLE IF NOT EXISTS project_directory_trees')
    })

    it('returns same instance on second call (singleton)', () => {
      const db1 = getDb()
      const callCount = mockExec.mock.calls.length
      const db2 = getDb()
      expect(db1).toBe(db2)
      expect(mockExec).toHaveBeenCalledTimes(callCount)
    })
  })

  describe('closeDb()', () => {
    it('closes database', () => {
      getDb()
      closeDb()
      expect(mockClose).toHaveBeenCalled()
    })

    it('allows new instance after close', () => {
      getDb()
      const callCount = mockExec.mock.calls.length
      closeDb()
      getDb()
      expect(mockExec.mock.calls.length).toBe(callCount * 2)
    })
  })

  describe('projectQueries', () => {
    it('create prepares INSERT statement', () => {
      const db = getDb()
      projectQueries.create(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO projects')
      )
    })

    it('getAll prepares SELECT statement', () => {
      const db = getDb()
      projectQueries.getAll(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT * FROM projects')
      )
    })

    it('getById prepares SELECT with WHERE', () => {
      const db = getDb()
      projectQueries.getById(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = ?')
      )
    })

    it('delete prepares DELETE statement', () => {
      const db = getDb()
      projectQueries.delete(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM projects')
      )
    })

    it('updateName prepares UPDATE statement', () => {
      const db = getDb()
      projectQueries.updateName(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE projects SET name')
      )
    })
  })

  describe('repoQueries', () => {
    it('create prepares INSERT statement', () => {
      const db = getDb()
      repoQueries.create(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO repositories')
      )
    })

    it('getByProject prepares SELECT with project_id', () => {
      const db = getDb()
      repoQueries.getByProject(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_id = ?')
      )
    })

    it('updateStatus prepares UPDATE statement', () => {
      const db = getDb()
      repoQueries.updateStatus(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE repositories SET status')
      )
    })

    it('delete prepares DELETE statement', () => {
      const db = getDb()
      repoQueries.delete(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM repositories')
      )
    })
  })

  describe('chunkQueries', () => {
    it('insert prepares INSERT statement', () => {
      const db = getDb()
      chunkQueries.insert(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO chunks')
      )
    })

    it('deleteByRepo prepares DELETE with repo_id', () => {
      const db = getDb()
      chunkQueries.deleteByRepo(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM chunks WHERE repo_id')
      )
    })

    it('deleteByFile prepares DELETE with repo_id AND relative_path', () => {
      const db = getDb()
      chunkQueries.deleteByFile(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE repo_id = ? AND relative_path')
      )
    })

    it('countByProject prepares COUNT query', () => {
      const db = getDb()
      chunkQueries.countByProject(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('SELECT COUNT(*)')
      )
    })

    it('updateEmbedding prepares UPDATE with embedding', () => {
      const db = getDb()
      chunkQueries.updateEmbedding(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE chunks SET embedding')
      )
    })
  })

  describe('messageQueries', () => {
    it('create prepares INSERT statement', () => {
      const db = getDb()
      messageQueries.create(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO messages')
      )
    })

    it('getByConversation prepares SELECT with conversation_id', () => {
      const db = getDb()
      messageQueries.getByConversation(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE conversation_id = ?')
      )
    })

    it('updateContent prepares UPDATE for message content by ID', () => {
      const db = getDb()
      messageQueries.updateContent(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE messages SET content')
      )
    })
  })

  describe('conversationQueries', () => {
    it('create prepares INSERT statement', () => {
      const db = getDb()
      conversationQueries.create(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO conversations')
      )
    })

    it('getByProject prepares SELECT with project_id', () => {
      const db = getDb()
      conversationQueries.getByProject(db)
      expect(mockPrepare).toHaveBeenCalledWith(
        expect.stringContaining('WHERE project_id = ?')
      )
    })
  })

  describe('schema indexes', () => {
    it('creates required indexes', () => {
      getDb()
      const schema = mockExec.mock.calls[0][0] as string
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_project')
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_repo')
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_file')
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_type')
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_chunks_name')
      expect(schema).toContain('CREATE INDEX IF NOT EXISTS idx_messages_conversation')
    })
  })
})
