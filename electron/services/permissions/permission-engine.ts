import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import { parsePermissionRules, ruleMatchesToolCall } from './permission-parser'
import { isYoloModeEnabled } from './yolo-mode'
import type { PermissionRule, PermissionDecision, PermissionMode, PermissionConfig, PermissionAction, PermissionScope } from './types'

let activeMode: PermissionMode = 'default'
const ruleCache = new Map<string, PermissionDecision>()
let loadedRules: PermissionRule[] = []

function loadSettingsFile(filePath: string): Partial<PermissionConfig> {
  if (!existsSync(filePath)) return {}
  try {
    const raw = readFileSync(filePath, 'utf-8')
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

export function loadPermissionRules(projectPath?: string): void {
  const rules: PermissionRule[] = []

  const userSettings = loadSettingsFile(join(homedir(), '.cortex', 'settings.json'))
  rules.push(...parsePermissionRules(userSettings, 'user'))

  if (projectPath) {
    const projectSettings = loadSettingsFile(join(projectPath, '.cortex', 'settings.json'))
    rules.push(...parsePermissionRules(projectSettings, 'project'))
    if (projectSettings.defaultMode) activeMode = projectSettings.defaultMode
  }

  loadedRules = rules
  ruleCache.clear()
}

export function setPermissionMode(mode: PermissionMode): void {
  activeMode = mode
}

export function getPermissionMode(): PermissionMode {
  return activeMode
}

const FILE_RW_TOOLS = new Set<string>([
  'Read', 'Write', 'Edit',
  'cortex_read_file', 'cortex_read_files', 'cortex_read_document',
  'cortex_write_file',
  'cortex_edit_file', 'cortex_edit_file_lines', 'cortex_edit_files',
  'cortex_list_directory', 'cortex_grep_search',
  'cortex_move_file', 'cortex_delete_file',
])

function isFileReadWriteTool(toolName: string): boolean {
  return FILE_RW_TOOLS.has(toolName)
}

export function evaluate(toolName: string, toolInput?: string): PermissionDecision {
  const cacheKey = `${toolName}:${toolInput ?? ''}`
  if (ruleCache.has(cacheKey)) return ruleCache.get(cacheKey)!

  if (activeMode === 'plan' && ['Edit', 'Write', 'Bash'].includes(toolName)) {
    const decision: PermissionDecision = { action: 'deny', reason: 'plan mode: write operations disabled' }
    ruleCache.set(cacheKey, decision)
    return decision
  }

  // SECURITY: YOLO mode auto-allows every tool. System paths are still
  // protected separately in path-access-policy.ts (kept out of cache so
  // toggling the setting takes effect immediately).
  if (isYoloModeEnabled()) {
    return { action: 'allow', reason: 'YOLO mode: auto-approved' }
  }

  if (activeMode === 'acceptEdits' && ['Edit', 'Write'].includes(toolName)) {
    const decision: PermissionDecision = { action: 'allow', reason: 'acceptEdits mode' }
    ruleCache.set(cacheKey, decision)
    return decision
  }

  // SECURITY: file RW tools are auto-allowed; Bash/network/other tools still gated.
  if (isFileReadWriteTool(toolName)) {
    const decision: PermissionDecision = { action: 'allow', reason: 'file read/write auto-approved' }
    ruleCache.set(cacheKey, decision)
    return decision
  }

  if (activeMode === 'dontAsk') {
    const isPreApproved = loadedRules.some(
      r => r.action === 'allow' && ruleMatchesToolCall(r, toolName, toolInput)
    )
    if (!isPreApproved) {
      const decision: PermissionDecision = { action: 'deny', reason: 'dontAsk mode: not pre-approved' }
      ruleCache.set(cacheKey, decision)
      return decision
    }
  }

  for (const rule of loadedRules) {
    if (ruleMatchesToolCall(rule, toolName, toolInput)) {
      const decision: PermissionDecision = {
        action: rule.action,
        rule: `${rule.tool}${rule.specifier ? `(${rule.specifier})` : ''}`,
        reason: `matched ${rule.action} rule [${rule.scope}]`
      }
      ruleCache.set(cacheKey, decision)
      return decision
    }
  }

  const defaultDecision: PermissionDecision = { action: 'ask', reason: 'no matching rule, defaulting to ask' }
  ruleCache.set(cacheKey, defaultDecision)
  return defaultDecision
}

export function addPermissionRule(toolName: string, action: PermissionAction, scope: PermissionScope): void {
  const existing = loadedRules.findIndex(r => r.tool === toolName && r.action === action)
  if (existing === -1) {
    loadedRules.push({ tool: toolName, action, scope })
  }
  ruleCache.clear()
}

export function listRules(): PermissionRule[] {
  return [...loadedRules]
}

export function clearCache(): void {
  ruleCache.clear()
}
