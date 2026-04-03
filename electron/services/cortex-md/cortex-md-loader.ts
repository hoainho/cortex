import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { homedir } from 'os'
import { parseCortexMd } from './cortex-md-parser'
import type { LoadedInstructions, CortexMdSource, CortexMdRule } from './types'

const INSTRUCTION_FILENAMES = ['CORTEX.md', '.cortex/CORTEX.md', 'CLAUDE.md', 'AGENTS.md']
const MANAGED_PATH = process.platform === 'darwin'
  ? '/Library/Application Support/CortexCode/CORTEX.md'
  : '/etc/cortex/CORTEX.md'

const MAX_TOTAL_TOKENS = 4000

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

function parseRuleFrontmatter(content: string): { paths?: string[]; exclude?: string[] } {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/)
  if (!frontmatterMatch) return {}

  const yaml = frontmatterMatch[1]
  const result: { paths?: string[]; exclude?: string[] } = {}

  const pathsMatch = yaml.match(/^paths:\s*\n((?:\s+-\s+.+\n?)*)/m)
  if (pathsMatch) {
    result.paths = pathsMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean)
  }

  const excludeMatch = yaml.match(/^exclude:\s*\n((?:\s+-\s+.+\n?)*)/m)
  if (excludeMatch) {
    result.exclude = excludeMatch[1]
      .split('\n')
      .map(l => l.replace(/^\s+-\s+/, '').trim())
      .filter(Boolean)
  }

  return result
}

function stripRuleFrontmatter(content: string): string {
  return content.replace(/^---\n[\s\S]*?\n---\n?/, '').trim()
}

async function findInstructionFile(searchDir: string): Promise<string | null> {
  for (const name of INSTRUCTION_FILENAMES) {
    const candidate = join(searchDir, name)
    if (existsSync(candidate)) return candidate
  }
  return null
}

async function walkUpForInstructions(projectPath: string): Promise<string[]> {
  const found: string[] = []
  let current = resolve(projectPath)
  const root = current.split('/').slice(0, 2).join('/') || '/'

  while (current !== root) {
    const file = await findInstructionFile(current)
    if (file) found.push(file)
    const parent = dirname(current)
    if (parent === current) break
    current = parent
  }

  return found
}

async function loadRulesDir(rulesDir: string, scope: 'project' | 'user'): Promise<CortexMdRule[]> {
  if (!existsSync(rulesDir)) return []

  const rules: CortexMdRule[] = []
  try {
    const entries = readdirSync(rulesDir, { withFileTypes: true })
    for (const dirent of entries) {
      if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue
      const filePath = join(rulesDir, dirent.name)
      try {
        const raw = readFileSync(filePath, 'utf-8')
        const { paths, exclude } = parseRuleFrontmatter(raw)
        const content = stripRuleFrontmatter(raw)
        rules.push({ filePath, scope, content, paths, exclude })
      } catch {
        // skip unreadable rules
      }
    }
  } catch {
    // skip unreadable directory
  }

  return rules
}

export async function loadInstructionsForProject(projectPath: string): Promise<LoadedInstructions> {
  const sources: CortexMdSource[] = []
  const rules: CortexMdRule[] = []

  const managedPath = MANAGED_PATH
  if (existsSync(managedPath)) {
    const parsed = await parseCortexMd(managedPath)
    if (parsed) {
      sources.push({ filePath: parsed.filePath, scope: 'managed', content: parsed.content, tokenEstimate: parsed.tokenEstimate })
    }
  }

  const projectFiles = await walkUpForInstructions(projectPath)
  for (const filePath of projectFiles) {
    const parsed = await parseCortexMd(filePath)
    if (parsed && !sources.some(s => s.content === parsed.content)) {
      sources.push({ filePath: parsed.filePath, scope: 'project', content: parsed.content, tokenEstimate: parsed.tokenEstimate })
    }
  }

  const userFile = join(homedir(), '.cortex', 'CORTEX.md')
  const userFallbacks = [userFile, join(homedir(), '.claude', 'CLAUDE.md')]
  for (const uf of userFallbacks) {
    if (existsSync(uf)) {
      const parsed = await parseCortexMd(uf)
      if (parsed && !sources.some(s => s.content === parsed.content)) {
        sources.push({ filePath: parsed.filePath, scope: 'user', content: parsed.content, tokenEstimate: parsed.tokenEstimate })
        break
      }
    }
  }

  const projectRulesDir = join(projectPath, '.cortex', 'rules')
  const userRulesDir = join(homedir(), '.cortex', 'rules')
  rules.push(...await loadRulesDir(projectRulesDir, 'project'))
  rules.push(...await loadRulesDir(userRulesDir, 'user'))

  const unconditionalRules = rules.filter(r => !r.paths?.length)

  let totalTokens = 0
  const includedSources: CortexMdSource[] = []

  for (const source of sources) {
    if (totalTokens + source.tokenEstimate <= MAX_TOTAL_TOKENS) {
      includedSources.push(source)
      totalTokens += source.tokenEstimate
    } else {
      const remaining = MAX_TOTAL_TOKENS - totalTokens
      if (remaining > 100) {
        const truncated = source.content.slice(0, remaining * 4)
        includedSources.push({ ...source, content: truncated, tokenEstimate: remaining })
        totalTokens = MAX_TOTAL_TOKENS
      }
      break
    }
  }

  for (const rule of unconditionalRules) {
    if (totalTokens + estimateTokens(rule.content) <= MAX_TOTAL_TOKENS) {
      const ruleSource: CortexMdSource = {
        filePath: rule.filePath,
        scope: rule.scope,
        content: rule.content,
        tokenEstimate: estimateTokens(rule.content)
      }
      includedSources.push(ruleSource)
      totalTokens += ruleSource.tokenEstimate
    }
  }

  const parts = includedSources.map(s => {
    const label = s.scope === 'managed' ? 'Organization Policy' : s.scope === 'project' ? 'Project Instructions' : 'Personal Instructions'
    return `## ${label}\n${s.content}`
  })

  return {
    sources: includedSources,
    mergedContent: parts.join('\n\n---\n\n'),
    totalTokenEstimate: totalTokens,
    rules
  }
}
