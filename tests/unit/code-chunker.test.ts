import { chunkCode, type CodeChunk } from '../../electron/services/code-chunker'

const PROJECT_ID = 'test-project'
const REPO_ID = 'test-repo'

function chunk(content: string, language: string, filePath = 'test.ts'): CodeChunk[] {
  return chunkCode(content, `/repo/${filePath}`, filePath, language, PROJECT_ID, REPO_ID)
}

describe('chunkCode', () => {
  describe('small files', () => {
    it('returns single chunk for small files', () => {
      const content = 'const x = 1\nconst y = 2'
      const result = chunk(content, 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe(content)
      expect(result[0].lineStart).toBe(1)
      expect(result[0].lineEnd).toBe(2)
    })

    it('sets correct metadata on single chunk', () => {
      const result = chunk('const x = 1', 'typescript')
      expect(result[0].projectId).toBe(PROJECT_ID)
      expect(result[0].repoId).toBe(REPO_ID)
      expect(result[0].language).toBe('typescript')
      expect(result[0].id).toBeTruthy()
      expect(result[0].tokenEstimate).toBeGreaterThan(0)
    })
  })

  describe('config files', () => {
    it('returns single config chunk for JSON', () => {
      const content = '{\n' + '  "key": "value",\n'.repeat(500) + '}'
      const result = chunk(content, 'json', 'config.json')
      expect(result).toHaveLength(1)
      expect(result[0].chunkType).toBe('config')
    })

    it('truncates huge JSON files', () => {
      const content = '{\n' + '  "key": "value",\n'.repeat(2000) + '}'
      const result = chunk(content, 'json', 'huge.json')
      expect(result).toHaveLength(1)
      expect(result[0].content).toContain('// ... truncated')
    })
  })

  describe('TypeScript semantic chunking', () => {
    // Helper to generate function body lines (each ~50 chars) to ensure chunk > MIN_CHUNK_TOKENS
    const bodyLines = (n: number) => Array.from({ length: n }, (_, i) =>
      `  const variable${i} = someFunction(param${i}, "value_${i}") // line ${i}`
    )

    it('chunks exported functions separately', () => {
      const content = [
        'import { foo } from "bar"',
        '',
        'export function handleRequest(req: Request) {',
        ...bodyLines(20),
        '}',
        '',
        'export function handleResponse(res: Response) {',
        ...bodyLines(20),
        '}',
        '',
        ...Array(300).fill('// padding line to make file large enough')
      ].join('\n')

      const result = chunk(content, 'typescript')
      const funcChunks = result.filter((c) => c.chunkType === 'function')
      expect(funcChunks.length).toBeGreaterThanOrEqual(2)

      const names = funcChunks.map((c) => c.name)
      expect(names).toContain('handleRequest')
      expect(names).toContain('handleResponse')
    })

    it('chunks classes separately', () => {
      const content = [
        'export class UserService {',
        '  private db: Database',
        '',
        '  constructor(db: Database) {',
        ...bodyLines(10),
        '  }',
        '',
        '  async getUser(id: string) {',
        ...bodyLines(10),
        '  }',
        '}',
        '',
        ...Array(300).fill('// padding line to make file large enough for semantic chunking')
      ].join('\n')

      const result = chunk(content, 'typescript')
      const classChunks = result.filter((c) => c.chunkType === 'class')
      expect(classChunks.length).toBeGreaterThanOrEqual(1)
      expect(classChunks[0].name).toBe('UserService')
    })

    it('detects arrow functions as functions', () => {
      const content = [
        'export const handler = async (req: Request) => {',
        ...bodyLines(20),
        '}',
        '',
        ...Array(300).fill('// padding line to make file large enough for semantic chunking')
      ].join('\n')

      const result = chunk(content, 'typescript')
      const funcChunks = result.filter((c) => c.chunkType === 'function')
      expect(funcChunks.some((c) => c.name === 'handler')).toBe(true)
    })

    it('detects interfaces', () => {
      const content = [
        'export interface UserConfig {',
        ...Array.from({ length: 15 }, (_, i) => `  field${i}: string`),
        '}',
        '',
        ...Array(300).fill('// padding line to make file large enough for semantic chunking')
      ].join('\n')

      const result = chunk(content, 'typescript')
      const ifaceChunks = result.filter((c) => c.chunkType === 'interface')
      expect(ifaceChunks.some((c) => c.name === 'UserConfig')).toBe(true)
    })
  })

  describe('Python semantic chunking', () => {
    it('chunks functions and classes', () => {
      const content = [
        'import os',
        '',
        'def process_data(input_file):',
        ...Array.from({ length: 15 }, (_, i) => `    variable_${i} = some_function(param_${i}, "value_${i}")`),
        '    return data',
        '',
        'class DataProcessor:',
        '    def __init__(self):',
        ...Array.from({ length: 15 }, (_, i) => `        self.attr_${i} = None`),
        '',
        '    def run(self):',
        '        pass',
        '',
        ...Array(300).fill('# padding line to make file large enough for semantic chunking')
      ].join('\n')

      const result = chunk(content, 'python', 'main.py')
      const funcChunks = result.filter((c) => c.chunkType === 'function')
      const classChunks = result.filter((c) => c.chunkType === 'class')
      expect(funcChunks.some((c) => c.name === 'process_data')).toBe(true)
      expect(classChunks.some((c) => c.name === 'DataProcessor')).toBe(true)
    })
  })

  describe('Go semantic chunking', () => {
    it('chunks Go functions and structs', () => {
      const content = [
        'package main',
        '',
        'func main() {',
        ...Array.from({ length: 15 }, (_, i) => `    variable${i} := someFunction(param${i})`),
        '}',
        '',
        'type Config struct {',
        ...Array.from({ length: 15 }, (_, i) => `    Field${i} string`),
        '}',
        '',
        ...Array(300).fill('// padding line to make file large enough for semantic chunking')
      ].join('\n')

      const result = chunk(content, 'go', 'main.go')
      const funcChunks = result.filter((c) => c.chunkType === 'function')
      const classChunks = result.filter((c) => c.chunkType === 'class')
      expect(funcChunks.some((c) => c.name === 'main')).toBe(true)
      expect(classChunks.some((c) => c.name === 'Config')).toBe(true)
    })
  })

  describe('Markdown chunking', () => {
    it('splits by headings', () => {
      const content = [
        '# Introduction',
        'This is the intro paragraph.',
        '',
        '## Getting Started',
        'Install the package.',
        '',
        '## Usage',
        'Import and use it.',
        '',
        ...Array(300).fill('More content here.')
      ].join('\n')

      const result = chunk(content, 'markdown', 'README.md')
      expect(result.length).toBeGreaterThanOrEqual(1)
      for (const c of result) {
        expect(c.chunkType).toBe('documentation')
        expect(c.language).toBe('markdown')
      }
    })
  })

  describe('fallback chunking', () => {
    it('falls back to sliding window for unrecognized patterns', () => {
      // Create content with no recognizable patterns but large enough to need chunking
      const content = Array(500).fill('random line of unstructured content here abcdef').join('\n')
      const result = chunk(content, 'text', 'data.txt')
      expect(result.length).toBeGreaterThanOrEqual(1)
      for (const c of result) {
        expect(c.content.length).toBeGreaterThan(0)
      }
    })
  })

  describe('import extraction', () => {
    it('extracts TypeScript imports', () => {
      const content = 'import { foo } from "bar"\nimport baz from "qux"\nconst x = 1'
      const result = chunk(content, 'typescript')
      expect(result[0].dependencies).toContain('bar')
      expect(result[0].dependencies).toContain('qux')
    })

    it('extracts require() imports', () => {
      const content = 'const fs = require("fs")\nconst path = require("path")\nconst x = 1'
      const result = chunk(content, 'javascript', 'index.js')
      expect(result[0].dependencies).toContain('fs')
      expect(result[0].dependencies).toContain('path')
    })

    it('extracts Python imports', () => {
      const content = 'import os\nfrom pathlib import Path\nx = 1'
      const result = chunk(content, 'python', 'main.py')
      expect(result[0].dependencies).toContain('os')
      expect(result[0].dependencies).toContain('pathlib')
    })
  })

  describe('export extraction', () => {
    it('extracts TypeScript exports', () => {
      const content = 'export function foo() {}\nexport const bar = 1\nexport class Baz {}'
      const result = chunk(content, 'typescript')
      expect(result[0].exports).toContain('foo')
      expect(result[0].exports).toContain('bar')
      expect(result[0].exports).toContain('Baz')
    })
  })

  describe('edge cases', () => {
    it('handles empty content', () => {
      const result = chunk('', 'typescript')
      expect(result).toHaveLength(1)
      expect(result[0].content).toBe('')
    })

    it('handles single line content', () => {
      const result = chunk('const x = 1', 'typescript')
      expect(result).toHaveLength(1)
    })

    it('each chunk has an id', () => {
      const result = chunk('const x = 1', 'typescript')
      for (const c of result) {
        expect(c.id).toBeTruthy()
        expect(typeof c.id).toBe('string')
      }
    })

    it('each chunk has tokenEstimate', () => {
      const result = chunk('const x = 1', 'typescript')
      for (const c of result) {
        expect(c.tokenEstimate).toBeGreaterThan(0)
      }
    })
  })

  describe('file type detection', () => {
    it('detects test files', () => {
      const content = 'const x = 1'
      const result = chunk(content, 'typescript', 'src/__test__/helper.ts')
      expect(result[0].chunkType).toBe('test')
    })

    it('detects route files', () => {
      const content = 'const x = 1'
      const result = chunk(content, 'typescript', 'src/routes/api.ts')
      expect(result[0].chunkType).toBe('route')
    })

    it('detects schema files', () => {
      const content = 'const x = 1'
      const result = chunk(content, 'typescript', 'src/models/user.ts')
      expect(result[0].chunkType).toBe('schema')
    })
  })
})
