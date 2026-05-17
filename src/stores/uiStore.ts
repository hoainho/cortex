import { create } from 'zustand'
import type { ResponseMode } from '../types'
import { useAutoscanStore } from './autoscanStore'

interface UIState {
  sidebarCollapsed: boolean
  sidebarWidth: number
  mode: ResponseMode
  theme: 'light' | 'dark'
  newProjectModalOpen: boolean
  settingsOpen: boolean
  architectureOpen: boolean
  dashboardOpen: boolean
  onboardingOpen: boolean
  memoryOpen: boolean
  skillsOpen: boolean
  learningOpen: boolean
  costOpen: boolean
  agentOpen: boolean
  trainingIntelligenceOpen: boolean
  autoScanEnabled: boolean

  toggleSidebar: () => void
  setMode: (mode: ResponseMode) => void
  setTheme: (theme: 'light' | 'dark') => void
  toggleTheme: () => void
  openNewProjectModal: () => void
  closeNewProjectModal: () => void
  toggleSettings: () => void
  setArchitectureOpen: (open: boolean) => void
  setDashboardOpen: (open: boolean) => void
  setOnboardingOpen: (open: boolean) => void
  setMemoryOpen: (open: boolean) => void
  setSkillsOpen: (open: boolean) => void
  setLearningOpen: (open: boolean) => void
  setCostOpen: (open: boolean) => void
  setAgentOpen: (open: boolean) => void
  setTrainingIntelligenceOpen: (open: boolean) => void
  toggleAutoScan: () => void
}

// Load persisted theme from localStorage
const getInitialTheme = (): 'light' | 'dark' => {
  try {
    const stored = localStorage.getItem('cortex-theme')
    if (stored === 'dark' || stored === 'light') return stored
  } catch {}
  return 'dark'
}

function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.setAttribute('data-theme', theme)
  localStorage.setItem('cortex-theme', theme)
}

const initialTheme = getInitialTheme()
applyTheme(initialTheme)

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  sidebarWidth: 260,
  mode: 'engineering',
  theme: initialTheme,
  newProjectModalOpen: false,
  settingsOpen: false,
  architectureOpen: false,
  dashboardOpen: false,
  onboardingOpen: false,
  memoryOpen: false,
  skillsOpen: false,
  learningOpen: false,
  costOpen: false,
  agentOpen: false,
  trainingIntelligenceOpen: false,
  autoScanEnabled: true,

  toggleSidebar: () =>
    set((state) => ({
      sidebarCollapsed: !state.sidebarCollapsed,
      sidebarWidth: state.sidebarCollapsed ? 260 : 68
    })),

  setMode: (mode) => set({ mode }),

  setTheme: (theme) => {
    applyTheme(theme)
    set({ theme })
  },

  toggleTheme: () =>
    set((state) => {
      const next = state.theme === 'light' ? 'dark' : 'light'
      applyTheme(next)
      return { theme: next }
    }),

  openNewProjectModal: () => set({ newProjectModalOpen: true }),
  closeNewProjectModal: () => set({ newProjectModalOpen: false }),

  toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
  setArchitectureOpen: (open) => set({ architectureOpen: open }),
  setDashboardOpen: (open) => set({ dashboardOpen: open }),
  setOnboardingOpen: (open) => set({ onboardingOpen: open }),
  setMemoryOpen: (open) => set({ memoryOpen: open }),
  setSkillsOpen: (open) => set({ skillsOpen: open }),
  setLearningOpen: (open) => set({ learningOpen: open }),
  setCostOpen: (open) => set({ costOpen: open }),
  setAgentOpen: (open) => set({ agentOpen: open }),
  setTrainingIntelligenceOpen: (open) => set({ trainingIntelligenceOpen: open }),

  toggleAutoScan: () => {
    set((state) => ({ autoScanEnabled: !state.autoScanEnabled }));
    useAutoscanStore.getState().updateAutoScanEnabled(!useUIStore.getState().autoScanEnabled);
  }
}))

setTimeout(() => {
  const loadAutoScanState = async () => {
    try {
      const projectId = window.electronAPI?.getCurrentProjectId?.()
      if (!projectId) return
      
      const enabled = await window.electronAPI?.project?.getAutoScanEnabled(projectId)
      if (enabled !== undefined) {
        useUIStore.getState().autoScanEnabled = enabled
      }
    } catch (err) {
      console.error('[UIStore] Failed to load AutoScan enabled state:', err)
    }
  }
  
  loadAutoScanState()
}, 100)