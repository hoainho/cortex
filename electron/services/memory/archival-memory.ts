/**
 * Archival Memory — Long-term vector-searchable memory
 * Stores decisions, patterns, insights with relevance decay
 */

import { getDb } from '../db'
import { randomUUID } from 'crypto'
import { embedQuery } from '../embedder'
import { archivalMemoryQueries } from './memory-db'
import type { ArchivalMemoryEntry, ArchivalMetadata, DbArchivalMemory } from './types'

function dbToEntry(row: DbArchivalMemory): ArchivalMemoryEntry {
  return {
    id: row.id,
    project_id: row.project_id,
    content: row.content,
    embedding: row.embedding,
    metadata: JSON.parse(row.metadata || '{}') as ArchivalMetadata,
    created_at: row.created_at,
    accessed_at: row.accessed_at,
    access_count: row.access_count,
    relevance_score: row.relevance_score
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

function bufferToFloat32(buffer: Buffer): number[] {
  const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  return Array.from(float32)
}

export async function addArchivalMemory(
  projectId: string,
  content: string,
  metadata?: ArchivalMetadata
): Promise<ArchivalMemoryEntry | null> {
  try {
    const db = getDb()
    const id = randomUUID()
    const metaJson = JSON.stringify(metadata || {})

    // Generate embedding
    let embeddingBuffer: Buffer | null = null
    try {
      const embedding = await embedQuery(content)
      embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
    } catch (err) {
      console.warn('[ArchivalMemory] Embedding generation failed, storing without:', err)
    }

    archivalMemoryQueries.insert(db).run(
      id, projectId, content, embeddingBuffer, metaJson
    )

    const row = db.prepare('SELECT * FROM archival_memory WHERE id = ?').get(id) as DbArchivalMemory
    return row ? dbToEntry(row) : null
  } catch (err) {
    console.error('[ArchivalMemory] Failed to add:', err)
    return null
  }
}

export async function searchArchivalMemory(
  projectId: string,
  query: string,
  limit: number = 10
): Promise<Array<ArchivalMemoryEntry & { score: number }>> {
  try {
    const db = getDb()

    // Get query embedding
    const queryEmbedding = await embedQuery(query)

    // Get all archival memories with embeddings
    const rows = archivalMemoryQueries.getWithEmbeddings(db).all(projectId) as DbArchivalMemory[]

    // Compute cosine similarity
    const scored = rows
      .map(row => {
        const entryEmbedding = bufferToFloat32(row.embedding!)
        const similarity = cosineSimilarity(queryEmbedding, entryEmbedding)
        return {
          ...dbToEntry(row),
          score: similarity * row.relevance_score
        }
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    // Update access counts for returned results
    const updateAccess = archivalMemoryQueries.updateAccess(db)
    for (const result of scored) {
      updateAccess.run(result.id)
    }

    return scored
  } catch (err) {
    console.error('[ArchivalMemory] Search failed:', err)
    return []
  }
}

export function getArchivalMemories(
  projectId: string,
  limit: number = 50,
  offset: number = 0
): ArchivalMemoryEntry[] {
  try {
    const db = getDb()
    const rows = archivalMemoryQueries.getByProject(db).all(projectId, limit, offset) as DbArchivalMemory[]
    return rows.map(dbToEntry)
  } catch (err) {
    console.error('[ArchivalMemory] Failed to get memories:', err)
    return []
  }
}

export function deleteArchivalMemory(id: string): boolean {
  try {
    const db = getDb()
    archivalMemoryQueries.delete(db).run(id)
    return true
  } catch (err) {
    console.error('[ArchivalMemory] Failed to delete:', err)
    return false
  }
}

export function decayRelevance(projectId: string): number {
  try {
    const db = getDb()
    // Decay entries not accessed in the last 7 days
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000
    const result = archivalMemoryQueries.decayRelevance(db).run(projectId, sevenDaysAgo)
    return result.changes
  } catch (err) {
    console.error('[ArchivalMemory] Decay failed:', err)
    return 0
  }
}

export function getArchivalStats(projectId: string): {
  total: number
  oldest: number | null
  newest: number | null
  avgRelevance: number
} {
  try {
    const db = getDb()
    const stats = archivalMemoryQueries.getStats(db).get(projectId) as {
      total: number
      oldest: number | null
      newest: number | null
      avg_relevance: number | null
    }
    return {
      total: stats.total,
      oldest: stats.oldest,
      newest: stats.newest,
      avgRelevance: stats.avg_relevance ?? 0
    }
  } catch (err) {
    console.error('[ArchivalMemory] Stats failed:', err)
    return { total: 0, oldest: null, newest: null, avgRelevance: 0 }
  }
}