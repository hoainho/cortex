import { existsSync } from 'fs'
import { homedir, platform } from 'os'
import { delimiter, join, isAbsolute } from 'path'
import { execSync } from 'child_process'

const NODE_LOOKUP_DIRS = [
  '/usr/local/bin',
  '/usr/bin',
  '/opt/homebrew/bin',
  '/opt/local/bin',
  join(homedir(), '.volta', 'bin'),
  join(homedir(), '.fnm'),
  join(homedir(), 'Library', 'pnpm'),
  join(homedir(), '.bun', 'bin'),
  join(homedir(), '.npm-global', 'bin'),
  join(homedir(), '.local', 'bin'),
]

function listNvmVersions(): string[] {
  const nvmRoot = join(homedir(), '.nvm', 'versions', 'node')
  if (!existsSync(nvmRoot)) return []
  try {
    const { readdirSync } = require('fs') as typeof import('fs')
    return readdirSync(nvmRoot)
      .map((v: string) => join(nvmRoot, v, 'bin'))
      .filter((p: string) => existsSync(p))
  } catch {
    return []
  }
}

let cachedShellPath: string | null = null

function getShellPath(): string {
  if (cachedShellPath !== null) return cachedShellPath
  if (platform() === 'win32') {
    cachedShellPath = ''
    return ''
  }
  const candidates = [process.env.SHELL, '/bin/zsh', '/bin/bash', '/bin/sh'].filter(
    (s): s is string => Boolean(s) && existsSync(s as string)
  )
  for (const shell of candidates) {
    try {
      const out = execSync(`${shell} -lc 'echo "$PATH"'`, {
        encoding: 'utf8',
        timeout: 3000,
        stdio: ['ignore', 'pipe', 'ignore'],
        env: { ...process.env, HOME: process.env.HOME || homedir() },
      }).trim()
      if (out) {
        cachedShellPath = out
        return out
      }
    } catch {
      continue
    }
  }
  cachedShellPath = ''
  return ''
}

export function buildAugmentedPath(currentPath?: string): string {
  const base = currentPath ?? process.env.PATH ?? ''
  const segments = base ? base.split(delimiter) : []
  const shellPath = getShellPath()
  const shellSegments = shellPath ? shellPath.split(delimiter) : []
  const nvmDirs = listNvmVersions()
  const extras = [...NODE_LOOKUP_DIRS, ...nvmDirs, ...shellSegments]
  const seen = new Set<string>()
  const merged: string[] = []
  for (const dir of [...extras, ...segments]) {
    if (!dir || seen.has(dir)) continue
    if (!existsSync(dir)) continue
    seen.add(dir)
    merged.push(dir)
  }
  return merged.join(delimiter)
}

export function resolveExecutable(command: string, augmentedPath: string): string | null {
  if (isAbsolute(command)) {
    return existsSync(command) ? command : null
  }
  const isWin = platform() === 'win32'
  const exts = isWin ? (process.env.PATHEXT?.split(';') ?? ['.CMD', '.EXE', '.BAT']) : ['']
  const dirs = augmentedPath.split(delimiter).filter(Boolean)
  for (const dir of dirs) {
    for (const ext of exts) {
      const candidate = join(dir, command + ext)
      if (existsSync(candidate)) return candidate
    }
  }
  return null
}

export interface ResolvedCommand {
  command: string
  env: Record<string, string>
}

export class McpCommandResolutionError extends Error {
  constructor(
    public readonly command: string,
    public readonly searchedPath: string
  ) {
    const hint = platform() === 'darwin'
      ? 'On macOS, GUI apps do not inherit your shell PATH. Open Cortex Settings → MCP and set an absolute path (e.g. /opt/homebrew/bin/npx or /usr/local/bin/npx), or install Node.js from nodejs.org.'
      : 'Install Node.js, or set an absolute path to the command in Cortex Settings → MCP.'
    super(`Cortex could not find "${command}" on PATH. ${hint}`)
    this.name = 'McpCommandResolutionError'
  }
}

let resolverDiagnosticsLogged = false

export function resolveMcpCommand(
  command: string,
  extraEnv?: Record<string, string>
): ResolvedCommand {
  const augmentedPath = buildAugmentedPath(process.env.PATH)
  if (!resolverDiagnosticsLogged) {
    resolverDiagnosticsLogged = true
    const inheritedPath = process.env.PATH || '(empty)'
    const shellPathLen = getShellPath().length
    console.log('[MCPResolver] Inherited PATH:', inheritedPath.split(delimiter).slice(0, 6).join(':'))
    console.log('[MCPResolver] Shell login PATH chars:', shellPathLen)
    console.log('[MCPResolver] Augmented PATH (first 8):', augmentedPath.split(delimiter).slice(0, 8).join(':'))
  }
  const resolved = resolveExecutable(command, augmentedPath)
  if (!resolved) {
    console.error(`[MCPResolver] Failed to resolve "${command}". Searched: ${augmentedPath}`)
    throw new McpCommandResolutionError(command, augmentedPath)
  }
  const env: Record<string, string> = {}
  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string') env[k] = v
  }
  env.PATH = augmentedPath
  env.HOME = env.HOME || homedir()
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) env[k] = v
  }
  return { command: resolved, env }
}

export function _resetShellPathCacheForTests(): void {
  cachedShellPath = null
}
