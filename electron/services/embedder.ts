import { getDb, chunkQueries } from './db'
import { app } from 'electron'
import { join } from 'path'

const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const EMBEDDING_DIMENSIONS = 384
const BATCH_SIZE = 20
const MAX_TEXT_LENGTH = 512

export interface EmbeddingResult {
  chunkId: string
  embedding: number[]
}

type FeatureExtractionPipeline = (texts: string[], options?: { pooling: string; normalize: boolean }) => Promise<{ tolist(): number[][] }>

let pipelineInstance: FeatureExtractionPipeline | null = null
let pipelineLoading: Promise<FeatureExtractionPipeline> | null = null

async function getEmbeddingPipeline(): Promise<FeatureExtractionPipeline> {
  if (pipelineInstance) return pipelineInstance

  if (pipelineLoading) return pipelineLoading

  pipelineLoading = (async () => {
    const { pipeline, env } = await import('@huggingface/transformers')
    env.cacheDir = join(app.getPath('userData'), 'models')
    env.allowLocalModels = true
    env.allowRemoteModels = true

    console.log(`[Embedder] Loading local model: ${EMBEDDING_MODEL} (cache: ${env.cacheDir})`)
    const start = Date.now()

    const pipe = await pipeline('feature-extraction', EMBEDDING_MODEL, {
      dtype: 'fp32'
    })

    console.log(`[Embedder] Model loaded in ${Date.now() - start}ms`)
    pipelineInstance = pipe as unknown as FeatureExtractionPipeline
    pipelineLoading = null
    return pipelineInstance
  })()

  return pipelineLoading
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text
  return text.slice(0, MAX_TEXT_LENGTH)
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  const pipe = await getEmbeddingPipeline()
  const truncated = texts.map(truncateText)
  const output = await pipe(truncated, { pooling: 'mean', normalize: true })
  return output.tolist()
}

export async function embedQuery(query: string): Promise<number[]> {
  const results = await embedTexts([query])
  return results[0] || []
}

export async function embedProjectChunks(
  projectId: string,
  onProgress?: (processed: number, total: number) => void
): Promise<number> {
  const db = getDb()

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

  await getEmbeddingPipeline()

  const updateEmbedding = chunkQueries.updateEmbedding(db)
  let processed = 0

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE)

    const texts = batch.map((chunk) => {
      const prefix = [
        chunk.relative_path,
        chunk.chunk_type !== 'other' ? `[${chunk.chunk_type}]` : '',
        chunk.name ? chunk.name : ''
      ]
        .filter(Boolean)
        .join(' | ')

      const content =
        chunk.content.length > MAX_TEXT_LENGTH
          ? chunk.content.slice(0, MAX_TEXT_LENGTH)
          : chunk.content

      return `${prefix}\n\n${content}`
    })

    try {
      const embeddings = await embedTexts(texts)

      const transaction = db.transaction(() => {
        for (let j = 0; j < batch.length; j++) {
          const embedding = embeddings[j]
          if (embedding) {
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
    }
  }

  return processed
}

export async function preloadEmbeddingModel(): Promise<void> {
  try {
    await getEmbeddingPipeline()
  } catch (err) {
    console.error('[Embedder] Failed to preload model:', err)
  }
}
