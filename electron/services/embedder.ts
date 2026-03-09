/**
 * Embedder — Generate vector embeddings via LLM proxy
 *
 * Uses proxy.hoainho.info to call OpenAI embeddings API.
 * Stores embeddings as Float32Array blobs in SQLite.
 */

import { getDb, chunkQueries } from './db'
import { getProxyUrl, getProxyKey } from './settings-service'
const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536
const BATCH_SIZE = 20 // Embed 20 chunks per API call

export interface EmbeddingResult {
  chunkId: string
  embedding: number[]
}

/**
 * Generate embeddings for all unembedded chunks in a project
 */
export async function embedProjectChunks(
  projectId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<number> {
  const db = getDb()

  // Get chunks without embeddings
  const chunks = db
    .prepare(
      'SELECT id, content, name, relative_path, chunk_type FROM chunks WHERE project_id = ? AND embedding IS NULL'
    )
    .all(projectId) as Array<{
    id: string
    content: string
    name: string | null
    relative_path: string
    chunk_type: string
  }>

  if (chunks.length === 0) return 0

  const updateEmbedding = chunkQueries.updateEmbedding(db)
  let processed = 0

  // Process in batches
  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    // Build text for embedding — include context metadata
    const texts = batch.map((chunk) => {
      const prefix = [
        chunk.relative_path,
        chunk.chunk_type !== 'other' ? `[${chunk.chunk_type}]` : '',
        chunk.name ? chunk.name : ''
      ]
        .filter(Boolean)
        .join(' | ')

      // Truncate content to ~6000 chars to fit in embedding context window
      const content =
        chunk.content.length > 6000
          ? chunk.content.slice(0, 6000) + '\n...'
          : chunk.content

      return `${prefix}\n\n${content}`
    })

    try {
      const embeddings = await callEmbeddingAPI(texts)

      // Store embeddings in DB
      const transaction = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const embedding = embeddings[j]
          if (embedding) {
            // Store as binary blob (Float32Array)
            const buffer = Buffer.from(new Float32Array(embedding).buffer)
            updateEmbedding.run(buffer, batch[j].id)
          }
        }
      })
      transaction()

      processed += batch.length
      onProgress?.(processed, chunks.length)
    } catch (err) {
      console.error(`Embedding batch failed (${i}-${i + BATCH_SIZE}):`, err)
      // Continue with next batch rather than failing completely
    }

    // Small delay between batches to avoid rate limiting
    if (i + BATCH_SIZE < chunks.length) {
      await sleep(200)
    }
  }

  return processed
}

/**
 * Embed a single query string for search
 */
export async function embedQuery(query: string): Promise<number[]> {
  const embeddings = await callEmbeddingAPI([query])
  return embeddings[0] || []
}

/**
 * Call the embedding API via proxy
 */
async function callEmbeddingAPI(texts: string[]): Promise<number[][]> {
  const response = await fetch(`${getProxyUrl()}/v1/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getProxyKey()}`
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: texts,
      dimensions: EMBEDDING_DIMENSIONS
    })
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Embedding API error ${response.status}: ${errorText}`)
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[]; index: number }>
  }

  // Sort by index to match input order
  const sorted = data.data.sort((a, b) => a.index - b.index)
  return sorted.map((d) => d.embedding)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
