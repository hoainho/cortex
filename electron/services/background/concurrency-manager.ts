import type { ConcurrencyConfig } from './types'

const DEFAULT_CONFIG: ConcurrencyConfig = {
  maxGlobal: 10,
  maxPerProvider: {},
  maxPerCategory: {},
  queueTimeout: 300_000,
  taskTimeout: 600_000
}

let config: ConcurrencyConfig = { ...DEFAULT_CONFIG, maxPerProvider: {}, maxPerCategory: {} }

const activeSlots = new Map<string, { provider?: string; category?: string }>()

export function configureConcurrency(partial: Partial<ConcurrencyConfig>): void {
  config = {
    ...config,
    ...partial,
    maxPerProvider: partial.maxPerProvider ?? config.maxPerProvider,
    maxPerCategory: partial.maxPerCategory ?? config.maxPerCategory
  }
}

export function getConcurrencyConfig(): ConcurrencyConfig {
  return { ...config, maxPerProvider: { ...config.maxPerProvider }, maxPerCategory: { ...config.maxPerCategory } }
}

export function canRunTask(provider?: string, category?: string): boolean {
  if (activeSlots.size >= config.maxGlobal) return false

  if (provider && config.maxPerProvider[provider] !== undefined) {
    const count = getActiveCountByProvider(provider)
    if (count >= config.maxPerProvider[provider]) return false
  }

  if (category && config.maxPerCategory[category] !== undefined) {
    const count = getActiveCountByCategory(category)
    if (count >= config.maxPerCategory[category]) return false
  }

  return true
}

export function acquireSlot(taskId: string, provider?: string, category?: string): boolean {
  if (!canRunTask(provider, category)) return false
  activeSlots.set(taskId, { provider, category })
  return true
}

export function releaseSlot(taskId: string): void {
  activeSlots.delete(taskId)
}

export function getActiveCount(): number {
  return activeSlots.size
}

export function getActiveCountByProvider(provider: string): number {
  let count = 0
  for (const slot of activeSlots.values()) {
    if (slot.provider === provider) count++
  }
  return count
}

export function getActiveCountByCategory(category: string): number {
  let count = 0
  for (const slot of activeSlots.values()) {
    if (slot.category === category) count++
  }
  return count
}

export function resetConcurrency(): void {
  config = { ...DEFAULT_CONFIG, maxPerProvider: {}, maxPerCategory: {} }
  activeSlots.clear()
}
