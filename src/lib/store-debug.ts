import { useChatStore } from '../stores/chatStore'
import { useProjectStore } from '../stores/projectStore'
import { useMemoryStore } from '../stores/memoryStore'
import { useCostStore } from '../stores/costStore'
import { useUIStore } from '../stores/uiStore'
import { useSkillStore } from '../stores/skillStore'

declare global {
  interface Window {
    __CORTEX_STORES?: Record<string, () => unknown>
  }
}

export function exposeStoresToDevTools(): void {
  if (process.env.NODE_ENV !== 'development' || typeof window === 'undefined') return

  window.__CORTEX_STORES = {
    chat: () => useChatStore.getState(),
    project: () => useProjectStore.getState(),
    memory: () => useMemoryStore.getState(),
    cost: () => useCostStore.getState(),
    ui: () => useUIStore.getState(),
    skill: () => useSkillStore.getState(),
  }

  console.info('[Cortex DevTools] Stores exposed → window.__CORTEX_STORES.<name>()')
}
