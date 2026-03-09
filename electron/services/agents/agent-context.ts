import type { SharedAgentContext } from './types'
import { buildMemoryPrompt, loadMemoryContext, searchMemory } from '../memory/memory-manager'
import { agenticRetrieve } from '../agentic-rag'
import { getProjectStats } from '../brain-engine'
import { getDb } from '../db'

export async function buildSharedContext(
  projectId: string,
  query: string,
  mode: 'pm' | 'engineering'
): Promise<SharedAgentContext> {
  const startTime = Date.now()

  const [memoryPrompt, memoryContext, archivalResults, ragResult, projectStats, directoryTree] =
    await Promise.all([
      buildMemoryPrompt(projectId),
      loadMemoryContext(projectId).catch(() => ({ core: {}, archival: [], recall: [] })),
      searchMemory(projectId, query, 5).catch(() => []),
      agenticRetrieve(projectId, query, mode, { maxChunks: 15 }).catch(() => null),
      Promise.resolve(getProjectStats(projectId)).catch(() => null),
      Promise.resolve(loadDirectoryTree(projectId)).catch(() => undefined)
    ])

  const archivalMemories = archivalResults.map(r => ({
    content: 'content' in r.entry ? r.entry.content : '',
    score: r.score,
    type: 'metadata' in r.entry && r.entry.metadata
      ? (r.entry.metadata as Record<string, unknown>).type as string | undefined
      : undefined
  }))

  const recentRecall = memoryContext.recall.slice(-10).map(r => ({
    role: r.role,
    content: r.content
  }))

  const codeChunks = (ragResult?.context || []).map(chunk => ({
    relativePath: chunk.relativePath,
    name: chunk.name || undefined,
    content: chunk.content,
    chunkType: chunk.chunkType,
    language: chunk.language,
    lineStart: chunk.lineStart,
    lineEnd: chunk.lineEnd,
    score: chunk.score
  }))

  console.log(`[AgentContext] Built in ${Date.now() - startTime}ms: ${archivalMemories.length} archival, ${recentRecall.length} recall, ${codeChunks.length} chunks`)

  return {
    coreMemory: memoryPrompt,
    archivalMemories,
    recentRecall,
    codeChunks,
    directoryTree,
    projectStats: projectStats
      ? {
          totalFiles: projectStats.totalFiles,
          totalChunks: projectStats.totalChunks,
          languages: projectStats.languages as Array<{ language: string; count: number }>
        }
      : undefined
  }
}

function loadDirectoryTree(projectId: string): string | undefined {
  try {
    const db = getDb()
    const row = db
      .prepare('SELECT tree_text FROM project_directory_trees WHERE project_id = ?')
      .get(projectId) as { tree_text: string } | undefined
    return row?.tree_text
  } catch {
    return undefined
  }
}
