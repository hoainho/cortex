/**
 * Recall Memory — Conversation history with semantic search
 * Indexes past conversations for retrieval
 */

import { getDb } from '../db'
import { randomUUID } from 'crypto'
import { embedQuery } from '../embedder'
import { recallMemoryQueries } from './memory-db'
import type { RecallMemoryEntry, DbRecallMemory } from './types'

function dbToEntry(row: DbRecallMemory): RecallMemoryEntry {
  return {
    id: row.id,
    project_id: row.project_id,
    conversation_id: row.conversation_id,
    role: row.role as 'user' | 'assistant' | 'system',
    content: row.content,
    embedding: row.embedding,
    timestamp: row.timestamp
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

export async function addRecallMemory(
  projectId: string,
  conversationId: string,
  role: 'user' | 'assistant' | 'system',
  content: string
): Promise<RecallMemoryEntry | null> {
  try {
    const db = getDb()
    const id = randomUUID()

    // Generate embedding for semantic search
    let embeddingBuffer: Buffer | null = null
    try {
      // Only embed non-trivial messages
      if (content.length > 20) {
        const embedding = await embedQuery(content.slice(0, 6000))
        embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer)
      }
    } catch (err) {
      console.warn('[RecallMemory] Embedding failed, storing without:', err)
    }

    recallMemoryQueries.insert(db).run(
      id, projectId, conversationId, role, content, embeddingBuffer
    )

    const row = db.prepare('SELECT * FROM recall_memory WHERE id = ?').get(id) as DbRecallMemory
    return row ? dbToEntry(row) : null
  } catch (err) {
    console.error('[RecallMemory] Failed to add:', err)
    return null
  }
}

export async function searchRecallMemory(
  projectId: string,
  query: string,
  limit: number = 10
): Promise<Array<RecallMemoryEntry & { score: number }>> {
  try {
    const db = getDb()

    // Get query embedding
    const queryEmbedding = await embedQuery(query)

    // Get all recall memories with embeddings
    const rows = recallMemoryQueries.getWithEmbeddings(db).all(projectId) as DbRecallMemory[]

    // Compute similarity
    const scored = rows
      .map(row => {
        const entryEmbedding = bufferToFloat32(row.embedding!)
        const similarity = cosineSimilarity(queryEmbedding, entryEmbedding)
        return {
          ...dbToEntry(row),
          score: similarity
        }
      })
      .filter(r => r.score > 0.3)
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)

    return scored
  } catch (err) {
    console.error('[RecallMemory] Search failed:', err)
    return []
  }
}

export function getConversationRecall(
  projectId: string,
  conversationId: string,
  limit: number = 100
): RecallMemoryEntry[] {
  try {
    const db = getDb()
    const rows = recallMemoryQueries.getByConversation(db).all(conversationId, limit) as DbRecallMemory[]
    return rows.map(dbToEntry)
  } catch (err) {
    console.error('[RecallMemory] Failed to get conversation:', err)
    return []
  }
}

export function getRecentRecall(
  projectId: string,
  limit: number = 20
): RecallMemoryEntry[] {
  try {
    const db = getDb()
    const rows = recallMemoryQueries.getRecent(db).all(projectId, limit) as DbRecallMemory[]
    return rows.map(dbToEntry)
  } catch (err) {
    console.error('[RecallMemory] Failed to get recent:', err)
    return []
  }
}

export function deleteConversationRecall(conversationId: string): boolean {
  try {
    const db = getDb()
    recallMemoryQueries.deleteByConversation(db).run(conversationId)
    return true
  } catch (err) {
    console.error('[RecallMemory] Failed to delete conversation:', err)
    return false
  }
}

export function getRecallCount(projectId: string): number {
  try {
    const db = getDb()
    const result = recallMemoryQueries.count(db).get(projectId) as { count: number }
    return result.count
  } catch (err) {
    console.error('[RecallMemory] Count failed:', err)
    return 0
  }
}