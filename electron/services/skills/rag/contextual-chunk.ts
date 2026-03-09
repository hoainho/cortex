/**
 * Contextual Chunking — Adds file-level context to chunks before embedding
 */
import { getDb } from '../../db'

export function addContextToChunk(chunk: { relative_path: string, chunk_type: string, name: string | null, content: string }, fileContext: string): string {
  const prefix = [chunk.relative_path, chunk.chunk_type !== 'other' ? `[${chunk.chunk_type}]` : '', chunk.name || ''].filter(Boolean).join(' | ')
  return `${prefix}\n${fileContext}\n\n${chunk.content}`
}

export function getFileContext(projectId: string, filePath: string): string {
  const db = getDb()
  const chunks = db.prepare('SELECT chunk_type, name, content FROM chunks WHERE project_id = ? AND relative_path = ? ORDER BY line_start').all(projectId, filePath) as Array<{ chunk_type: string, name: string | null, content: string }>

  const imports = chunks.filter(c => c.content.includes('import ')).map(c => {
    const match = c.content.match(/import\s+.+?from\s+['"]([^'"]+)['"]/)
    return match ? match[1] : null
  }).filter(Boolean)

  const exports = chunks.filter(c => c.name && c.chunk_type !== 'other').map(c => `${c.chunk_type}: ${c.name}`)

  const parts: string[] = []
  if (imports.length > 0) parts.push(`Imports: ${imports.join(', ')}`)
  if (exports.length > 0) parts.push(`Exports: ${exports.join(', ')}`)

  return parts.join(' | ')
}

export function contextualizeProjectChunks(projectId: string, onProgress?: (done: number, total: number) => void): number {
  const db = getDb()
  const files = db.prepare('SELECT DISTINCT relative_path FROM chunks WHERE project_id = ?').all(projectId) as Array<{ relative_path: string }>
  let processed = 0

  for (const file of files) {
    const ctx = getFileContext(projectId, file.relative_path)
    // Store context as metadata for embedding enrichment
    db.prepare('UPDATE chunks SET metadata = json_set(COALESCE(metadata, \'{}\'), \'$.file_context\', ?) WHERE project_id = ? AND relative_path = ?').run(ctx, projectId, file.relative_path)
    processed++
    onProgress?.(processed, files.length)
  }

  return processed
}