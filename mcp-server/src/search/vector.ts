import type { CortexDbReader } from '../db/reader.js'
import type { DbChunk } from '../db/types.js'
import { cosineSimilarity, bufferToFloat32Array } from '../utils/cosine.js'
import { log } from '../utils/logger.js'

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
  branch: string
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'in', 'on', 'at', 'to',
  'for', 'of', 'and', 'or', 'how', 'does', 'what', 'where', 'which',
  'this', 'that', 'with', 'from', 'not', 'but', 'have', 'has', 'had',
])

// 70% vector + 30% keyword (same weights as Cortex electron/services/vector-search.ts)
const VECTOR_WEIGHT = 0.7
const KEYWORD_WEIGHT = 0.3

export function hybridSearch(
  reader: CortexDbReader,
  projectId: string,
  query: string,
  queryEmbedding: Float32Array | null,
  topK: number = 10
): SearchResult[] {
  const vectorResults = queryEmbedding
    ? vectorSearch(reader, projectId, queryEmbedding, topK * 2)
    : []
  const keywordResults = keywordSearch(reader, projectId, query, topK)

  const scoreMap = new Map<string, { score: number; result: SearchResult }>()

  for (const r of vectorResults) {
    scoreMap.set(r.chunkId, { score: r.score * VECTOR_WEIGHT, result: r })
  }

  for (const r of keywordResults) {
    const existing = scoreMap.get(r.chunkId)
    if (existing) {
      existing.score += r.score * KEYWORD_WEIGHT
    } else {
      scoreMap.set(r.chunkId, { score: r.score * KEYWORD_WEIGHT, result: r })
    }
  }

  return Array.from(scoreMap.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map((e) => ({ ...e.result, score: e.score }))
}

function vectorSearch(
  reader: CortexDbReader,
  projectId: string,
  queryEmbedding: Float32Array,
  topK: number
): SearchResult[] {
  const chunks = reader.getChunksWithEmbeddings(projectId)
  log('info', `Vector search over ${chunks.length} embedded chunks`)

  const scored: { chunk: DbChunk; score: number }[] = []
  for (const chunk of chunks) {
    if (!chunk.embedding) continue
    const chunkEmb = bufferToFloat32Array(chunk.embedding)
    const score = cosineSimilarity(queryEmbedding, chunkEmb)
    scored.push({ chunk, score })
  }

  scored.sort((a, b) => b.score - a.score)

  return scored.slice(0, topK).map(({ chunk, score }) => chunkToResult(chunk, score))
}

function keywordSearch(
  reader: CortexDbReader,
  projectId: string,
  query: string,
  topK: number
): SearchResult[] {
  const keywords = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP_WORDS.has(w))

  if (keywords.length === 0) return []

  const seen = new Set<string>()
  const allResults: SearchResult[] = []

  for (const keyword of keywords.slice(0, 5)) {
    const nameResults = reader.searchChunksByName(projectId, keyword, Math.ceil(topK / 2))
    const contentResults = reader.searchChunksByContent(projectId, keyword, Math.ceil(topK / 2))

    for (const chunk of [...nameResults, ...contentResults]) {
      if (seen.has(chunk.id)) continue
      seen.add(chunk.id)

      const tf = (chunk.content.toLowerCase().match(new RegExp(keyword, 'g')) || []).length
      const nameBoost = chunk.name?.toLowerCase().includes(keyword) ? 2.0 : 1.0
      const score = Math.min(1.0, (tf / 10) * nameBoost)

      allResults.push(chunkToResult(chunk, score))
    }
  }

  return allResults.sort((a, b) => b.score - a.score).slice(0, topK)
}

export function searchArchivalByVector(
  reader: CortexDbReader,
  projectId: string,
  queryEmbedding: Float32Array,
  topK: number = 5
): { id: string; content: string; score: number; metadata: string }[] {
  const memories = reader.getArchivalWithEmbeddings(projectId)

  return memories
    .filter((m) => m.embedding)
    .map((m) => ({
      id: m.id,
      content: m.content,
      metadata: m.metadata,
      score: cosineSimilarity(queryEmbedding, bufferToFloat32Array(m.embedding!)),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function chunkToResult(chunk: DbChunk, score: number): SearchResult {
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
    branch: chunk.branch,
  }
}
