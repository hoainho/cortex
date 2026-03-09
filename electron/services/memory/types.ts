/**
 * Memory System Types — Cortex V2 Memory Architecture
 * Letta/MemGPT-inspired 3-tier memory system
 */

export type CoreMemorySection =
  | 'user_profile'
  | 'project_context'
  | 'preferences'
  | 'coding_style'
  | 'tool_preferences'

export type MemoryTier = 'core' | 'archival' | 'recall'

export interface CoreMemoryEntry {
  id: string
  project_id: string
  section: CoreMemorySection
  content: string
  updated_at: number
}

export interface ArchivalMemoryEntry {
  id: string
  project_id: string
  content: string
  embedding: Buffer | null
  metadata: ArchivalMetadata
  created_at: number
  accessed_at: number
  access_count: number
  relevance_score: number
}

export interface ArchivalMetadata {
  source?: string
  type?: 'decision' | 'pattern' | 'preference' | 'insight' | 'error_fix' | 'general'
  tags?: string[]
  conversation_id?: string
  [key: string]: unknown
}

export interface RecallMemoryEntry {
  id: string
  project_id: string
  conversation_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  embedding: Buffer | null
  timestamp: number
}

export interface MemoryContext {
  core: Partial<Record<CoreMemorySection, string>>
  archival: ArchivalMemoryEntry[]
  recall: RecallMemoryEntry[]
}

export interface MemorySearchResult {
  entry: ArchivalMemoryEntry | RecallMemoryEntry
  score: number
  tier: MemoryTier
}

export interface MemoryStats {
  coreEntries: number
  archivalEntries: number
  recallEntries: number
  totalTokens: number
  oldestMemory: number | null
  newestMemory: number | null
}

export interface DbCoreMemory {
  id: string
  project_id: string
  section: string
  content: string
  updated_at: number
}

export interface DbArchivalMemory {
  id: string
  project_id: string
  content: string
  embedding: Buffer | null
  metadata: string
  created_at: number
  accessed_at: number
  access_count: number
  relevance_score: number
}

export interface DbRecallMemory {
  id: string
  project_id: string
  conversation_id: string
  role: string
  content: string
  embedding: Buffer | null
  timestamp: number
}