import { create } from 'zustand'

export interface LearningStats {
  totalFeedback: number
  totalTrainingPairs: number
  totalLearnedWeights: number
  positiveRatio: number
  lastTrainedAt: number | null
  compressionSavings: {
    tokensOriginal: number
    tokensCompressed: number
    savingsPercent: number
  }
}

export interface EventBreakdown {
  totalEvents: number
  eventBreakdown: Record<string, number>
}

interface LearningState {
  stats: LearningStats | null
  eventMetrics: EventBreakdown | null
  training: boolean
  loading: boolean

  loadStats: (projectId: string) => Promise<void>
  triggerTraining: (projectId: string) => Promise<boolean>
}

export const useLearningStore = create<LearningState>((set) => ({
  stats: null,
  eventMetrics: null,
  training: false,
  loading: false,

  loadStats: async (projectId: string) => {
    set({ loading: true })
    try {
      // Use the BrainDashboard's existing learning stats endpoint
      const stats = await window.electronAPI?.getLearningStats?.(projectId)
      if (stats) {
        set({ stats })
      }
    } catch (err) {
      console.error('Failed to load learning stats:', err)
    } finally {
      set({ loading: false })
    }
  },

  triggerTraining: async (projectId: string) => {
    set({ training: true })
    try {
      const result = await window.electronAPI?.triggerLearning?.(projectId)
      // Reload stats after training
      const stats = await window.electronAPI?.getLearningStats?.(projectId)
      if (stats) set({ stats })
      return !!result
    } catch (err) {
      console.error('Failed to trigger training:', err)
      return false
    } finally {
      set({ training: false })
    }
  }
}))
