import Database from 'better-sqlite3'
import type {
  DbProject, DbRepository, DbChunk,
  CoreMemoryRow, ArchivalMemoryRow, RecallMemoryRow,
  GraphNodeRow, GraphEdgeRow,
} from './types.js'

export interface ReaderConfig {
  dbPath: string
}

export class CortexDbReader {
  private db: Database.Database

  constructor(config: ReaderConfig) {
    this.db = new Database(config.dbPath, { readonly: true })
    this.db.pragma('journal_mode = WAL')
  }

  close(): void {
    this.db.close()
  }

  // --- Projects ---

  listProjects(): DbProject[] {
    return this.db.prepare('SELECT * FROM projects ORDER BY updated_at DESC').all() as DbProject[]
  }

  getProject(id: string): DbProject | undefined {
    return this.db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as DbProject | undefined
  }

  // --- Repositories ---

  getRepositories(projectId: string): DbRepository[] {
    return this.db.prepare(
      'SELECT * FROM repositories WHERE project_id = ? ORDER BY created_at DESC'
    ).all(projectId) as DbRepository[]
  }

  // --- Chunks ---

  getChunks(projectId: string, limit = 100, offset = 0): DbChunk[] {
    return this.db.prepare(
      'SELECT * FROM chunks WHERE project_id = ? LIMIT ? OFFSET ?'
    ).all(projectId, limit, offset) as DbChunk[]
  }

  getChunkById(id: string): DbChunk | undefined {
    return this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as DbChunk | undefined
  }

  countChunks(projectId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM chunks WHERE project_id = ?'
    ).get(projectId) as { count: number }
    return row.count
  }

  searchChunksByContent(projectId: string, pattern: string, limit = 20): DbChunk[] {
    return this.db.prepare(
      'SELECT * FROM chunks WHERE project_id = ? AND content LIKE ? LIMIT ?'
    ).all(projectId, `%${pattern}%`, limit) as DbChunk[]
  }

  searchChunksByName(projectId: string, pattern: string, limit = 20): DbChunk[] {
    return this.db.prepare(
      'SELECT * FROM chunks WHERE project_id = ? AND name LIKE ? LIMIT ?'
    ).all(projectId, `%${pattern}%`, limit) as DbChunk[]
  }

  getChunksWithEmbeddings(projectId: string): DbChunk[] {
    return this.db.prepare(
      'SELECT * FROM chunks WHERE project_id = ? AND embedding IS NOT NULL'
    ).all(projectId) as DbChunk[]
  }

  // --- Core Memory ---

  getCoreMemory(projectId: string): CoreMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM core_memory WHERE project_id = ? ORDER BY section'
    ).all(projectId) as CoreMemoryRow[]
  }

  getCoreMemorySection(projectId: string, section: string): CoreMemoryRow | undefined {
    return this.db.prepare(
      'SELECT * FROM core_memory WHERE project_id = ? AND section = ?'
    ).get(projectId, section) as CoreMemoryRow | undefined
  }

  // --- Archival Memory ---

  getArchivalMemory(projectId: string, limit = 50, offset = 0): ArchivalMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM archival_memory WHERE project_id = ? ORDER BY relevance_score DESC, accessed_at DESC LIMIT ? OFFSET ?'
    ).all(projectId, limit, offset) as ArchivalMemoryRow[]
  }

  searchArchivalByContent(projectId: string, pattern: string, limit = 10): ArchivalMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM archival_memory WHERE project_id = ? AND content LIKE ? ORDER BY relevance_score DESC LIMIT ?'
    ).all(projectId, `%${pattern}%`, limit) as ArchivalMemoryRow[]
  }

  getArchivalWithEmbeddings(projectId: string): ArchivalMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM archival_memory WHERE project_id = ? AND embedding IS NOT NULL'
    ).all(projectId) as ArchivalMemoryRow[]
  }

  countArchival(projectId: string): number {
    const row = this.db.prepare(
      'SELECT COUNT(*) as count FROM archival_memory WHERE project_id = ?'
    ).get(projectId) as { count: number }
    return row.count
  }

  // --- Recall Memory ---

  getRecallMemory(projectId: string, limit = 50): RecallMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM recall_memory WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'
    ).all(projectId, limit) as RecallMemoryRow[]
  }

  searchRecallByContent(projectId: string, pattern: string, limit = 10): RecallMemoryRow[] {
    return this.db.prepare(
      'SELECT * FROM recall_memory WHERE project_id = ? AND content LIKE ? ORDER BY timestamp DESC LIMIT ?'
    ).all(projectId, `%${pattern}%`, limit) as RecallMemoryRow[]
  }

  // --- Knowledge Graph (tables may not exist) ---

  getGraphNodes(projectId: string, limit = 100): GraphNodeRow[] {
    try {
      return this.db.prepare(
        'SELECT * FROM graph_nodes WHERE project_id = ? LIMIT ?'
      ).all(projectId, limit) as GraphNodeRow[]
    } catch { return [] }
  }

  getGraphEdges(projectId: string, limit = 200): GraphEdgeRow[] {
    try {
      return this.db.prepare(
        'SELECT * FROM graph_edges WHERE project_id = ? LIMIT ?'
      ).all(projectId, limit) as GraphEdgeRow[]
    } catch { return [] }
  }

  getGraphNodesByType(projectId: string, type: string): GraphNodeRow[] {
    try {
      return this.db.prepare(
        'SELECT * FROM graph_nodes WHERE project_id = ? AND type = ?'
      ).all(projectId, type) as GraphNodeRow[]
    } catch { return [] }
  }

  getGraphEdgesFromNode(nodeId: string): GraphEdgeRow[] {
    try {
      return this.db.prepare('SELECT * FROM graph_edges WHERE source_id = ?').all(nodeId) as GraphEdgeRow[]
    } catch { return [] }
  }

  getGraphEdgesToNode(nodeId: string): GraphEdgeRow[] {
    try {
      return this.db.prepare('SELECT * FROM graph_edges WHERE target_id = ?').all(nodeId) as GraphEdgeRow[]
    } catch { return [] }
  }

  graphTraversal(
    startNodeId: string,
    hops: number = 2
  ): { nodes: GraphNodeRow[]; edges: GraphEdgeRow[] } {
    const visited = new Set<string>()
    const resultNodes: GraphNodeRow[] = []
    const resultEdges: GraphEdgeRow[] = []
    const queue: { nodeId: string; depth: number }[] = [{ nodeId: startNodeId, depth: 0 }]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current.nodeId) || current.depth > hops) continue
      visited.add(current.nodeId)

      const node = this.getGraphNodeById(current.nodeId)
      if (node) resultNodes.push(node)

      if (current.depth < hops) {
        const outEdges = this.getGraphEdgesFromNode(current.nodeId)
        const inEdges = this.getGraphEdgesToNode(current.nodeId)
        for (const edge of [...outEdges, ...inEdges]) {
          resultEdges.push(edge)
          const nextId = edge.source_id === current.nodeId ? edge.target_id : edge.source_id
          if (!visited.has(nextId)) {
            queue.push({ nodeId: nextId, depth: current.depth + 1 })
          }
        }
      }
    }
    return { nodes: resultNodes, edges: resultEdges }
  }

  private getGraphNodeById(id: string): GraphNodeRow | undefined {
    try {
      return this.db.prepare('SELECT * FROM graph_nodes WHERE id = ?').get(id) as GraphNodeRow | undefined
    } catch { return undefined }
  }

  // --- Project Stats ---

  getProjectStats(projectId: string): {
    totalChunks: number
    totalFiles: number
    totalArchival: number
    totalRecall: number
    totalCoreMemory: number
    totalGraphNodes: number
    totalGraphEdges: number
    repositories: DbRepository[]
    languages: { language: string; count: number }[]
  } {
    const totalChunks = this.countChunks(projectId)
    const repos = this.getRepositories(projectId)
    const totalFiles = repos.reduce((sum, r) => sum + (r.total_files || 0), 0)
    const archivalCount = this.countArchival(projectId)

    const safeCount = (table: string): number => {
      try {
        const row = this.db.prepare(`SELECT COUNT(*) as count FROM ${table} WHERE project_id = ?`).get(projectId) as { count: number }
        return row.count
      } catch { return 0 }
    }

    let languages: { language: string; count: number }[] = []
    try {
      languages = this.db.prepare(
        'SELECT language, COUNT(*) as count FROM chunks WHERE project_id = ? GROUP BY language ORDER BY count DESC'
      ).all(projectId) as { language: string; count: number }[]
    } catch { /* empty */ }

    return {
      totalChunks,
      totalFiles,
      totalArchival: archivalCount,
      totalRecall: safeCount('recall_memory'),
      totalCoreMemory: safeCount('core_memory'),
      totalGraphNodes: safeCount('graph_nodes'),
      totalGraphEdges: safeCount('graph_edges'),
      repositories: repos,
      languages,
    }
  }

  // --- Directory Tree ---

  getDirectoryTree(projectId: string): string | null {
    try {
      const rows = this.db.prepare(
        'SELECT tree_text FROM repository_directory_trees WHERE project_id = ?'
      ).all(projectId) as { tree_text: string }[]
      return rows.map((r) => r.tree_text).join('\n\n') || null
    } catch { return null }
  }
}
