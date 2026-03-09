/**
 * Model Registry — Model definitions with cost/quality metadata
 */

export interface ModelDefinition {
  id: string
  name: string
  provider: string
  costPer1kTokens: number
  qualityScore: number
  maxTokens: number
  supportsStreaming: boolean
  tier: 'simple' | 'moderate' | 'complex' | 'expert'
  tags: string[]
}

const models = new Map<string, ModelDefinition>()

// Pre-register default models
const defaults: ModelDefinition[] = [
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai', costPer1kTokens: 0.00015, qualityScore: 0.7, maxTokens: 128000, supportsStreaming: true, tier: 'simple', tags: ['fast', 'cheap'] },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai', costPer1kTokens: 0.005, qualityScore: 0.85, maxTokens: 128000, supportsStreaming: true, tier: 'moderate', tags: ['balanced'] },
  { id: 'claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', provider: 'anthropic', costPer1kTokens: 0.003, qualityScore: 0.9, maxTokens: 200000, supportsStreaming: true, tier: 'complex', tags: ['coding', 'analysis'] },
  { id: 'claude-3-opus', name: 'Claude 3 Opus', provider: 'anthropic', costPer1kTokens: 0.015, qualityScore: 0.95, maxTokens: 200000, supportsStreaming: true, tier: 'expert', tags: ['best', 'expensive'] },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek', costPer1kTokens: 0.00014, qualityScore: 0.75, maxTokens: 64000, supportsStreaming: true, tier: 'simple', tags: ['fast', 'cheap'] },
  { id: 'gemini-pro', name: 'Gemini Pro', provider: 'google', costPer1kTokens: 0.00025, qualityScore: 0.8, maxTokens: 128000, supportsStreaming: true, tier: 'moderate', tags: ['balanced'] }
]

for (const model of defaults) models.set(model.id, model)

export function registerModel(definition: ModelDefinition): void {
  models.set(definition.id, definition)
}

export function getModel(id: string): ModelDefinition | undefined {
  return models.get(id)
}

export function listModels(filter?: { tier?: string, provider?: string }): ModelDefinition[] {
  let result = Array.from(models.values())
  if (filter?.tier) result = result.filter(m => m.tier === filter.tier)
  if (filter?.provider) result = result.filter(m => m.provider === filter.provider)
  return result
}

export function getModelsByTier(tier: 'simple' | 'moderate' | 'complex' | 'expert'): ModelDefinition[] {
  return Array.from(models.values()).filter(m => m.tier === tier).sort((a, b) => a.costPer1kTokens - b.costPer1kTokens)
}