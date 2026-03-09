import { create } from 'zustand'

export interface CostStats {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedTokens: number
  queryCount: number
}

export interface DailyCost {
  date: string
  cost: number
  queries: number
}

export interface CacheStats {
  totalEntries: number
  totalHits: number
  totalTokensSaved: number
}

interface CostState {
  costStats: CostStats | null
  dailyCosts: DailyCost[]
  cacheStats: CacheStats | null
  loading: boolean

  loadCostStats: (projectId: string) => Promise<void>
  loadDailyCosts: (projectId: string, days?: number) => Promise<void>
  loadCacheStats: () => Promise<void>
  invalidateCache: () => Promise<boolean>
}

export const useCostStore = create<CostState>((set) => ({
  costStats: null,
  dailyCosts: [],
  cacheStats: null,
  loading: false,

  loadCostStats: async (projectId: string) => {
    if (!window.electronAPI?.costStats) return
    set({ loading: true })
    try {
      const stats = await window.electronAPI.costStats(projectId)
      set({ costStats: stats })
    } catch (err) {
      console.error('Failed to load cost stats:', err)
    } finally {
      set({ loading: false })
    }
  },

  loadDailyCosts: async (projectId: string, days?: number) => {
    if (!window.electronAPI?.costHistory) return
    try {
      const costs = await window.electronAPI.costHistory(projectId, days)
      set({ dailyCosts: costs || [] })
    } catch (err) {
      console.error('Failed to load daily costs:', err)
    }
  },

  loadCacheStats: async () => {
    if (!window.electronAPI?.cacheStats) return
    try {
      const stats = await window.electronAPI.cacheStats()
      set({ cacheStats: stats })
    } catch (err) {
      console.error('Failed to load cache stats:', err)
    }
  },

  invalidateCache: async () => {
    if (!window.electronAPI?.cacheInvalidate) return false
    try {
      await window.electronAPI.cacheInvalidate()
      set({ cacheStats: { totalEntries: 0, totalHits: 0, totalTokensSaved: 0 } })
      return true
    } catch (err) {
      console.error('Failed to invalidate cache:', err)
      return false
    }
  }
}))
