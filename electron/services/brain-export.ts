/**
 * Brain Export/Import — Backup and restore project brains
 *
 * Export: project metadata + chunks (no embeddings) + conversations + messages → JSON
 * Import: read JSON → create project → insert data → re-embed
 */

import { writeFile, readFile } from 'fs/promises'
import { gzipSync, gunzipSync } from 'zlib'
import { getDb, projectQueries } from './db'
import { randomUUID } from 'crypto'
import { embedProjectChunks } from './embedder'

interface BrainExport {
  version: 1
  exportedAt: number
  project: {
    name: string
    brain_name: string
  }
  chunks: Array<{
    relative_path: string
    language: string
    chunk_type: string
    name: string | null
    content: string
    line_start: number
    line_end: number
    token_estimate: number
    dependencies: string
    exports: string
    metadata: string
  }>
  conversations: Array<{
    title: string
    mode: string
  }>
  messages: Array<{
    conversation_index: number
    role: string
    content: string
    mode: string
  }>
}

export async function exportBrain(projectId: string, outputPath: string): Promise<{ chunks: number; conversations: number }> {
  const db = getDb()

  const project = projectQueries.getById(db).get(projectId) as any
  if (!project) throw new Error('Project not found')

  const chunks = db
    .prepare(
      'SELECT relative_path, language, chunk_type, name, content, line_start, line_end, token_estimate, dependencies, exports, metadata FROM chunks WHERE project_id = ?'
    )
    .all(projectId) as any[]

  const conversations = db
    .prepare('SELECT id, title, mode FROM conversations WHERE project_id = ? ORDER BY created_at ASC')
    .all(projectId) as any[]

  const convIdToIndex = new Map<string, number>()
  conversations.forEach((c, i) => convIdToIndex.set(c.id, i))

  const allMessages: BrainExport['messages'] = []
  for (const conv of conversations) {
    const msgs = db
      .prepare('SELECT role, content, mode FROM messages WHERE conversation_id = ? ORDER BY created_at ASC')
      .all(conv.id) as any[]

    for (const msg of msgs) {
      allMessages.push({
        conversation_index: convIdToIndex.get(conv.id)!,
        role: msg.role,
        content: msg.content,
        mode: msg.mode
      })
    }
  }

  const data: BrainExport = {
    version: 1,
    exportedAt: Date.now(),
    project: {
      name: project.name,
      brain_name: project.brain_name
    },
    chunks,
    conversations: conversations.map((c) => ({ title: c.title, mode: c.mode })),
    messages: allMessages
  }

  const json = JSON.stringify(data)
  const compressed = gzipSync(Buffer.from(json))
  await writeFile(outputPath, compressed)

  return { chunks: chunks.length, conversations: conversations.length }
}

export async function importBrain(inputPath: string): Promise<{ projectId: string; chunks: number }> {
  const compressed = await readFile(inputPath)
  const json = gunzipSync(compressed).toString('utf-8')
  const data = JSON.parse(json) as BrainExport

  if (data.version !== 1) {
    throw new Error(`Unsupported brain export version: ${data.version}`)
  }

  const db = getDb()
  const projectId = randomUUID()

  // Create project
  projectQueries.create(db).run(projectId, data.project.name, data.project.brain_name)

  // Insert chunks
  const repoId = randomUUID()
  db.prepare(
    'INSERT INTO repositories (id, project_id, source_type, source_path, branch, status) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(repoId, projectId, 'local', 'imported', 'main', 'ready')

  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, project_id, repo_id, file_path, relative_path, language, chunk_type, name, content, line_start, line_end, token_estimate, dependencies, exports, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const insertMany = db.transaction((chunks: any[]) => {
    for (const chunk of chunks) {
      insertChunk.run(
        randomUUID(),
        projectId,
        repoId,
        chunk.relative_path,
        chunk.relative_path,
        chunk.language,
        chunk.chunk_type,
        chunk.name,
        chunk.content,
        chunk.line_start,
        chunk.line_end,
        chunk.token_estimate,
        chunk.dependencies,
        chunk.exports,
        chunk.metadata
      )
    }
  })
  insertMany(data.chunks)

  // Insert conversations and messages
  const convIds: string[] = []
  for (const conv of data.conversations) {
    const convId = randomUUID()
    convIds.push(convId)
    db.prepare(
      'INSERT INTO conversations (id, project_id, title, mode) VALUES (?, ?, ?, ?)'
    ).run(convId, projectId, conv.title, conv.mode)
  }

  const insertMsg = db.prepare(
    'INSERT INTO messages (id, conversation_id, role, content, mode, context_chunks) VALUES (?, ?, ?, ?, ?, ?)'
  )
  for (const msg of data.messages) {
    if (msg.conversation_index < convIds.length) {
      insertMsg.run(randomUUID(), convIds[msg.conversation_index], msg.role, msg.content, msg.mode, '[]')
    }
  }

  // Re-embed chunks (async, non-blocking)
  embedProjectChunks(projectId).catch((err) => {
    console.error('Re-embedding after import failed:', err)
  })

  return { projectId, chunks: data.chunks.length }
}
