import type { SearchResult } from './vector-search'

export interface CompressionStats {
  originalTokens: number
  compressedTokens: number
  savingsPercent: number
  perChunkType: Array<{ chunkType: string; original: number; compressed: number }>
}

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

export function compressContext(chunks: SearchResult[]): { compressed: SearchResult[]; stats: CompressionStats } {
  const perChunkType: CompressionStats['perChunkType'] = []
  let totalOriginal = 0
  let totalCompressed = 0

  const compressed = chunks.map((chunk) => {
    const original = estimateTokens(chunk.content)
    const compressedContent = compressChunk(chunk.content, chunk.chunkType)
    const compressedTokens = estimateTokens(compressedContent)

    totalOriginal += original
    totalCompressed += compressedTokens
    perChunkType.push({ chunkType: chunk.chunkType, original, compressed: compressedTokens })

    return { ...chunk, content: compressedContent }
  })

  const savingsPercent = totalOriginal > 0
    ? Math.round(((totalOriginal - totalCompressed) / totalOriginal) * 100)
    : 0

  return {
    compressed,
    stats: { originalTokens: totalOriginal, compressedTokens: totalCompressed, savingsPercent, perChunkType }
  }
}

function compressChunk(content: string, chunkType: string): string {
  switch (chunkType) {
    case 'function':
    case 'method':
      return compressFunction(content)
    case 'class':
      return compressClass(content)
    case 'import_block':
      return compressImports(content)
    case 'interface':
    case 'type':
    case 'enum':
      return content
    case 'config':
      return compressConfig(content)
    case 'test':
      return compressTest(content)
    default:
      return compressGeneric(content)
  }
}

function compressFunction(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= 6) return content

  const result: string[] = []
  let inBody = false
  let braceDepth = 0
  let skippedLines = 0

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    for (const char of line) {
      if (char === '{') braceDepth++
      if (char === '}') braceDepth--
    }

    const isSignature = i === 0 || (!inBody && (trimmed.includes('function') || trimmed.includes('=>') || trimmed.includes('(')))
    const isReturn = trimmed.startsWith('return ') || trimmed.startsWith('return;')
    const isClosingBrace = trimmed === '}' || trimmed === '};'
    const isImportantComment = trimmed.startsWith('// IMPORTANT') || trimmed.startsWith('// WARNING') || trimmed.startsWith('// SECURITY') || trimmed.startsWith('// TODO')

    if (isSignature && !inBody) {
      result.push(line)
      if (trimmed.includes('{')) inBody = true
    } else if (isReturn || isClosingBrace || isImportantComment) {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines of implementation`)
        skippedLines = 0
      }
      result.push(line)
    } else if (inBody) {
      skippedLines++
    } else {
      result.push(line)
    }
  }

  if (skippedLines > 0) {
    result.push(`    // ... ${skippedLines} lines of implementation`)
  }

  return result.join('\n')
}

function compressClass(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= 10) return content

  const result: string[] = []
  let methodDepth = 0
  let skippedLines = 0
  let inMethodBody = false

  for (const line of lines) {
    const trimmed = line.trim()

    const isClassDecl = trimmed.startsWith('class ') || trimmed.startsWith('export class ') || trimmed.startsWith('export default class ')
    const isMethodSignature = /^\s*(public|private|protected|static|async|get|set)?\s*(readonly\s+)?(\w+)\s*[(<]/.test(line) && !inMethodBody
    const isProperty = /^\s*(public|private|protected|static|readonly)/.test(line) && !line.includes('(')
    const isConstructor = trimmed.startsWith('constructor(') || trimmed.startsWith('constructor (')

    for (const char of line) {
      if (char === '{' && inMethodBody) methodDepth++
      if (char === '}' && inMethodBody) methodDepth--
    }

    if (isClassDecl || isProperty || isConstructor || isMethodSignature) {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines`)
        skippedLines = 0
      }
      result.push(line)
      if (trimmed.includes('{') && (isMethodSignature || isConstructor)) {
        inMethodBody = true
        methodDepth = 1
      }
    } else if (trimmed === '}' && methodDepth <= 0) {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines`)
        skippedLines = 0
      }
      result.push(line)
      inMethodBody = false
    } else if (inMethodBody) {
      skippedLines++
      if (methodDepth <= 0) {
        inMethodBody = false
      }
    } else if (trimmed === '}') {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines`)
        skippedLines = 0
      }
      result.push(line)
    } else {
      skippedLines++
    }
  }

  if (skippedLines > 0) {
    result.push(`  // ... ${skippedLines} lines`)
  }

  return result.join('\n')
}

function compressImports(content: string): string {
  const modules: string[] = []
  const lines = content.split('\n')

  for (const line of lines) {
    const match = line.match(/from\s+['"]([^'"]+)['"]/) ||
                  line.match(/require\s*\(\s*['"]([^'"]+)['"]\s*\)/) ||
                  line.match(/import\s+['"]([^'"]+)['"]/)
    if (match) {
      modules.push(match[1])
    }
  }

  if (modules.length === 0) return content
  return `Imports: ${modules.join(', ')}`
}

function compressConfig(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= 15) return content

  const result: string[] = []
  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed || trimmed === '{' || trimmed === '}' || trimmed === '},') {
      result.push(line)
      continue
    }

    const keyMatch = trimmed.match(/^["']?(\w+)["']?\s*[:=]/)
    if (keyMatch) {
      const value = trimmed.slice(keyMatch[0].length).trim()
      if (value.length > 60) {
        result.push(line.replace(value, `(${typeof value === 'string' ? 'string' : 'value'}, ${value.length} chars)`))
      } else {
        result.push(line)
      }
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

function compressTest(content: string): string {
  const lines = content.split('\n')
  if (lines.length <= 10) return content

  const result: string[] = []
  let inTestBody = false
  let skippedLines = 0
  let depth = 0

  for (const line of lines) {
    const trimmed = line.trim()

    const isDescribe = trimmed.startsWith('describe(') || trimmed.startsWith('describe(')
    const isIt = trimmed.startsWith('it(') || trimmed.startsWith('test(')
    const isExpect = trimmed.startsWith('expect(') || trimmed.startsWith('assert')

    for (const char of line) {
      if (char === '{') depth++
      if (char === '}') depth--
    }

    if (isDescribe || isIt) {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines`)
        skippedLines = 0
      }
      result.push(line)
      inTestBody = true
    } else if (isExpect) {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines of setup`)
        skippedLines = 0
      }
      result.push(line)
    } else if (trimmed === '})' || trimmed === '});') {
      if (skippedLines > 0) {
        result.push(`    // ... ${skippedLines} lines`)
        skippedLines = 0
      }
      result.push(line)
      inTestBody = false
    } else if (inTestBody) {
      skippedLines++
    } else {
      result.push(line)
    }
  }

  if (skippedLines > 0) {
    result.push(`  // ... ${skippedLines} lines`)
  }

  return result.join('\n')
}

function compressGeneric(content: string): string {
  const lines = content.split('\n')
  const result: string[] = []
  let consecutiveBlanks = 0

  for (const line of lines) {
    if (line.trim() === '') {
      consecutiveBlanks++
      if (consecutiveBlanks <= 1) result.push(line)
    } else {
      consecutiveBlanks = 0
      result.push(line)
    }
  }

  return result.join('\n')
}
