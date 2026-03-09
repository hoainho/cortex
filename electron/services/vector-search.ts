/**
 * Vector Search — Cosine similarity search on stored embeddings
 *
 * Since we're using SQLite (not a vector DB), we do brute-force
 * cosine similarity in JavaScript. This is fine for projects with
 * up to ~50,000 chunks (handles most codebases easily).
 *
 * For scale beyond that, we'd switch to sqlite-vec extension or
 * an external vector DB.
 */

import { getDb } from './db'
import { embedQuery } from './embedder'
import { rerank } from './learned-reranker'

export interface SearchResult {
  chunkId: string
  score: number
  content: string
  filePath: string
  relativePath: string
  language: string
  chunkType: string
  name: string | null
  lineStart: number
  lineEnd: number
  dependencies: string[]
  exports: string[]
  branch: string
  repoId: string
  repoName: string
}

/**
 * Hybrid search: vector similarity + keyword matching
 * Returns top-k results ranked by combined score
 */
export async function hybridSearch(
  projectId: string,
  query: string,
  topK: number = 10,
  branch?: string
): Promise<SearchResult[]> {
  // Run vector search and keyword search in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch(projectId, query, topK * 2, branch),
    keywordSearch(projectId, query, topK, branch)
  ])

  // Merge results — vector results weighted 0.7, keyword 0.3
  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (const result of vectorResults) {
    scoreMap.set(result.chunkId, {
      score: result.score * 0.7,
      result
    })
  }

  for (const result of keywordResults) {
    const existing = scoreMap.get(result.chunkId)
    if (existing) {
      existing.score += result.score * 0.3
    } else {
      scoreMap.set(result.chunkId, {
        score: result.score * 0.3,
        result
      })
    }
  }

  // Sort by combined score
  const merged = Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((entry) => ({ ...entry.result, score: entry.score }))

  // Apply learned re-ranking from user feedback
  return rerank(projectId, query, merged)
}

/**
 * Pure vector similarity search
 */
async function vectorSearch(
  projectId: string,
  query: string,
  topK: number,
  branch?: string
): Promise<SearchResult[]> {
  const db = getDb()

  // Embed the query
  let queryEmbedding: number[]
  try {
    queryEmbedding = await embedQuery(query)
  } catch (err) {
    console.error('Failed to embed query:', err)
    return [] // Fall back to keyword-only search
  }

  if (queryEmbedding.length === 0) return []

  // Get all chunks with embeddings for this project (optionally filtered by branch)
  const sql = branch
    ? `SELECT id, repo_id, content, file_path, relative_path, language, chunk_type,
              name, line_start, line_end, dependencies, exports, embedding, branch
       FROM chunks
       WHERE project_id = ? AND branch = ? AND embedding IS NOT NULL`
    : `SELECT id, repo_id, content, file_path, relative_path, language, chunk_type,
              name, line_start, line_end, dependencies, exports, embedding, branch
       FROM chunks
       WHERE project_id = ? AND embedding IS NOT NULL`
  const chunks = branch
    ? (db.prepare(sql).all(projectId, branch) as Array<any>)
    : (db.prepare(sql).all(projectId) as Array<any>)

  // Compute cosine similarity for each chunk
  const scored = chunks
    .map((chunk) => {
      const embedding = bufferToFloatArray(chunk.embedding)
      const score = cosineSimilarity(queryEmbedding, embedding)
      return {
        chunkId: chunk.id,
        score,
        content: chunk.content,
        filePath: chunk.file_path,
        relativePath: chunk.relative_path,
        language: chunk.language,
        chunkType: chunk.chunk_type,
        name: chunk.name,
        lineStart: chunk.line_start,
        lineEnd: chunk.line_end,
        dependencies: JSON.parse(chunk.dependencies || '[]'),
        exports: JSON.parse(chunk.exports || '[]'),
        branch: chunk.branch || 'main',
        repoId: chunk.repo_id || '',
        repoName: ''
      }
    })
    .filter((r) => r.score > 0.1) // Filter low-relevance results
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)

  return scored
}

/**
 * Keyword-based search (BM25-like scoring)
 */
function keywordSearch(
  projectId: string,
  query: string,
  topK: number,
  branch?: string
): SearchResult[] {
  const db = getDb()

  // Tokenize query into keywords
  const keywords = query
    .toLowerCase()
    .split(/[\s,.;:!?(){}[\]'"]+/)
    .filter((k) => k.length >= 2)

  if (keywords.length === 0) return []

  // Search by each keyword and combine scores
  const scoreMap = new Map<string, { hits: number; chunk: any }>()

  for (const keyword of keywords) {
    const pattern = `%${keyword}%`

    // Search in content (optionally filtered by branch)
    const sql = branch
      ? `SELECT id, repo_id, content, file_path, relative_path, language, chunk_type,
                name, line_start, line_end, dependencies, exports, branch
         FROM chunks
         WHERE project_id = ? AND branch = ? AND (content LIKE ? OR name LIKE ? OR relative_path LIKE ?)
         LIMIT 50`
      : `SELECT id, repo_id, content, file_path, relative_path, language, chunk_type,
                name, line_start, line_end, dependencies, exports, branch
         FROM chunks
         WHERE project_id = ? AND (content LIKE ? OR name LIKE ? OR relative_path LIKE ?)
         LIMIT 50`
    const contentHits = branch
      ? (db.prepare(sql).all(projectId, branch, pattern, pattern, pattern) as Array<any>)
      : (db.prepare(sql).all(projectId, pattern, pattern, pattern) as Array<any>)

    for (const chunk of contentHits) {
      const existing = scoreMap.get(chunk.id)
      if (existing) {
        existing.hits++
      } else {
        scoreMap.set(chunk.id, { hits: 1, chunk })
      }
    }
  }

  // Score based on hit count and normalize
  return Array.from(scoreMap.values())
    .map(({ hits, chunk }) => ({
      chunkId: chunk.id,
      score: hits / keywords.length, // Normalize 0-1
      content: chunk.content,
      filePath: chunk.file_path,
      relativePath: chunk.relative_path,
      language: chunk.language,
      chunkType: chunk.chunk_type,
      name: chunk.name,
      lineStart: chunk.line_start,
      lineEnd: chunk.line_end,
      dependencies: JSON.parse(chunk.dependencies || '[]'),
      exports: JSON.parse(chunk.exports || '[]'),
      branch: chunk.branch || 'main',
      repoId: chunk.repo_id || '',
      repoName: ''
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

/**
 * Cosine similarity between two vectors
 */
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
  if (denominator === 0) return 0

  return dotProduct / denominator
}

/**
 * Convert SQLite BLOB (Buffer) back to float array
 */
function bufferToFloatArray(buffer: Buffer): number[] {
  if (!buffer || buffer.length === 0) return []
  const float32 = new Float32Array(
    buffer.buffer,
    buffer.byteOffset,
    buffer.byteLength / 4
  )
  return Array.from(float32)
}
