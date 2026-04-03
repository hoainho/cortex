import { join } from 'path'
import { homedir } from 'os'
import { loadInstructionsForProject } from './cortex-md-loader'
import type { CortexMdRule } from './types'

function globToRegex(pattern: string): RegExp {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '{{DOUBLE_STAR}}')
    .replace(/\*/g, '[^/]*')
    .replace(/{{DOUBLE_STAR}}/g, '.*')
    .replace(/\?/g, '[^/]')
  return new RegExp(`(^|/)${escaped}($|/)`, 'i')
}

function matchesGlob(filePath: string, pattern: string): boolean {
  try {
    return globToRegex(pattern).test(filePath)
  } catch {
    return filePath.includes(pattern)
  }
}

function fileMatchesRule(filePath: string, rule: CortexMdRule): boolean {
  if (!rule.paths?.length) return true

  const matches = rule.paths.some(p => matchesGlob(filePath, p))
  if (!matches) return false

  if (rule.exclude?.length) {
    const excluded = rule.exclude.some(p => matchesGlob(filePath, p))
    if (excluded) return false
  }

  return true
}

export async function getRulesForFile(filePath: string, projectPath: string): Promise<string[]> {
  const instructions = await loadInstructionsForProject(projectPath)
  const matching = instructions.rules.filter(r => r.paths?.length && fileMatchesRule(filePath, r))
  return matching.map(r => r.content).filter(Boolean)
}

export async function getUnconditionalRules(projectPath: string): Promise<string[]> {
  const instructions = await loadInstructionsForProject(projectPath)
  return instructions.rules.filter(r => !r.paths?.length).map(r => r.content)
}
