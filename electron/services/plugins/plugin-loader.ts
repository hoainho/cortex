import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import type { PluginManifest, LoadedPlugin, PluginScope } from './types'

const REQUIRED_FIELDS: (keyof PluginManifest)[] = ['name', 'version', 'description', 'author']

function validateManifest(raw: unknown): raw is PluginManifest {
  if (!raw || typeof raw !== 'object') return false
  const obj = raw as Record<string, unknown>
  return REQUIRED_FIELDS.every(f => typeof obj[f] === 'string')
}

function loadManifest(pluginDir: string): PluginManifest | null {
  const manifestPath = join(pluginDir, 'plugin.json')
  if (!existsSync(manifestPath)) return null
  try {
    const raw = JSON.parse(readFileSync(manifestPath, 'utf-8'))
    return validateManifest(raw) ? raw : null
  } catch {
    return null
  }
}

function scanPluginDir(dir: string, scope: PluginScope): LoadedPlugin[] {
  if (!existsSync(dir)) return []
  const plugins: LoadedPlugin[] = []

  try {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const pluginDir = join(dir, entry.name)
      const manifest = loadManifest(pluginDir)
      if (!manifest) continue

      plugins.push({
        manifest,
        installPath: pluginDir,
        scope,
        status: 'enabled',
        loadedAt: Date.now()
      })
    }
  } catch {
    // directory not accessible
  }

  return plugins
}

const loadedPlugins = new Map<string, LoadedPlugin>()

export function loadAllPlugins(projectPath?: string): LoadedPlugin[] {
  loadedPlugins.clear()

  const userDir = join(homedir(), '.cortex', 'plugins')
  for (const plugin of scanPluginDir(userDir, 'user')) {
    loadedPlugins.set(plugin.manifest.name, plugin)
  }

  if (projectPath) {
    const projectDir = join(projectPath, '.cortex', 'plugins')
    for (const plugin of scanPluginDir(projectDir, 'project')) {
      loadedPlugins.set(plugin.manifest.name, plugin)
    }
  }

  return Array.from(loadedPlugins.values())
}

export function getPlugin(name: string): LoadedPlugin | null {
  return loadedPlugins.get(name) ?? null
}

export function getAllPlugins(): LoadedPlugin[] {
  return Array.from(loadedPlugins.values())
}

export function enablePlugin(name: string): boolean {
  const plugin = loadedPlugins.get(name)
  if (!plugin) return false
  plugin.status = 'enabled'
  return true
}

export function disablePlugin(name: string): boolean {
  const plugin = loadedPlugins.get(name)
  if (!plugin) return false
  plugin.status = 'disabled'
  return true
}
