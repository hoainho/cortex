/**
 * Brain Engine — Core orchestrator for project analysis
 *
 * Flow:
 * 1. Import project → scan files → chunk code → store in DB
 * 2. (Sprint 3) Generate embeddings → store vectors
 * 3. (Sprint 4) Query: embed question → vector search → LLM
 * 4. (Sprint 6) Sync: detect changes → re-index delta
 */

import { BrowserWindow } from 'electron'
import { scanDirectory, readFileContent, getDirectoryTree, type ScannedFile } from './file-scanner'
import { chunkCode, type CodeChunk } from './code-chunker'
import { getDb, chunkQueries, repoQueries, repoTreeQueries } from './db'
import { randomUUID } from 'crypto'
import { embedProjectChunks } from './embedder'
import { hybridSearch, type SearchResult } from './vector-search'

export interface IndexingProgress {
  phase: 'scanning' | 'parsing' | 'chunking' | 'embedding' | 'done' | 'error'
  totalFiles: number
  processedFiles: number
  totalChunks: number
  currentFile?: string
  error?: string
}

/**
 * Index a local repository into the brain
 */
export async function indexLocalRepository(
  projectId: string,
  repoId: string,
  localPath: string,
  window: BrowserWindow | null,
  branch: string = 'main'
): Promise<{ totalFiles: number; totalChunks: number }> {
  const db = getDb()

  const sendProgress = (progress: IndexingProgress) => {
    window?.webContents.send('indexing:progress', { repoId, ...progress })
  }

  try {
    // Phase 1: Scan files
    sendProgress({ phase: 'scanning', totalFiles: 0, processedFiles: 0, totalChunks: 0 })
    repoQueries.updateStatus(db).run('indexing', null, repoId)

    const files = await scanDirectory(localPath)
    sendProgress({
      phase: 'scanning',
      totalFiles: files.length,
      processedFiles: 0,
      totalChunks: 0
    })

    // Store directory tree (project-level for backward compat + per-repo for multi-repo support)
    const tree = await getDirectoryTree(localPath)
    db.prepare(
      'INSERT OR REPLACE INTO project_directory_trees (project_id, tree_text, updated_at) VALUES (?, ?, ?)'
    ).run(projectId, tree, Date.now())
    repoTreeQueries.upsert(db).run(repoId, projectId, tree, Date.now())

    // Phase 2: Parse and chunk files
    sendProgress({
      phase: 'chunking',
      totalFiles: files.length,
      processedFiles: 0,
      totalChunks: 0
    })

    // Clear existing chunks for this repo (full re-index)
    chunkQueries.deleteByRepo(db).run(repoId)

    const insertChunk = chunkQueries.insert(db)
    const insertMany = db.transaction((chunks: CodeChunk[]) => {
      for (const chunk of chunks) {
        insertChunk.run(
          chunk.id,
          chunk.projectId,
          chunk.repoId,
          chunk.filePath,
          chunk.relativePath,
          chunk.language,
          chunk.chunkType,
          chunk.name,
          chunk.content,
          chunk.lineStart,
          chunk.lineEnd,
          chunk.tokenEstimate,
          JSON.stringify(chunk.dependencies),
          JSON.stringify(chunk.exports),
          JSON.stringify(chunk.metadata),
          chunk.branch
        )
      }
    })

    let totalChunks = 0
    const batchSize = 50
    let batch: CodeChunk[] = []

    for (let i = 0; i < files.length; i++) {
      const file = files[i]

      try {
        const content = await readFileContent(file.path)
        const chunks = chunkCode(
          content,
          file.path,
          file.relativePath,
          file.language,
          projectId,
          repoId,
          branch
        )

        batch.push(...chunks)
        totalChunks += chunks.length

        // Batch insert
        if (batch.length >= batchSize) {
          insertMany(batch)
          batch = []
        }

        // Progress update every 10 files
        if (i % 10 === 0 || i === files.length - 1) {
          sendProgress({
            phase: 'chunking',
            totalFiles: files.length,
            processedFiles: i + 1,
            totalChunks,
            currentFile: file.relativePath
          })
        }
      } catch (err) {
        // Skip files that fail to read/parse
        console.error(`Failed to process ${file.relativePath}:`, err)
      }
    }

    // Insert remaining batch
    if (batch.length > 0) {
      insertMany(batch)
    }

    // Phase 3: Generate embeddings
    sendProgress({
      phase: 'embedding',
      totalFiles: files.length,
      processedFiles: files.length,
      totalChunks
    })

    try {
      await embedProjectChunks(projectId, (processed, total) => {
        sendProgress({
          phase: 'embedding',
          totalFiles: files.length,
          processedFiles: files.length,
          totalChunks,
          currentFile: `Embedding ${processed}/${total} chunks...`
        })
      })
    } catch (embedErr) {
      console.error('Embedding failed (non-fatal):', embedErr)
      // Continue — brain can still do keyword search without embeddings
    }

    // Mark repo as ready
    repoQueries.updateIndexed(db).run(
      null, // last_indexed_sha — will be git SHA in Sprint 6
      Date.now(),
      'ready',
      files.length,
      totalChunks,
      repoId
    )

    sendProgress({
      phase: 'done',
      totalFiles: files.length,
      processedFiles: files.length,
      totalChunks
    })

    return { totalFiles: files.length, totalChunks }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    repoQueries.updateStatus(db).run('error', errorMsg, repoId)

    sendProgress({
      phase: 'error',
      totalFiles: 0,
      processedFiles: 0,
      totalChunks: 0,
      error: errorMsg
    })

    throw err
  }
}

/**
 * Search chunks using hybrid search (vector + keyword)
 */
export async function searchChunksHybrid(
  projectId: string,
  query: string,
  limit: number = 10,
  branch?: string
): Promise<SearchResult[]> {
  return hybridSearch(projectId, query, limit, branch)
}

/**
 * Search chunks by keyword only (fallback when embeddings unavailable)
 */
export function searchChunks(
  projectId: string,
  query: string,
  limit: number = 10,
  branch?: string
): CodeChunk[] {
  const db = getDb()

  // Search in content and name (optionally filtered by branch)
  const keyword = `%${query}%`
  let byContent: any[]
  let byName: any[]

  if (branch) {
    byContent = chunkQueries.searchByContentBranch(db).all(projectId, branch, keyword, limit) as any[]
    byName = chunkQueries.searchByNameBranch(db).all(projectId, branch, keyword, limit) as any[]
  } else {
    byContent = chunkQueries.searchByContent(db).all(projectId, keyword, limit) as any[]
    byName = chunkQueries.searchByName(db).all(projectId, keyword, limit) as any[]
  }

  // Merge and deduplicate
  const seen = new Set<string>()
  const results: CodeChunk[] = []

  // Name matches first (more relevant)
  for (const row of [...byName, ...byContent]) {
    if (seen.has(row.id)) continue
    seen.add(row.id)
    results.push(dbRowToChunk(row))
    if (results.length >= limit) break
  }

  return results
}

/**
 * Get project statistics
 */
export function getProjectStats(projectId: string) {
  const db = getDb()

  const repos = repoQueries.getByProject(db).all(projectId) as any[]

  // Collect active branches for branch-aware stats
  const activeBranches = repos.map((r: any) => r.active_branch || 'main')
  const branchPlaceholders = activeBranches.length > 0 ? activeBranches.map(() => '?').join(',') : "'main'"
  const branchParams = activeBranches.length > 0 ? activeBranches : ['main']

  // Count chunks only for active branches
  const chunkCount = (db.prepare(
    `SELECT COUNT(*) as count FROM chunks WHERE project_id = ? AND branch IN (${branchPlaceholders})`
  ).get(projectId, ...branchParams) as any)?.count || 0

  // Count distinct files only for active branches
  const fileCount = (db.prepare(
    `SELECT COUNT(DISTINCT relative_path) as count FROM chunks WHERE project_id = ? AND branch IN (${branchPlaceholders})`
  ).get(projectId, ...branchParams) as any)?.count || 0

  const languages = db
    .prepare(
      `SELECT language, COUNT(*) as count FROM chunks WHERE project_id = ? AND branch IN (${branchPlaceholders}) GROUP BY language ORDER BY count DESC`
    )
    .all(projectId, ...branchParams)

  const chunkTypes = db
    .prepare(
      `SELECT chunk_type, COUNT(*) as count FROM chunks WHERE project_id = ? AND branch IN (${branchPlaceholders}) GROUP BY chunk_type ORDER BY count DESC`
    )
    .all(projectId, ...branchParams)

  const tree = db
    .prepare('SELECT tree_text FROM project_directory_trees WHERE project_id = ?')
    .get(projectId) as { tree_text: string } | undefined

  return {
    totalFiles: fileCount,
    totalChunks: chunkCount,
    repositories: repos,
    languages,
    chunkTypes,
    directoryTree: tree?.tree_text || null
  }
}

function dbRowToChunk(row: any): CodeChunk {
  return {
    id: row.id,
    projectId: row.project_id,
    repoId: row.repo_id,
    filePath: row.file_path,
    relativePath: row.relative_path,
    language: row.language,
    chunkType: row.chunk_type,
    name: row.name,
    content: row.content,
    lineStart: row.line_start,
    lineEnd: row.line_end,
    tokenEstimate: row.token_estimate,
    dependencies: JSON.parse(row.dependencies || '[]'),
    exports: JSON.parse(row.exports || '[]'),
    metadata: JSON.parse(row.metadata || '{}'),
    branch: row.branch || 'main'
  }
}
