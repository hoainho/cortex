import type { TaskCategory, RoutingDecision } from './types'
import { CATEGORY_CONFIGS } from './category-config'

const SLASH_COMMAND_MAP: Record<string, TaskCategory> = {
  review: 'deep',
  'pr-code-reviewer': 'deep',
  security: 'deep',
  performance: 'deep',
  'multi-agent': 'deep',
  'init-deep': 'deep',
  'frontend-ui-ux': 'visual-engineering',
  playwright: 'visual-engineering',
  'dev-browser': 'visual-engineering',
  architect: 'ultrabrain',
  blog: 'writing',
  reddit: 'writing',
  handoff: 'writing',
  idea: 'writing',
  implement: 'unspecified-high',
  refactor: 'unspecified-high',
  'ralph-loop': 'unspecified-high',
  'ulw-loop': 'unspecified-high',
  'start-work': 'unspecified-high',
  team: 'unspecified-high',
  test: 'quick',
  'rri-t-testing': 'quick',
  'code-quality': 'quick',
  'dependency-audit': 'quick',
  'api-contract': 'quick',
  'diff-review': 'quick',
  'git-master': 'quick',
  'rtk-setup': 'quick',
  migration: 'unspecified-high',
  'nano-brain-init': 'quick',
  'nano-brain-reindex': 'quick',
  'nano-brain-status': 'quick',
  'cancel-ralph': 'quick',
  'stop-continuation': 'quick'
}

const KEYWORD_RULES: Array<{ patterns: RegExp[]; category: TaskCategory }> = [
  { patterns: [/\bUI\b/i, /\bCSS\b/i, /\bfrontend\b/i, /\bdesign\b/i, /\blayout\b/i, /\bstyl(e|ing)\b/i, /\banimation\b/i, /\bcomponent\b/i, /\btailwind\b/i], category: 'visual-engineering' },
  { patterns: [/\barchitecture\b/i, /\balgorithm\b/i, /\bdesign pattern\b/i, /\bscalability\b/i, /\bsystem design\b/i, /\btrade.?off\b/i], category: 'ultrabrain' },
  { patterns: [/\bfix\b/i, /\btypo\b/i, /\brename\b/i, /\bremove\b/i, /\bdelete\b/i, /\bupdate version\b/i], category: 'quick' },
  { patterns: [/\bdoc(ument)?s?\b/i, /\breadme\b/i, /\bexplain\b/i, /\bdescribe\b/i, /\bwrite (a |an )?blog\b/i, /\bsummar(y|ize)\b/i], category: 'writing' },
  { patterns: [/\bcreative\b/i, /\bunconventional\b/i, /\binnovate\b/i, /\boutside.the.box\b/i], category: 'artistry' }
]

function resolveFromKeywords(prompt: string): { category: TaskCategory; confidence: number } | null {
  let best: { category: TaskCategory; matchCount: number } | null = null
  for (const rule of KEYWORD_RULES) {
    const matchCount = rule.patterns.filter(p => p.test(prompt)).length
    if (matchCount > 0 && (!best || matchCount > best.matchCount)) {
      best = { category: rule.category, matchCount }
    }
  }
  if (!best) return null
  return { category: best.category, confidence: best.matchCount >= 2 ? 0.8 : 0.5 }
}

export function resolveCategory(input: {
  prompt?: string
  category?: TaskCategory
  slashCommand?: string
}): RoutingDecision {
  if (input.category && CATEGORY_CONFIGS[input.category]) {
    const config = CATEGORY_CONFIGS[input.category]
    return {
      category: input.category,
      model: config.defaultModel,
      config,
      confidence: 1.0,
      reason: 'Explicit category provided'
    }
  }

  if (input.slashCommand) {
    const cmd = input.slashCommand.replace(/^\//, '')
    const category = SLASH_COMMAND_MAP[cmd]
    if (category) {
      const config = CATEGORY_CONFIGS[category]
      return {
        category,
        model: config.defaultModel,
        config,
        confidence: 0.9,
        reason: `Slash command /${cmd} → ${category}`
      }
    }
  }

  if (input.prompt) {
    const keywordResult = resolveFromKeywords(input.prompt)
    if (keywordResult) {
      const config = CATEGORY_CONFIGS[keywordResult.category]
      return {
        category: keywordResult.category,
        model: config.defaultModel,
        config,
        confidence: keywordResult.confidence,
        reason: `Keyword analysis → ${keywordResult.category}`
      }
    }

    const fallbackCategory: TaskCategory = input.prompt.length > 500 ? 'unspecified-high' : 'unspecified-low'
    const config = CATEGORY_CONFIGS[fallbackCategory]
    return {
      category: fallbackCategory,
      model: config.defaultModel,
      config,
      confidence: 0.3,
      reason: `Default fallback based on prompt length (${input.prompt.length} chars)`
    }
  }

  const config = CATEGORY_CONFIGS['unspecified-low']
  return {
    category: 'unspecified-low',
    model: config.defaultModel,
    config,
    confidence: 0.1,
    reason: 'No input provided — using lowest category'
  }
}
