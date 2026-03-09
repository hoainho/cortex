/**
 * Re-embed — Re-embed existing chunks with contextual enrichment
 */
import { getDb } from '../../db'
import { embedQuery } from '../../embedder'
import { getFileContext } from './contextual-chunk'

export function needsReEmbed(projectId: string): boolean {
  const db = getDb()
  const result = db.prepare(`
    SELECT COUNT(*) as total,
    SUM(CASE WHEN json_extract(metadata, '$.file_context') IS NOT NULL THEN 1 ELSE 0 END) as contextualized
    FROM chunks WHERE project_id = ?
  `).get(projectId) as { total: number, contextualized: number }
  return result.total > 0 && result.contextualized < result.total * 0.5
}

export async function reEmbedProject(
  projectId: string,
  onProgress?: (done: number, total: number) => void
): Promise<number> {
  const db = getDb()
  const chunks = db.prepare('SELECT id, relative_path, chunk_type, name, content FROM chunks WHERE project_id = ?').all(projectId) as Array<{
    id: string, relative_path: string, chunk_type: string, name: string | null, content: string
  }>

  let embedded = 0
  const BATCH = 20

  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH)
    const texts = batch.map(c => {
      const ctx = getFileContext(projectId, c.relative_path)
      const prefix = [c.relative_path, c.chunk_type !== 'other' ? `[${c.chunk_type}]` : '', c.name || ''].filter(Boolean).join(' | ')
      const content = c.content.length > 6000 ? c.content.slice(0, 6000) : c.content
      return `${prefix}\n${ctx}\n\n${content}`
    })

    try {
      for (let j = 0; j < texts.length; j++) {
        const embedding = await embedQuery(texts[j])
        const buffer = Buffer.from(new Float32Array(embedding).buffer)
        db.prepare('UPDATE chunks SET embedding = ? WHERE id = ?').run(buffer, batch[j].id)
        embedded++
      }
    } catch (err) {
      console.error('[ReEmbed] Batch failed:', err)
    }

    onProgress?.(Math.min(i + BATCH, chunks.length), chunks.length)
  }

  console.log(`[ReEmbed] Re-embedded ${embedded}/${chunks.length} chunks`)
  return embedded
}