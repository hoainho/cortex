import { buildPrompt, type ChatMode, type ChatMessage } from '../../electron/services/llm-client'
import type { SearchResult } from '../../electron/services/vector-search'

// Mock electron's BrowserWindow
vi.mock('electron', () => ({
  BrowserWindow: class {
    webContents = { send: vi.fn() }
  }
}))

function makeContext(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: 'chunk-1',
    score: 0.9,
    content: 'function hello() { return "world" }',
    filePath: '/repo/src/hello.ts',
    relativePath: 'src/hello.ts',
    language: 'typescript',
    chunkType: 'function',
    name: 'hello',
    lineStart: 1,
    lineEnd: 3,
    dependencies: ['react'],
    exports: ['hello'],
    ...overrides
  }
}

describe('buildPrompt', () => {
  const projectName = 'Test Project'
  const brainName = 'Atlas'

  describe('engineering mode', () => {
    it('uses engineering system prompt', () => {
      const { messages } = buildPrompt('engineering', 'How does auth work?', [], projectName, brainName)
      const system = messages[0]
      expect(system.role).toBe('system')
      expect(system.content).toContain('Senior Tech Lead')
      expect(system.content).toContain('code blocks')
      expect(system.content).toContain('file paths')
    })

    it('includes project name and brain name', () => {
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName)
      expect(messages[0].content).toContain('Test Project')
      expect(messages[0].content).toContain('Atlas')
    })
  })

  describe('pm mode', () => {
    it('uses PM system prompt with emoji format', () => {
      const { messages } = buildPrompt('pm', 'Impact analysis?', [], projectName, brainName)
      const system = messages[0]
      expect(system.role).toBe('system')
      expect(system.content).toContain('Product Manager')
      expect(system.content).toContain('📋')
      expect(system.content).toContain('📊')
      expect(system.content).toContain('⚠️')
      expect(system.content).toContain('⏱️')
      expect(system.content).toContain('💡')
      expect(system.content).toContain('❓')
    })
  })

  describe('context injection', () => {
    it('includes context chunks in system prompt', () => {
      const context = [makeContext()]
      const { messages } = buildPrompt('engineering', 'test', context, projectName, brainName)
      const system = messages[0].content
      expect(system).toContain('src/hello.ts')
      expect(system).toContain('hello')
      expect(system).toContain('function')
      expect(system).toContain('L1-3')
    })

    it('formats multiple context chunks with index', () => {
      const context = [
        makeContext({ chunkId: 'c1', relativePath: 'src/a.ts', name: 'funcA' }),
        makeContext({ chunkId: 'c2', relativePath: 'src/b.ts', name: 'funcB' })
      ]
      const { messages } = buildPrompt('engineering', 'test', context, projectName, brainName)
      const system = messages[0].content
      expect(system).toContain('[1/2]')
      expect(system).toContain('[2/2]')
      expect(system).toContain('src/a.ts')
      expect(system).toContain('src/b.ts')
    })
  })

  describe('directory tree', () => {
    it('includes directory tree when provided', () => {
      const tree = 'src/\n  index.ts\n  utils.ts'
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName, tree)
      expect(messages[0].content).toContain('src/')
      expect(messages[0].content).toContain('index.ts')
    })

    it('truncates large directory trees to 3000 chars', () => {
      const tree = 'x'.repeat(5000)
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName, tree)
      // The tree is sliced to 3000 chars
      expect(messages[0].content).not.toContain('x'.repeat(5000))
    })

    it('omits directory tree when null', () => {
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName, null)
      expect(messages[0].content).not.toContain('Cấu trúc thư mục')
    })
  })

  describe('conversation history', () => {
    it('includes conversation history', () => {
      const history: ChatMessage[] = [
        { role: 'user', content: 'Previous question' },
        { role: 'assistant', content: 'Previous answer' }
      ]
      const { messages } = buildPrompt('engineering', 'New question', [], projectName, brainName, null, history)
      expect(messages).toHaveLength(4) // system + 2 history + user
      expect(messages[1].content).toBe('Previous question')
      expect(messages[2].content).toBe('Previous answer')
      expect(messages[3].content).toBe('New question')
    })

    it('limits history to last 10 messages', () => {
      const history: ChatMessage[] = Array.from({ length: 15 }, (_, i) => ({
        role: 'user' as const,
        content: `Message ${i}`
      }))
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName, null, history)
      // system + 10 history + user = 12
      expect(messages).toHaveLength(12)
    })

    it('handles empty history', () => {
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName, null, [])
      expect(messages).toHaveLength(2) // system + user
    })
  })

  describe('message structure', () => {
    it('first message is system', () => {
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName)
      expect(messages[0].role).toBe('system')
    })

    it('last message is user query', () => {
      const { messages } = buildPrompt('engineering', 'What is this?', [], projectName, brainName)
      const last = messages[messages.length - 1]
      expect(last.role).toBe('user')
      expect(last.content).toBe('What is this?')
    })

    it('returns at least 2 messages (system + user)', () => {
      const { messages } = buildPrompt('engineering', 'test', [], projectName, brainName)
      expect(messages.length).toBeGreaterThanOrEqual(2)
    })
  })
})
