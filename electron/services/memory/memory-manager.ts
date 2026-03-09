/**
 * Memory Manager — Orchestrates all 3 memory tiers
 * Provides unified interface for memory operations
 */

import { initMemorySchema } from './memory-db'
import { getCoreMemory, getCoreMemorySection, getCoreMemoryForPrompt, updateCoreMemory, getCoreMemoryTokenCount } from './core-memory'
import { addArchivalMemory, searchArchivalMemory, getArchivalMemories, decayRelevance, getArchivalStats } from './archival-memory'
import { addRecallMemory, searchRecallMemory, getRecentRecall, getRecallCount } from './recall-memory'
import type {
  CoreMemorySection,
  MemoryContext,
  MemorySearchResult,
  MemoryStats,
  ArchivalMetadata
} from './types'

let initialized = false

export function initMemory(): void {
  if (initialized) return
  try {
    initMemorySchema()
    initialized = true
    console.log('[MemoryManager] Memory system initialized')
  } catch (err) {
    console.error('[MemoryManager] Init failed:', err)
  }
}

export async function loadMemoryContext(projectId: string): Promise<MemoryContext> {
  initMemory()

  const core: MemoryContext['core'] = {}
  const coreEntries = getCoreMemory(projectId)
  for (const entry of coreEntries) {
    core[entry.section] = entry.content
  }

  const recall = getRecentRecall(projectId, 10)
  const archival = getArchivalMemories(projectId, 5)

  return { core, archival, recall }
}

export function buildMemoryPrompt(projectId: string): string {
  initMemory()

  const parts: string[] = []

  // Core memory (always included)
  const corePrompt = getCoreMemoryForPrompt(projectId)
  if (corePrompt) {
    parts.push(corePrompt)
  }

  // Recent recall (last few messages for continuity)
  const recent = getRecentRecall(projectId, 5)
  if (recent.length > 0) {
    const recallLines = recent.map(r =>
      `[${r.role}] ${r.content.slice(0, 200)}${r.content.length > 200 ? '...' : ''}`
    )
    parts.push(`<recent_memory>\n${recallLines.join('\n')}\n</recent_memory>`)
  }

  return parts.join('\n\n')
}

export async function saveInteraction(
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  initMemory()

  // Save to recall memory
  await addRecallMemory(projectId, conversationId, role, content)

  // Auto-extract archival-worthy content
  if (role === 'assistant' && content.length > 100) {
    const archivalContent = autoExtractArchival(content)
    if (archivalContent) {
      await addArchivalMemory(projectId, archivalContent, {
        type: 'insight',
        source: 'auto_extract',
        conversation_id: conversationId
      })
    }
  }

  // Auto-distill core memory from both user and assistant messages
  if (content.length > 30) {
    try {
      const distilled = autoDistillCoreMemory(content)
      if (distilled) {
        console.log(`[MemoryManager] Core distill matched: section=${distilled.section}, role=${role}, insight="${distilled.insight.slice(0, 80)}..."`)
        const existing = getCoreMemorySection(projectId, distilled.section)
        const merged = existing
          ? `${existing.content}\n- ${distilled.insight}`
          : distilled.insight
        updateCoreMemory(projectId, distilled.section, merged)
        console.log(`[MemoryManager] Core memory updated: section=${distilled.section}`)
      }
    } catch (err) {
      console.error('[MemoryManager] Core distill failed:', err)
    }
  }
}

export async function searchMemory(
  projectId: string,
  query: string,
  limit: number = 10
): Promise<MemorySearchResult[]> {
  initMemory()

  const results: MemorySearchResult[] = []

  // Search archival
  try {
    const archivalResults = await searchArchivalMemory(projectId, query, limit)
    for (const r of archivalResults) {
      results.push({
        entry: r,
        score: r.score,
        tier: 'archival'
      })
    }
  } catch (err) {
    console.warn('[MemoryManager] Archival search failed:', err)
  }

  // Search recall
  try {
    const recallResults = await searchRecallMemory(projectId, query, limit)
    for (const r of recallResults) {
      results.push({
        entry: r,
        score: r.score,
        tier: 'recall'
      })
    }
  } catch (err) {
    console.warn('[MemoryManager] Recall search failed:', err)
  }

  // Sort by score and return top results
  return results
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
}

export function getMemoryStats(projectId: string): MemoryStats {
  initMemory()

  const coreEntries = getCoreMemory(projectId)
  const archivalStats = getArchivalStats(projectId)
  const recallCount = getRecallCount(projectId)
  const coreTokens = getCoreMemoryTokenCount(projectId)

  const archivalTokensEstimate = archivalStats.total * 100
  const recallTokensEstimate = recallCount * 50

  return {
    coreEntries: coreEntries.length,
    archivalEntries: archivalStats.total,
    recallEntries: recallCount,
    totalTokens: coreTokens + archivalTokensEstimate + recallTokensEstimate,
    oldestMemory: archivalStats.oldest,
    newestMemory: archivalStats.newest
  }
}

export function autoExtractArchival(content: string): string | null {
  const markers = [
    { pattern: /\b(decided|decision|chose|choice|quyết định|chọn|lựa chọn)\b/i, type: 'decision' },
    { pattern: /\b(prefer|preference|always|never|style|thích|ưu tiên|luôn|không bao giờ)\b/i, type: 'preference' },
    { pattern: /\b(pattern|convention|approach|architecture|mẫu|quy ước|cách tiếp cận|kiến trúc)\b/i, type: 'pattern' },
    { pattern: /\b(fixed|resolved|solution|workaround|root cause|sửa|giải quyết|giải pháp|nguyên nhân gốc|khắc phục)\b/i, type: 'error_fix' },
    { pattern: /\b(insight|discovered|learned|realized|important|phát hiện|học được|nhận ra|quan trọng|lưu ý)\b/i, type: 'insight' }
  ]

  for (const marker of markers) {
    if (marker.pattern.test(content)) {
      const sentences = splitSentences(content)
      const relevant = sentences.filter(s => marker.pattern.test(s))
      if (relevant.length > 0) {
        return relevant.join('. ').slice(0, 1000)
      }
    }
  }

  return null
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?:;\n])\s+|(?<=\n)/)
    .map(s => s.trim())
    .filter(s => s.length > 10)
}

const CORE_DISTILL_RULES: Array<{
  section: CoreMemorySection
  detect: RegExp
  extract: RegExp
}> = [
  {
    section: 'user_profile',
    detect: /\b(user|người dùng|tên|name|role|vai trò|team|nhóm|kinh nghiệm|experience|senior|junior|fullstack|frontend|backend|devops|PM|product manager|developer|engineer)\b/i,
    extract: /\b(user|người dùng|tên|name|role|vai trò|team|nhóm|kinh nghiệm|experience|senior|junior|fullstack|frontend|backend|devops|PM|product manager|developer|engineer)\b/i,
  },
  {
    section: 'project_context',
    detect: /\b(dự án|project|kiến trúc|architecture|stack|tech stack|monorepo|microservice|framework|database|cơ sở dữ liệu|deploy|triển khai|production|staging|module|component|service|repository|repo)\b/i,
    extract: /\b(dự án|project|kiến trúc|architecture|stack|tech stack|monorepo|microservice|framework|database|cơ sở dữ liệu|deploy|triển khai|production|staging|module|component|service|repository|repo)\b/i,
  },
  {
    section: 'preferences',
    detect: /\b(prefer|thích|ưu tiên|thường|usually|always|luôn|không thích|dislike|muốn|want|nên dùng|nên sử dụng|hay dùng|mặc định|default)\b/i,
    extract: /\b(prefer|thích|ưu tiên|thường|usually|always|luôn|không thích|dislike|muốn|want|nên dùng|nên sử dụng|hay dùng|mặc định|default)\b/i,
  },
  {
    section: 'coding_style',
    detect: /\b(coding style|code style|naming|convention|quy ước|quy tắc|indent|format|lint|eslint|prettier|đặt tên|camelCase|snake_case|tab|space|semicolon|import|export|pattern|mẫu|chuẩn)\b/i,
    extract: /\b(coding style|code style|naming|convention|quy ước|quy tắc|indent|format|lint|eslint|prettier|đặt tên|camelCase|snake_case|tab|space|semicolon|import|export|pattern|mẫu|chuẩn)\b/i,
  },
  {
    section: 'tool_preferences',
    detect: /\b(tool|công cụ|dùng .+ để|use .+ for|plugin|extension|IDE|editor|terminal|CLI|npm|yarn|pnpm|docker|git|vscode|vim|neovim)\b/i,
    extract: /\b(tool|công cụ|dùng|use|plugin|extension|IDE|editor|terminal|CLI|npm|yarn|pnpm|docker|git|vscode|vim|neovim)\b/i,
  },
]

function autoDistillCoreMemory(content: string): { section: CoreMemorySection; insight: string } | null {
  const sentences = splitSentences(content)

  for (const rule of CORE_DISTILL_RULES) {
    if (rule.detect.test(content)) {
      const relevant = sentences.filter(s => rule.extract.test(s))
      if (relevant.length > 0) {
        return { section: rule.section, insight: relevant.join('. ').slice(0, 300) }
      }
    }
  }

  return null
}

export async function compactMemory(projectId: string): Promise<{ decayed: number }> {
  initMemory()
  const decayed = decayRelevance(projectId)
  return { decayed }
}

export { updateCoreMemory, getCoreMemory } from './core-memory'
export { addArchivalMemory, deleteArchivalMemory } from './archival-memory'
export { addRecallMemory, deleteConversationRecall } from './recall-memory'