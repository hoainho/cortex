import { create } from 'zustand'

export type SkillCategory = 'rag' | 'memory' | 'agent' | 'code' | 'learning' | 'efficiency' | 'reasoning' | 'tool'
export type SkillStatus = 'registered' | 'active' | 'inactive' | 'error' | 'loading'

export interface SkillMetrics {
  totalCalls: number
  successCount: number
  errorCount: number
  avgLatencyMs: number
  lastUsed: number | null
}

export interface SkillInfo {
  name: string
  version: string
  category: SkillCategory
  priority: string
  status: SkillStatus
  description: string
  metrics: SkillMetrics
  dependencies: string[]
  lastError?: string
}

export interface HealthReport {
  name: string
  healthy: boolean
  message?: string
}

interface SkillState {
  skills: SkillInfo[]
  healthReport: HealthReport[]
  loading: boolean
  executing: boolean

  loadSkills: (filter?: { category?: string; status?: string }) => Promise<void>
  activateSkill: (name: string) => Promise<boolean>
  deactivateSkill: (name: string) => Promise<boolean>
  executeSkill: (name: string, input: { query: string; projectId: string; conversationId?: string; mode?: string }) => Promise<string | null>
  routeAndExecute: (input: { query: string; projectId: string; mode?: string }) => Promise<string | null>
  loadHealth: () => Promise<void>
}

export const useSkillStore = create<SkillState>((set) => ({
  skills: [],
  healthReport: [],
  loading: false,
  executing: false,

  loadSkills: async (filter) => {
    if (!window.electronAPI?.skillList) return
    set({ loading: true })
    try {
      const skills = await window.electronAPI.skillList(filter)
      set({ skills: skills || [] })
    } catch (err) {
      console.error('Failed to load skills:', err)
    } finally {
      set({ loading: false })
    }
  },

  activateSkill: async (name: string) => {
    if (!window.electronAPI?.skillActivate) return false
    try {
      await window.electronAPI.skillActivate(name)
      const skills = await window.electronAPI.skillList()
      set({ skills: skills || [] })
      return true
    } catch (err) {
      console.error('Failed to activate skill:', err)
      return false
    }
  },

  deactivateSkill: async (name: string) => {
    if (!window.electronAPI?.skillDeactivate) return false
    try {
      await window.electronAPI.skillDeactivate(name)
      const skills = await window.electronAPI.skillList()
      set({ skills: skills || [] })
      return true
    } catch (err) {
      console.error('Failed to deactivate skill:', err)
      return false
    }
  },

  executeSkill: async (name, input) => {
    if (!window.electronAPI?.skillExecute) return null
    set({ executing: true })
    try {
      const result = await window.electronAPI.skillExecute(name, input)
      return result?.content || null
    } catch (err) {
      console.error('Failed to execute skill:', err)
      return null
    } finally {
      set({ executing: false })
    }
  },

  routeAndExecute: async (input) => {
    if (!window.electronAPI?.skillRoute) return null
    set({ executing: true })
    try {
      const result = await window.electronAPI.skillRoute(input)
      return result?.content || null
    } catch (err) {
      console.error('Failed to route skill:', err)
      return null
    } finally {
      set({ executing: false })
    }
  },

  loadHealth: async () => {
    if (!window.electronAPI?.skillHealth) return
    try {
      const report = await window.electronAPI.skillHealth()
      set({ healthReport: report || [] })
    } catch (err) {
      console.error('Failed to load health:', err)
    }
  }
}))
