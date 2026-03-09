/**
 * Skill Router — Intent classification and skill routing
 */

import type { SkillInput, SkillOutput, SkillRouteResult, SkillCategory } from './types'
import { getActiveSkills, executeSkill } from './skill-registry'

interface IntentClassification {
  category: SkillCategory
  confidence: number
  keywords: string[]
}

const INTENT_KEYWORDS: Record<SkillCategory, string[]> = {
  rag: ['search', 'find', 'where', 'locate', 'look up', 'lookup', 'which file', 'what file', 'show me'],
  memory: ['remember', 'recall', 'memory', 'prefer', 'history', 'past', 'previously', 'forgot', 'my style', 'my preference'],
  code: ['analyze', 'architecture', 'impact', 'dependency', 'structure', 'diagram', 'refactor', 'code review'],
  agent: ['fix', 'implement', 'create', 'build', 'run', 'execute', 'debug', 'deploy', 'automate'],
  reasoning: ['plan', 'think', 'step by step', 'figure out', 'work through', 'solve', 'complex'],
  learning: ['learn', 'improve', 'optimize', 'feedback', 'train', 'adapt'],
  efficiency: ['cost', 'token', 'cache', 'compress', 'cheaper', 'faster', 'optimize cost'],
  tool: ['browse', 'navigate', 'screenshot', 'terminal', 'git', 'commit', 'branch']
}

export function classifyIntent(query: string): IntentClassification[] {
  const lower = query.toLowerCase()
  const classifications: IntentClassification[] = []

  for (const [category, keywords] of Object.entries(INTENT_KEYWORDS)) {
    const matched = keywords.filter(kw => lower.includes(kw))
    if (matched.length > 0) {
      const confidence = Math.min(0.9, 0.3 + matched.length * 0.2)
      classifications.push({
        category: category as SkillCategory,
        confidence,
        keywords: matched
      })
    }
  }

  // Sort by confidence
  classifications.sort((a, b) => b.confidence - a.confidence)

  // If no match, default to chat/rag
  if (classifications.length === 0) {
    // Question patterns suggest RAG
    if (/^(how|what|why|when|where|who|which|can|does|is|are)\b/i.test(query)) {
      classifications.push({ category: 'rag', confidence: 0.4, keywords: ['question_pattern'] })
    }
  }

  return classifications
}

export async function routeQuery(input: SkillInput): Promise<SkillRouteResult[]> {
  const intents = classifyIntent(input.query)
  const activeSkills = getActiveSkills()
  const results: SkillRouteResult[] = []

  for (const intent of intents) {
    // Find skills matching this intent category
    const matchingSkills = activeSkills.filter(s => s.category === intent.category)

    for (const skill of matchingSkills) {
      try {
        const canHandle = await skill.canHandle(input)
        if (canHandle) {
          results.push({
            skill,
            confidence: intent.confidence,
            reason: `Intent: ${intent.category} (keywords: ${intent.keywords.join(', ')})`
          })
        }
      } catch (err) {
        console.warn(`[SkillRouter] canHandle check failed for ${skill.name}:`, err)
      }
    }
  }

  // Add fallback chat skill (lowest confidence)
  const chatSkill = activeSkills.find(s => s.name === 'chat' || s.name === 'cortex-chat')
  if (chatSkill) {
    const alreadyIncluded = results.some(r => r.skill.name === chatSkill.name)
    if (!alreadyIncluded) {
      results.push({
        skill: chatSkill,
        confidence: 0.1,
        reason: 'Fallback: chat skill'
      })
    }
  }

  // Sort by confidence
  results.sort((a, b) => b.confidence - a.confidence)
  return results
}

export async function selectBestSkill(input: SkillInput): Promise<SkillRouteResult | null> {
  const routes = await routeQuery(input)
  return routes[0] || null
}

export async function executeRouted(input: SkillInput): Promise<SkillOutput> {
  const route = await selectBestSkill(input)

  if (!route) {
    return {
      content: 'No skill available to handle this query.',
      metadata: { error: 'no_matching_skill' }
    }
  }

  console.log(`[SkillRouter] Routing to '${route.skill.name}' (confidence: ${route.confidence.toFixed(2)}, reason: ${route.reason})`)

  try {
    return await executeSkill(route.skill.name, input)
  } catch (err) {
    console.error(`[SkillRouter] Execution failed for ${route.skill.name}:`, err)

    // Try fallback
    const routes = await routeQuery(input)
    const fallback = routes.find(r => r.skill.name !== route.skill.name)
    if (fallback) {
      console.log(`[SkillRouter] Falling back to '${fallback.skill.name}'`)
      return await executeSkill(fallback.skill.name, input)
    }

    return {
      content: `Skill execution failed: ${String(err)}`,
      metadata: { error: 'execution_failed', skill: route.skill.name }
    }
  }
}