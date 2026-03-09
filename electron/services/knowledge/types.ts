import type { KnowledgeCrystal } from '../agents/types'

export type { KnowledgeCrystal, CrystalType, CrystalExtractionResult, DbKnowledgeCrystal } from '../agents/types'

export interface CrystalSearchResult {
  crystal: KnowledgeCrystal
  score: number
  matchType: 'exact' | 'semantic' | 'tag'
}

export interface ConsolidationResult {
  merged: number
  pruned: number
  reinforced: number
  totalCrystals: number
}

export interface CrystalStats {
  totalCrystals: number
  byType: Record<string, number>
  byDomain: Record<string, number>
  averageConfidence: number
  averageReinforcementCount: number
}
