import { estimateTokens, compressContext } from '../../electron/services/context-compressor'
import type { SearchResult } from '../../electron/services/vector-search'

function makeChunk(overrides: Partial<SearchResult> = {}): SearchResult {
  return {
    chunkId: 'chunk-1',
    score: 0.9,
    content: 'const x = 1',
    filePath: '/repo/src/test.ts',
    relativePath: 'src/test.ts',
    language: 'typescript',
    chunkType: 'generic',
    name: 'test',
    lineStart: 1,
    lineEnd: 1,
    dependencies: [],
    exports: [],
    branch: 'main',
    ...overrides
  }
}

describe('estimateTokens', () => {
  it('estimates ~4 chars per token', () => {
    expect(estimateTokens('abcd')).toBe(1)
    expect(estimateTokens('abcdefgh')).toBe(2)
    expect(estimateTokens('')).toBe(0)
  })

  it('rounds up partial tokens', () => {
    expect(estimateTokens('abcde')).toBe(2)
  })
})

describe('compressContext', () => {
  it('returns empty array for empty input', () => {
    const { compressed, stats } = compressContext([])
    expect(compressed).toEqual([])
    expect(stats.originalTokens).toBe(0)
    expect(stats.compressedTokens).toBe(0)
    expect(stats.savingsPercent).toBe(0)
  })

  it('passes through short functions unchanged', () => {
    const shortFn = 'function hello() {\n  return "world"\n}'
    const chunk = makeChunk({ content: shortFn, chunkType: 'function' })
    const { compressed } = compressContext([chunk])
    expect(compressed[0].content).toBe(shortFn)
  })

  it('compresses long functions by keeping signature and return', () => {
    const lines = [
      'function processData(input: string) {',
      '  const a = 1',
      '  const b = 2',
      '  const c = 3',
      '  const d = 4',
      '  const e = 5',
      '  const f = 6',
      '  return a + b + c',
      '}'
    ]
    const chunk = makeChunk({ content: lines.join('\n'), chunkType: 'function' })
    const { compressed } = compressContext([chunk])
    expect(compressed[0].content).toContain('function processData')
    expect(compressed[0].content).toContain('return a + b + c')
    expect(compressed[0].content).toContain('lines of implementation')
  })

  it('compresses imports to module list', () => {
    const imports = [
      "import React from 'react'",
      "import { useState } from 'react'",
      "import path from 'path'"
    ].join('\n')
    const chunk = makeChunk({ content: imports, chunkType: 'import_block' })
    const { compressed } = compressContext([chunk])
    expect(compressed[0].content).toContain('Imports:')
    expect(compressed[0].content).toContain('react')
    expect(compressed[0].content).toContain('path')
  })

  it('passes through interface/type chunks unchanged', () => {
    const iface = 'interface Foo {\n  bar: string\n  baz: number\n}'
    const chunk = makeChunk({ content: iface, chunkType: 'interface' })
    const { compressed } = compressContext([chunk])
    expect(compressed[0].content).toBe(iface)
  })

  it('calculates compression stats correctly', () => {
    const longContent = Array(20).fill('  const x = someFunction()').join('\n')
    const chunk = makeChunk({ content: `function big() {\n${longContent}\n  return x\n}`, chunkType: 'function' })
    const { stats } = compressContext([chunk])
    expect(stats.originalTokens).toBeGreaterThan(0)
    expect(stats.compressedTokens).toBeLessThanOrEqual(stats.originalTokens)
    expect(stats.perChunkType).toHaveLength(1)
    expect(stats.perChunkType[0].chunkType).toBe('function')
  })

  it('compresses class chunks by keeping declarations and signatures', () => {
    const classContent = [
      'export class UserService {',
      '  private db: Database',
      '  constructor(db: Database) {',
      '    this.db = db',
      '    this.init()',
      '    this.setupHooks()',
      '    this.configureLogging()',
      '    this.loadPlugins()',
      '  }',
      '  async getUser(id: string) {',
      '    const query = this.db.prepare("SELECT * FROM users WHERE id = ?")',
      '    const result = query.get(id)',
      '    return result',
      '  }',
      '}'
    ].join('\n')
    const chunk = makeChunk({ content: classContent, chunkType: 'class' })
    const { compressed } = compressContext([chunk])
    expect(compressed[0].content).toContain('export class UserService')
    expect(compressed[0].content).toContain('private db: Database')
  })

  it('removes consecutive blank lines in generic compression', () => {
    const content = 'line1\n\n\n\nline2\n\n\n\nline3'
    const chunk = makeChunk({ content, chunkType: 'generic' })
    const { compressed } = compressContext([chunk])
    const blankCount = compressed[0].content.split('\n').filter(l => l.trim() === '').length
    expect(blankCount).toBeLessThanOrEqual(2)
  })
})
