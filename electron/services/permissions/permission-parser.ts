import type { PermissionRule, PermissionAction, PermissionScope } from './types'

const SUPPORTED_TOOLS = new Set(['Bash', 'Read', 'Edit', 'Write', 'WebFetch', 'Agent', 'Grep', 'Glob'])

export function parsePermissionRule(raw: string, action: PermissionAction, scope: PermissionScope): PermissionRule | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  const parenMatch = trimmed.match(/^(\w+)\((.+)\)$/)
  if (parenMatch) {
    return { tool: parenMatch[1], specifier: parenMatch[2].trim(), action, scope }
  }

  return { tool: trimmed, action, scope }
}

export function parsePermissionRules(
  config: { allow?: string[]; ask?: string[]; deny?: string[] },
  scope: PermissionScope
): PermissionRule[] {
  const rules: PermissionRule[] = []

  for (const raw of config.deny ?? []) {
    const rule = parsePermissionRule(raw, 'deny', scope)
    if (rule) rules.push(rule)
  }

  for (const raw of config.ask ?? []) {
    const rule = parsePermissionRule(raw, 'ask', scope)
    if (rule) rules.push(rule)
  }

  for (const raw of config.allow ?? []) {
    const rule = parsePermissionRule(raw, 'allow', scope)
    if (rule) rules.push(rule)
  }

  return rules
}

export function ruleMatchesToolCall(rule: PermissionRule, toolName: string, toolInput?: string): boolean {
  if (rule.tool !== toolName && rule.tool !== '*') return false
  if (!rule.specifier || rule.specifier === '*') return true

  const specifier = rule.specifier

  if (specifier.includes('*')) {
    const parts = specifier.split('*')
    const prefix = parts[0]
    const suffix = parts[parts.length - 1]
    const candidate = toolInput ?? ''
    if (prefix && !candidate.startsWith(prefix)) return false
    if (suffix && !candidate.endsWith(suffix)) return false
    return true
  }

  return (toolInput ?? '').startsWith(specifier) || (toolInput ?? '') === specifier
}

export function isSupportedTool(toolName: string): boolean {
  return SUPPORTED_TOOLS.has(toolName)
}
