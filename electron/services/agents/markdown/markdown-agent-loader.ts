import { readFileSync, existsSync } from 'fs'
import { resolve } from 'path'
import type {
  MarkdownAgentDefinition, MarkdownAgentModel, MarkdownAgentMemory,
  MarkdownAgentIsolation, MarkdownAgentPermissionMode, MarkdownAgentColor,
  MarkdownAgentScope
} from './types'

const AGENT_NAME_RE = /^[a-z][a-z0-9-]*$/

function parseYamlValue(value: string): unknown {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const num = Number(trimmed)
  if (!isNaN(num) && trimmed !== '') return num
  return trimmed
}

function parseYamlList(block: string): string[] {
  return block
    .split('\n')
    .map(l => l.replace(/^\s*-\s*/, '').trim())
    .filter(Boolean)
}

function parseFrontmatter(raw: string): Record<string, unknown> {
  const match = raw.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}

  const yaml = match[1]
  const result: Record<string, unknown> = {}
  const lines = yaml.split('\n')
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const keyMatch = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (!keyMatch) { i++; continue }

    const key = keyMatch[1]
    const restOfLine = keyMatch[2].trim()

    if (restOfLine === '') {
      const listLines: string[] = []
      i++
      while (i < lines.length && lines[i].match(/^\s+-\s/)) {
        listLines.push(lines[i])
        i++
      }
      if (listLines.length > 0) {
        result[key] = parseYamlList(listLines.join('\n'))
      }
    } else {
      result[key] = parseYamlValue(restOfLine)
      i++
    }
  }

  return result
}

function extractBody(raw: string): string {
  const withoutFrontmatter = raw.replace(/^---\n[\s\S]*?\n---\n?/, '')
  return withoutFrontmatter.trim()
}

function toEnum<T extends string>(value: unknown, allowed: T[], fallback: T): T {
  if (typeof value === 'string' && (allowed as string[]).includes(value)) {
    return value as T
  }
  return fallback
}

export function parseMarkdownAgent(filePath: string, scope: MarkdownAgentScope): MarkdownAgentDefinition | null {
  if (!existsSync(filePath)) return null

  try {
    const raw = readFileSync(resolve(filePath), 'utf-8')
    const fm = parseFrontmatter(raw)
    const body = extractBody(raw)

    const name = typeof fm.name === 'string' ? fm.name.trim() : ''
    const description = typeof fm.description === 'string' ? fm.description.trim() : ''

    if (!name || !AGENT_NAME_RE.test(name)) {
      console.warn('[MarkdownAgentLoader] Invalid or missing name in:', filePath)
      return null
    }
    if (!description) {
      console.warn('[MarkdownAgentLoader] Missing description in:', filePath)
      return null
    }

    return {
      name,
      description,
      systemPrompt: body,
      model: toEnum<MarkdownAgentModel>(fm.model, ['fast', 'balanced', 'premium', 'inherit'], 'inherit'),
      tools: Array.isArray(fm.tools) ? (fm.tools as string[]) : undefined,
      disallowedTools: Array.isArray(fm.disallowedTools) ? (fm.disallowedTools as string[]) : undefined,
      memory: toEnum<MarkdownAgentMemory>(fm.memory, ['user', 'project', 'local', 'none'], 'none'),
      background: fm.background === true,
      maxTurns: typeof fm.maxTurns === 'number' ? fm.maxTurns : 30,
      skills: Array.isArray(fm.skills) ? (fm.skills as string[]) : [],
      permissionMode: toEnum<MarkdownAgentPermissionMode>(fm.permissionMode, ['default', 'acceptEdits', 'plan', 'dontAsk'], 'default'),
      isolation: toEnum<MarkdownAgentIsolation>(fm.isolation, ['none', 'worktree'], 'none'),
      color: toEnum<MarkdownAgentColor>(fm.color as string, ['red', 'blue', 'green', 'yellow', 'purple', 'orange', 'pink', 'cyan'], 'blue'),
      filePath: resolve(filePath),
      scope
    }
  } catch (err) {
    console.error('[MarkdownAgentLoader] Failed to parse:', filePath, err)
    return null
  }
}
