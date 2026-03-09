import { getCrystalsByProject, deleteCrystal, reinforceCrystal, saveCrystal } from './crystal-store'
import type { KnowledgeCrystal } from '../agents/types'
import type { ConsolidationResult } from './types'

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000

function extractWords(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
}

function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 0
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  const aArray = Array.from(setA)
  for (let i = 0; i < aArray.length; i++) {
    if (setB.has(aArray[i])) intersection++
  }
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

export async function consolidateCrystals(projectId: string): Promise<ConsolidationResult> {
  const allCrystals = getCrystalsByProject(projectId, 10000)
  let mergedCount = 0
  let prunedCount = 0
  let reinforcedCount = 0

  const grouped = new Map<string, KnowledgeCrystal[]>()
  for (const crystal of allCrystals) {
    const key = `${crystal.crystalType}:${crystal.domain || 'general'}`
    const group = grouped.get(key) || []
    group.push(crystal)
    grouped.set(key, group)
  }

  const toDelete = new Set<string>()
  const toReinforce = new Set<string>()

  const groupEntries = Array.from(grouped.values())
  for (let g = 0; g < groupEntries.length; g++) {
    const group = groupEntries[g]
    if (group.length < 2) continue

    for (let i = 0; i < group.length; i++) {
      if (toDelete.has(group[i].id)) continue

      const wordsI = extractWords(group[i].content)

      for (let j = i + 1; j < group.length; j++) {
        if (toDelete.has(group[j].id)) continue

        const wordsJ = extractWords(group[j].content)
        const similarity = jaccardSimilarity(wordsI, wordsJ)

        if (similarity > 0.75) {
          const keepIdx = group[i].reinforcementCount >= group[j].reinforcementCount ? i : j
          const removeIdx = keepIdx === i ? j : i

          toDelete.add(group[removeIdx].id)
          toReinforce.add(group[keepIdx].id)

          const kept = group[keepIdx]
          const removed = group[removeIdx]
          const mergedTags = Array.from(new Set([...kept.tags, ...removed.tags]))
          saveCrystal({ ...kept, tags: mergedTags })

          mergedCount++
        }
      }
    }
  }

  const reinforceArray = Array.from(toReinforce)
  for (let i = 0; i < reinforceArray.length; i++) {
    reinforceCrystal(reinforceArray[i])
    reinforcedCount++
  }

  const deleteArray = Array.from(toDelete)
  for (let i = 0; i < deleteArray.length; i++) {
    deleteCrystal(deleteArray[i])
  }

  const now = Date.now()
  for (const crystal of allCrystals) {
    if (toDelete.has(crystal.id)) continue
    const age = now - crystal.createdAt
    if (age > THIRTY_DAYS_MS && crystal.confidence < 0.3 && crystal.accessCount === 0) {
      deleteCrystal(crystal.id)
      prunedCount++
    }
  }

  const remaining = allCrystals.length - toDelete.size - prunedCount

  console.log(`[CrystalConsolidator] Consolidated: ${mergedCount} merged, ${prunedCount} pruned, ${reinforcedCount} reinforced, ${remaining} remaining`)

  return {
    merged: mergedCount,
    pruned: prunedCount,
    reinforced: reinforcedCount,
    totalCrystals: remaining
  }
}

export function pruneStale(projectId: string, maxAgeDays = 90, minConfidence = 0.4): number {
  const allCrystals = getCrystalsByProject(projectId, 10000)
  const maxAgeMs = maxAgeDays * 24 * 60 * 60 * 1000
  const now = Date.now()
  let pruned = 0

  for (const crystal of allCrystals) {
    const age = now - crystal.createdAt
    if (age > maxAgeMs && crystal.confidence < minConfidence && crystal.accessCount === 0) {
      deleteCrystal(crystal.id)
      pruned++
    }
  }

  console.log(`[CrystalConsolidator] Pruned ${pruned} stale crystals (maxAge: ${maxAgeDays}d, minConfidence: ${minConfidence})`)
  return pruned
}
