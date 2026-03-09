import type { KnowledgeCrystal } from '../agents/types'

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0
  let dotProduct = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denominator = Math.sqrt(normA) * Math.sqrt(normB)
  return denominator === 0 ? 0 : dotProduct / denominator
}

function jaccardSimilarity(setA: string[], setB: string[]): number {
  if (setA.length === 0 && setB.length === 0) return 0
  const a = new Set(setA.map(s => s.toLowerCase()))
  const b = new Set(setB.map(s => s.toLowerCase()))
  let intersection = 0
  const aArray = Array.from(a)
  for (let i = 0; i < aArray.length; i++) {
    if (b.has(aArray[i])) intersection++
  }
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

function extractContentKeywords(content: string): string[] {
  return content
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 3)
}

function embeddingToArray(embedding: Buffer | null): number[] | null {
  if (!embedding || embedding.length === 0) return null
  const float32 = new Float32Array(embedding.buffer, embedding.byteOffset, embedding.byteLength / 4)
  return Array.from(float32)
}

function areSimilar(a: KnowledgeCrystal, b: KnowledgeCrystal): boolean {
  if (a.crystalType !== b.crystalType) return false

  const embA = embeddingToArray(a.embedding ?? null)
  const embB = embeddingToArray(b.embedding ?? null)

  if (embA && embB) {
    return cosineSimilarity(embA, embB) > 0.92
  }

  const tagSim = jaccardSimilarity(a.tags, b.tags)
  const keywordsA = extractContentKeywords(a.content)
  const keywordsB = extractContentKeywords(b.content)
  const contentSim = jaccardSimilarity(keywordsA, keywordsB)

  const combinedScore = tagSim * 0.4 + contentSim * 0.6
  return combinedScore > 0.7
}

function mergeCrystals(existing: KnowledgeCrystal, incoming: KnowledgeCrystal): KnowledgeCrystal {
  const mergedTags = Array.from(new Set([...existing.tags, ...incoming.tags]))
  return {
    ...existing,
    tags: mergedTags,
    confidence: Math.max(existing.confidence, incoming.confidence),
    reinforcementCount: existing.reinforcementCount + 1,
    lastReinforcedAt: Date.now()
  }
}

export async function deduplicateCrystals(
  _projectId: string,
  newCrystals: KnowledgeCrystal[],
  existingCrystals: KnowledgeCrystal[]
): Promise<{ unique: KnowledgeCrystal[]; merged: KnowledgeCrystal[]; duplicateIds: string[] }> {
  const unique: KnowledgeCrystal[] = []
  const merged: KnowledgeCrystal[] = []
  const duplicateIds: string[] = []

  for (const incoming of newCrystals) {
    let foundMatch = false

    for (const existing of existingCrystals) {
      if (areSimilar(incoming, existing)) {
        merged.push(mergeCrystals(existing, incoming))
        duplicateIds.push(incoming.id)
        foundMatch = true
        break
      }
    }

    if (!foundMatch) {
      unique.push(incoming)
    }
  }

  console.log(`[CrystalDedup] ${newCrystals.length} incoming → ${unique.length} unique, ${merged.length} merged, ${duplicateIds.length} duplicates`)
  return { unique, merged, duplicateIds }
}
