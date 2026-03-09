import { create } from 'zustand'

export type CoreMemorySection = 'user_profile' | 'project_context' | 'preferences' | 'coding_style' | 'tool_preferences'
export type MemoryTier = 'core' | 'archival' | 'recall'

export interface CoreMemoryEntry {
  id: string
  section: CoreMemorySection
  content: string
  updated_at: number
}

export interface ArchivalMemoryEntry {
  id: string
  content: string
  metadata: Record<string, unknown>
  created_at: number
  access_count: number
  relevance_score: number
}

export interface RecallMemoryEntry {
  id: string
  conversation_id: string
  role: string
  content: string
  timestamp: number
}

export interface MemoryStats {
  coreEntries: number
  archivalEntries: number
  recallEntries: number
  totalTokens: number
  oldestMemory: number | null
  newestMemory: number | null
}

export interface MemorySearchResult {
  entry: ArchivalMemoryEntry | RecallMemoryEntry
  score: number
  tier: MemoryTier
}

interface MemoryState {
  coreMemory: CoreMemoryEntry[]
  archivalMemory: ArchivalMemoryEntry[]
  recallMemory: RecallMemoryEntry[]
  searchResults: MemorySearchResult[]
  stats: MemoryStats | null
  loading: boolean
  searching: boolean

  loadCoreMemory: (projectId: string) => Promise<void>
  updateCoreMemory: (projectId: string, section: CoreMemorySection, content: string) => Promise<void>
  deleteCoreMemory: (projectId: string, section: CoreMemorySection) => Promise<void>
  loadArchivalMemory: (projectId: string, limit?: number, offset?: number) => Promise<void>
  addArchivalMemory: (projectId: string, content: string, metadata?: Record<string, unknown>) => Promise<void>
  deleteArchivalMemory: (id: string) => Promise<void>
  loadRecallMemory: (projectId: string, limit?: number) => Promise<void>
  searchMemory: (projectId: string, query: string, limit?: number) => Promise<void>
  loadStats: (projectId: string) => Promise<void>
  migrateMemory: (projectId: string) => Promise<boolean>
  clearSearch: () => void
}

export const useMemoryStore = create<MemoryState>((set) => ({
  coreMemory: [],
  archivalMemory: [],
  recallMemory: [],
  searchResults: [],
  stats: null,
  loading: false,
  searching: false,

  loadCoreMemory: async (projectId: string) => {
    if (!window.electronAPI?.memoryCoreGet) return
    set({ loading: true })
    try {
      const entries = await window.electronAPI.memoryCoreGet(projectId)
      set({ coreMemory: entries || [] })
    } catch (err) {
      console.error('Failed to load core memory:', err)
    } finally {
      set({ loading: false })
    }
  },

  updateCoreMemory: async (projectId: string, section: CoreMemorySection, content: string) => {
    if (!window.electronAPI?.memoryCoreUpdate) return
    try {
      await window.electronAPI.memoryCoreUpdate(projectId, section, content)
      const entries = await window.electronAPI.memoryCoreGet(projectId)
      set({ coreMemory: entries || [] })
    } catch (err) {
      console.error('Failed to update core memory:', err)
    }
  },

  deleteCoreMemory: async (projectId: string, section: CoreMemorySection) => {
    if (!window.electronAPI?.memoryCoreDelete) return
    try {
      await window.electronAPI.memoryCoreDelete(projectId, section)
      set((state) => ({
        coreMemory: state.coreMemory.filter((e) => e.section !== section)
      }))
    } catch (err) {
      console.error('Failed to delete core memory:', err)
    }
  },

  loadArchivalMemory: async (projectId: string, limit?: number, offset?: number) => {
    if (!window.electronAPI?.memoryArchivalList) return
    set({ loading: true })
    try {
      const entries = await window.electronAPI.memoryArchivalList(projectId, limit, offset)
      set({ archivalMemory: entries || [] })
    } catch (err) {
      console.error('Failed to load archival memory:', err)
    } finally {
      set({ loading: false })
    }
  },

  addArchivalMemory: async (projectId: string, content: string, metadata?: Record<string, unknown>) => {
    if (!window.electronAPI?.memoryArchivalAdd) return
    try {
      await window.electronAPI.memoryArchivalAdd(projectId, content, metadata)
      const entries = await window.electronAPI.memoryArchivalList(projectId)
      set({ archivalMemory: entries || [] })
    } catch (err) {
      console.error('Failed to add archival memory:', err)
    }
  },

  deleteArchivalMemory: async (id: string) => {
    if (!window.electronAPI?.memoryArchivalDelete) return
    try {
      await window.electronAPI.memoryArchivalDelete(id)
      set((state) => ({
        archivalMemory: state.archivalMemory.filter((e) => e.id !== id)
      }))
    } catch (err) {
      console.error('Failed to delete archival memory:', err)
    }
  },

  loadRecallMemory: async (projectId: string, limit?: number) => {
    if (!window.electronAPI?.memoryRecallRecent) return
    set({ loading: true })
    try {
      const entries = await window.electronAPI.memoryRecallRecent(projectId, limit)
      set({ recallMemory: entries || [] })
    } catch (err) {
      console.error('Failed to load recall memory:', err)
    } finally {
      set({ loading: false })
    }
  },

  searchMemory: async (projectId: string, query: string, limit?: number) => {
    if (!window.electronAPI?.memorySearch) return
    set({ searching: true })
    try {
      const results = await window.electronAPI.memorySearch(projectId, query, limit)
      set({ searchResults: results || [] })
    } catch (err) {
      console.error('Failed to search memory:', err)
    } finally {
      set({ searching: false })
    }
  },

  loadStats: async (projectId: string) => {
    if (!window.electronAPI?.memoryStats) return
    try {
      const stats = await window.electronAPI.memoryStats(projectId)
      set({ stats })
    } catch (err) {
      console.error('Failed to load memory stats:', err)
    }
  },

  migrateMemory: async (projectId: string) => {
    if (!window.electronAPI?.memoryMigrate) return false
    try {
      await window.electronAPI.memoryMigrate(projectId)
      return true
    } catch (err) {
      console.error('Failed to migrate memory:', err)
      return false
    }
  },

  clearSearch: () => set({ searchResults: [] })
}))
