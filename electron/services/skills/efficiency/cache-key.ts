/**
 * Cache Key — Key generation and similarity for semantic cache
 */
import { createHash } from 'crypto'

export function generateCacheKey(query: string): string {
  const normalized = normalizeQuery(query)
  return createHash('sha256').update(normalized).digest('hex').slice(0, 16)
}

export function normalizeQuery(query: string): string {
  return query.toLowerCase().trim().replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ')
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

export function bufferToFloat32(buffer: Buffer): number[] {
  const float32 = new Float32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4)
  return Array.from(float32)
}