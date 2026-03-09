/**
 * Core Memory — Always-in-context memory tier (~2000 tokens)
 * Stores user profile, project context, preferences, coding style
 */

import { getDb } from '../db'
import { randomUUID } from 'crypto'
import { coreMemoryQueries } from './memory-db'
import type { CoreMemorySection, CoreMemoryEntry, DbCoreMemory } from './types'

const MAX_CORE_TOKENS = 2000
const MAX_SECTION_TOKENS = 500

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function dbToEntry(row: DbCoreMemory): CoreMemoryEntry {
  return {
    id: row.id,
    project_id: row.project_id,
    section: row.section as CoreMemorySection,
    content: row.content,
    updated_at: row.updated_at
  }
}

export function getCoreMemory(projectId: string): CoreMemoryEntry[] {
  try {
    const db = getDb()
    const rows = coreMemoryQueries.getByProject(db).all(projectId) as DbCoreMemory[]
    return rows.map(dbToEntry)
  } catch (err) {
    console.error('[CoreMemory] Failed to get core memory:', err)
    return []
  }
}

export function getCoreMemorySection(
  projectId: string,
  section: CoreMemorySection
): CoreMemoryEntry | null {
  try {
    const db = getDb()
    const row = coreMemoryQueries.getBySection(db).get(projectId, section) as DbCoreMemory | undefined
    return row ? dbToEntry(row) : null
  } catch (err) {
    console.error('[CoreMemory] Failed to get section:', err)
    return null
  }
}

export function updateCoreMemory(
  projectId: string,
  section: CoreMemorySection,
  content: string
): CoreMemoryEntry | null {
  try {
    const db = getDb()
    const id = randomUUID()

    // Check section token limit
    const sectionTokens = estimateTokens(content)
    if (sectionTokens > MAX_SECTION_TOKENS) {
      console.warn(`[CoreMemory] Section '${section}' exceeds ${MAX_SECTION_TOKENS} tokens (${sectionTokens}), truncating`)
      content = content.slice(0, MAX_SECTION_TOKENS * 4)
    }

    // Check total core memory token limit
    const existing = getCoreMemory(projectId)
    const otherTokens = existing
      .filter(e => e.section !== section)
      .reduce((sum, e) => sum + estimateTokens(e.content), 0)
    const totalTokens = otherTokens + estimateTokens(content)

    if (totalTokens > MAX_CORE_TOKENS) {
      console.warn(`[CoreMemory] Total core memory exceeds ${MAX_CORE_TOKENS} tokens (${totalTokens}), compacting`)
      compactCoreMemory(projectId, MAX_CORE_TOKENS - estimateTokens(content))
    }

    coreMemoryQueries.upsert(db).run(id, projectId, section, content)
    return getCoreMemorySection(projectId, section)
  } catch (err) {
    console.error('[CoreMemory] Failed to update:', err)
    return null
  }
}

export function deleteCoreMemory(projectId: string, section: CoreMemorySection): boolean {
  try {
    const db = getDb()
    coreMemoryQueries.delete(db).run(projectId, section)
    return true
  } catch (err) {
    console.error('[CoreMemory] Failed to delete:', err)
    return false
  }
}

export function getCoreMemoryForPrompt(projectId: string): string {
  const entries = getCoreMemory(projectId)
  if (entries.length === 0) return ''

  const sections = entries.map(e => {
    const label = e.section.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    return `## ${label}\n${e.content}`
  })

  return `<core_memory>\n${sections.join('\n\n')}\n</core_memory>`
}

export function getCoreMemoryTokenCount(projectId: string): number {
  const entries = getCoreMemory(projectId)
  return entries.reduce((sum, e) => sum + estimateTokens(e.content), 0)
}

function compactCoreMemory(projectId: string, targetTokens: number): void {
  const entries = getCoreMemory(projectId)
  const priorityOrder: CoreMemorySection[] = [
    'user_profile',
    'preferences',
    'coding_style',
    'project_context',
    'tool_preferences'
  ]

  // Sort by priority (lowest priority first = first to truncate)
  const sorted = [...entries].sort((a, b) => {
    const aIdx = priorityOrder.indexOf(a.section)
    const bIdx = priorityOrder.indexOf(b.section)
    return bIdx - aIdx
  })

  let totalTokens = sorted.reduce((sum, e) => sum + estimateTokens(e.content), 0)

  for (const entry of sorted) {
    if (totalTokens <= targetTokens) break
    const entryTokens = estimateTokens(entry.content)
    const newContent = entry.content.slice(0, Math.floor(entry.content.length * 0.5))
    const savedTokens = entryTokens - estimateTokens(newContent)
    totalTokens -= savedTokens

    const db = getDb()
    coreMemoryQueries.upsert(db).run(randomUUID(), projectId, entry.section, newContent)
  }
}