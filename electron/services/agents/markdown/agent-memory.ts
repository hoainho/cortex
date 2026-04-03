import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { MarkdownAgentMemory } from './types'

const MAX_MEMORY_LINES = 200
const MAX_MEMORY_BYTES = 25 * 1024

const MEMORY_TEMPLATE = `# Agent Memory

This file accumulates knowledge across sessions. Update it after completing tasks.

## Patterns Discovered
<!-- Add patterns, conventions, and recurring structures here -->

## Key Decisions
<!-- Record important architectural and design decisions -->

## Project Notes
<!-- Project-specific context, file locations, team conventions -->
`

export function getAgentMemoryDir(agentName: string, scope: MarkdownAgentMemory, projectPath?: string): string | null {
  if (scope === 'none') return null

  if (scope === 'user') {
    return join(homedir(), '.cortex', 'agent-memory', agentName)
  }

  if (!projectPath) return null

  if (scope === 'local') {
    return join(projectPath, '.cortex', 'agent-memory-local', agentName)
  }

  return join(projectPath, '.cortex', 'agent-memory', agentName)
}

export function loadAgentMemory(agentName: string, scope: MarkdownAgentMemory, projectPath?: string): string | null {
  const dir = getAgentMemoryDir(agentName, scope, projectPath)
  if (!dir) return null

  const memoryFile = join(dir, 'MEMORY.md')
  if (!existsSync(memoryFile)) return null

  try {
    const raw = readFileSync(memoryFile, 'utf-8')
    const lines = raw.split('\n')
    const bytes = Buffer.byteLength(raw, 'utf-8')

    if (lines.length <= MAX_MEMORY_LINES && bytes <= MAX_MEMORY_BYTES) {
      return raw
    }

    if (bytes > MAX_MEMORY_BYTES) {
      return raw.slice(0, MAX_MEMORY_BYTES)
    }

    return lines.slice(0, MAX_MEMORY_LINES).join('\n')
  } catch {
    return null
  }
}

export function ensureAgentMemoryDir(agentName: string, scope: MarkdownAgentMemory, projectPath?: string): string | null {
  const dir = getAgentMemoryDir(agentName, scope, projectPath)
  if (!dir) return null

  mkdirSync(dir, { recursive: true })

  const memoryFile = join(dir, 'MEMORY.md')
  if (!existsSync(memoryFile)) {
    writeFileSync(memoryFile, MEMORY_TEMPLATE, 'utf-8')
  }

  return dir
}

export function buildAgentMemoryPrompt(agentName: string, scope: MarkdownAgentMemory, projectPath?: string): string {
  const content = loadAgentMemory(agentName, scope, projectPath)
  if (!content) return ''

  const dir = getAgentMemoryDir(agentName, scope, projectPath)
  return [
    `## Agent Memory (${agentName})`,
    `Memory directory: ${dir}`,
    '',
    content,
    '',
    'Instructions: Review the above memory before starting work. Update MEMORY.md after discovering new patterns or completing significant tasks.',
  ].join('\n')
}
