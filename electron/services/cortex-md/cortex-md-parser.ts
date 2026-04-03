import { readFile } from 'fs/promises'
import { existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { homedir } from 'os'
import type { ParsedCortexMd } from './types'

const MAX_IMPORT_DEPTH = 5

function stripHtmlComments(content: string): string {
  return content.replace(/<!--[\s\S]*?-->/g, '')
}

function expandHome(filePath: string): string {
  if (filePath.startsWith('~/')) {
    return join(homedir(), filePath.slice(2))
  }
  return filePath
}

function extractImportPaths(content: string): string[] {
  const matches = content.match(/^@(.+)$/gm) ?? []
  return matches.map(m => m.slice(1).trim())
}

async function resolveAndReadImport(
  importPath: string,
  baseDir: string,
  visited: Set<string>,
  depth: number
): Promise<string> {
  if (depth > MAX_IMPORT_DEPTH) {
    console.warn('[CortexMdParser] Max import depth reached, skipping:', importPath)
    return ''
  }

  const expanded = expandHome(importPath)
  const resolved = resolve(baseDir, expanded)

  if (visited.has(resolved)) {
    console.warn('[CortexMdParser] Circular import detected, skipping:', resolved)
    return ''
  }

  if (!existsSync(resolved)) {
    console.warn('[CortexMdParser] Import file not found, skipping:', resolved)
    return ''
  }

  visited.add(resolved)
  try {
    const raw = await readFile(resolved, 'utf-8')
    return await expandImports(raw, dirname(resolved), visited, depth + 1)
  } catch (err) {
    console.warn('[CortexMdParser] Failed to read import:', resolved, err)
    return ''
  }
}

async function expandImports(
  content: string,
  baseDir: string,
  visited: Set<string>,
  depth: number
): Promise<string> {
  const lines = content.split('\n')
  const result: string[] = []

  for (const line of lines) {
    const importMatch = line.match(/^@(.+)$/)
    if (importMatch) {
      const importPath = importMatch[1].trim()
      const importContent = await resolveAndReadImport(importPath, baseDir, visited, depth)
      if (importContent) {
        result.push(importContent)
      }
    } else {
      result.push(line)
    }
  }

  return result.join('\n')
}

export async function parseCortexMd(filePath: string): Promise<ParsedCortexMd | null> {
  if (!existsSync(filePath)) return null

  try {
    const rawContent = await readFile(filePath, 'utf-8')
    const visited = new Set<string>([resolve(filePath)])
    const withImports = await expandImports(rawContent, dirname(filePath), visited, 0)
    const content = stripHtmlComments(withImports).trim()
    const importPaths = extractImportPaths(rawContent)
    const resolvedImports = importPaths
      .map(p => resolve(dirname(filePath), expandHome(p)))
      .filter(p => existsSync(p))

    return {
      filePath: resolve(filePath),
      content,
      rawContent,
      imports: resolvedImports,
      wordCount: content.split(/\s+/).filter(Boolean).length,
      tokenEstimate: Math.ceil(content.length / 4)
    }
  } catch (err) {
    console.error('[CortexMdParser] Failed to parse:', filePath, err)
    return null
  }
}
