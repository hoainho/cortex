import type { StateCreator } from 'zustand'
import type { ChatState, ThinkingSlice } from './types'

export const createThinkingSlice: StateCreator<
  ChatState,
  [],
  [],
  ThinkingSlice
> = (set, get) => ({
  thinkingSteps: new Map(),

  pushThinkingStep: (conversationId, step) => {
    set(state => {
      const newMap = new Map(state.thinkingSteps)
      const existing = newMap.get(conversationId) || []
      const idx = existing.findIndex(s => s.step === step.step)
      if (idx >= 0) {
        const updated = [...existing]
        updated[idx] = step
        newMap.set(conversationId, updated)
      } else {
        newMap.set(conversationId, [...existing, step])
      }
      return { thinkingSteps: newMap }
    })
  },

  clearThinkingSteps: (conversationId) => {
    set(state => {
      const newMap = new Map(state.thinkingSteps)
      newMap.delete(conversationId)
      return { thinkingSteps: newMap }
    })
  },

  getThinkingSteps: (conversationId) =>
    get().thinkingSteps.get(conversationId) || []
})
