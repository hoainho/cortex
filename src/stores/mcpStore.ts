import { create } from 'zustand'

export interface MCPServerInfo {
  id: string
  name: string
  transportType: 'stdio' | 'sse'
  command?: string
  args?: string
  serverUrl?: string
  enabled: boolean
  connected: boolean
  toolCount: number
  resourceCount: number
  lastError?: string
  lastChecked: number
}

interface MCPState {
  servers: MCPServerInfo[]
  loading: boolean
  connecting: string | null

  loadServers: () => Promise<void>
  addServer: (config: {
    name: string
    transportType: 'stdio' | 'sse'
    command?: string
    args?: string
    serverUrl?: string
    env?: string
  }) => Promise<MCPServerInfo | null>
  removeServer: (id: string) => Promise<boolean>
  connectServer: (id: string) => Promise<{ success: boolean, error?: string }>
  disconnectServer: (id: string) => Promise<boolean>
  checkHealth: (id: string) => Promise<void>
}

export const useMCPStore = create<MCPState>((set, get) => ({
  servers: [],
  loading: false,
  connecting: null,

  loadServers: async () => {
    if (!window.electronAPI?.mcpList) return
    set({ loading: true })
    try {
      const servers = await window.electronAPI.mcpList()
      set({ servers: servers || [] })
    } catch (err) {
      console.error('Failed to load MCP servers:', err)
    } finally {
      set({ loading: false })
    }
  },

  addServer: async (config) => {
    if (!window.electronAPI?.mcpAdd) return null
    try {
      const server = await window.electronAPI.mcpAdd(config)
      if (server) {
        await get().loadServers()
      }
      return server
    } catch (err) {
      console.error('Failed to add MCP server:', err)
      return null
    }
  },

  removeServer: async (id) => {
    if (!window.electronAPI?.mcpRemove) return false
    try {
      const result = await window.electronAPI.mcpRemove(id)
      if (result) {
        await get().loadServers()
      }
      return result
    } catch (err) {
      console.error('Failed to remove MCP server:', err)
      return false
    }
  },

  connectServer: async (id) => {
    if (!window.electronAPI?.mcpConnect) return { success: false, error: 'API not available' }
    set({ connecting: id })
    try {
      const result = await window.electronAPI.mcpConnect(id)
      await get().loadServers()
      return result
    } catch (err) {
      console.error('Failed to connect MCP server:', err)
      return { success: false, error: String(err) }
    } finally {
      set({ connecting: null })
    }
  },

  disconnectServer: async (id) => {
    if (!window.electronAPI?.mcpDisconnect) return false
    set({ connecting: id })
    try {
      const result = await window.electronAPI.mcpDisconnect(id)
      await get().loadServers()
      return result
    } catch (err) {
      console.error('Failed to disconnect MCP server:', err)
      return false
    } finally {
      set({ connecting: null })
    }
  },

  checkHealth: async (id) => {
    if (!window.electronAPI?.mcpHealth) return
    try {
      await window.electronAPI.mcpHealth(id)
      await get().loadServers()
    } catch (err) {
      console.error('Failed to check MCP health:', err)
    }
  }
}))
