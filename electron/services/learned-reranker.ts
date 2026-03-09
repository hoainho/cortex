import { createHash, randomUUID } from 'crypto'
import { getDb, learnedWeightQueries, trainingPairQueries, learningMetricsQueries, type DbLearnedWeight, type DbTrainingPair } from './db'
import type { SearchResult } from './vector-search'

export function hashQuery(query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ')
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function rerank(projectId: string, query: string, results: SearchResult[]): SearchResult[] {
  if (results.length === 0) return results

  try {
    const db = getDb()
    const qHash = hashQuery(query)
    const weights = learnedWeightQueries.getByQueryHash(db).all(projectId, qHash) as DbLearnedWeight[]

    if (weights.length === 0) return results

    const weightMap = new Map<string, DbLearnedWeight>()
    for (const w of weights) {
      weightMap.set(w.chunk_id, w)
    }

    const adjusted = results.map((result) => {
      const weight = weightMap.get(result.chunkId)
      if (weight) {
        const adjustment = weight.score_adjustment * weight.confidence
        return { ...result, score: result.score + adjustment }
      }
      return result
    })

    return adjusted.sort((a, b) => b.score - a.score)
  } catch (err) {
    console.error('[LearnedReranker] Rerank failed, returning original order:', err)
    return results
  }
}

export function trainFromPairs(projectId: string): { trained: number; weightsUpdated: number } {
  const db = getDb()
  let trained = 0
  let weightsUpdated = 0

  try {
    const pairs = trainingPairQueries.getByProject(db).all(projectId, 1000) as DbTrainingPair[]
    if (pairs.length === 0) return { trained: 0, weightsUpdated: 0 }

    const grouped = new Map<string, { chunkId: string; labels: number[] }>()

    for (const pair of pairs) {
      const key = `${hashQuery(pair.query)}:${pair.chunk_id}`
      const existing = grouped.get(key)
      if (existing) {
        existing.labels.push(pair.label)
      } else {
        grouped.set(key, { chunkId: pair.chunk_id, labels: [pair.label] })
      }
      trained++
    }

    for (const [key, group] of Array.from(grouped)) {
      const queryHash = key.split(':')[0]
      const avgLabel = group.labels.reduce((a, b) => a + b, 0) / group.labels.length
      const confidence = Math.min(1.0, group.labels.length * 0.1)

      try {
        learnedWeightQueries.upsert(db).run(
          randomUUID(),
          projectId,
          group.chunkId,
          queryHash,
          avgLabel,
          confidence
        )
        weightsUpdated++
      } catch (err) {
        console.error('[LearnedReranker] Failed to upsert weight:', err)
      }
    }

    learningMetricsQueries.insert(db).run(
      randomUUID(),
      projectId,
      'reranker_training',
      trained,
      JSON.stringify({ weightsUpdated, pairsProcessed: pairs.length, timestamp: Date.now() })
    )
  } catch (err) {
    console.error('[LearnedReranker] Training failed:', err)
  }

  return { trained, weightsUpdated }
}

export function getLearnedWeightCount(projectId: string): number {
  const db = getDb()
  return (learnedWeightQueries.countByProject(db).get(projectId) as { count: number })?.count || 0
}
