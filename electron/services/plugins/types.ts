export interface PluginManifest {
  name: string
  version: string
  description: string
  author: string
  license?: string
  homepage?: string
  permissions: PluginPermission[]
  components: PluginComponents
  cortexVersion?: string
}

export type PluginPermission =
  | 'read_files'
  | 'write_files'
  | 'network'
  | 'execute_bash'
  | 'read_memory'
  | 'write_memory'

export interface PluginComponents {
  agents?: string[]
  skills?: string[]
  hooks?: string[]
  rules?: string[]
  tools?: string[]
}

export type PluginScope = 'project' | 'user'
export type PluginStatus = 'enabled' | 'disabled' | 'error' | 'loading'

export interface LoadedPlugin {
  manifest: PluginManifest
  installPath: string
  scope: PluginScope
  status: PluginStatus
  error?: string
  loadedAt: number
}

export interface PluginInstallResult {
  success: boolean
  plugin?: LoadedPlugin
  error?: string
}
