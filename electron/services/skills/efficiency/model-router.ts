/**
 * Model Router — Complexity-based model selection
 */
import { getModelsByTier, type ModelDefinition } from './model-registry'

type Complexity = 'simple' | 'moderate' | 'complex' | 'expert'

export function classifyComplexity(query: string, context?: string): Complexity {
  const totalLength = query.length + (context?.length || 0)
  const lower = query.toLowerCase()

  // Expert indicators
  if (/\b(architect|redesign|security audit|migration plan|benchmark)\b/.test(lower)) return 'expert'

  // Complex indicators
  if (/\b(refactor|implement|design|analyze|compare|debug complex)\b/.test(lower)) return 'complex'
  if (totalLength > 2000) return 'complex'
  if (query.includes('```') && query.split('```').length > 3) return 'complex'

  // Moderate indicators
  if (/\b(explain|how does|why|create|write|fix|update)\b/.test(lower)) return 'moderate'
  if (totalLength > 500) return 'moderate'

  return 'simple'
}

export function selectModel(complexity: Complexity, availableModels?: ModelDefinition[]): ModelDefinition | null {
  const models = availableModels || getModelsByTier(complexity)
  if (models.length === 0) {
    // Fallback to any model in adjacent tier
    const tiers: Complexity[] = ['simple', 'moderate', 'complex', 'expert']
    const idx = tiers.indexOf(complexity)
    for (let i = 1; i <= 3; i++) {
      const tryIdx = idx + (i % 2 === 1 ? -i : i)
      if (tryIdx >= 0 && tryIdx < tiers.length) {
        const fallback = getModelsByTier(tiers[tryIdx])
        if (fallback.length > 0) return fallback[0]
      }
    }
    return null
  }
  // Pick cheapest model for the tier
  return models[0]
}

export function routeToModel(query: string, context?: string): { model: ModelDefinition | null, complexity: Complexity } {
  const complexity = classifyComplexity(query, context)
  const model = selectModel(complexity)
  return { model, complexity }
}