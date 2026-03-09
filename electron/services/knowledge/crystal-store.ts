import { getDb } from '../db'
import type { KnowledgeCrystal, DbKnowledgeCrystal } from '../agents/types'
import type { CrystalStats } from './types'

export function initCrystalStore(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS knowledge_crystals (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_response_id TEXT,
      source_agent TEXT,
      crystal_type TEXT NOT NULL,
      content TEXT NOT NULL,
      summary TEXT,
      confidence REAL DEFAULT 0.8,
      domain TEXT,
      tags TEXT,
      embedding BLOB,
      related_crystals TEXT,
      archival_memory_id TEXT,
      graph_node_ids TEXT,
      access_count INTEGER DEFAULT 0,
      reinforcement_count INTEGER DEFAULT 1,
      created_at INTEGER NOT NULL,
      last_reinforced_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_crystals_project ON knowledge_crystals(project_id);
    CREATE INDEX IF NOT EXISTS idx_crystals_type ON knowledge_crystals(crystal_type);
    CREATE INDEX IF NOT EXISTS idx_crystals_domain ON knowledge_crystals(domain);
  `)
  console.log('[CrystalStore] Initialized knowledge_crystals table')
}

function dbToKnowledgeCrystal(row: DbKnowledgeCrystal): KnowledgeCrystal {
  return {
    id: row.id,
    projectId: row.project_id,
    sourceResponseId: row.source_response_id || undefined,
    sourceAgent: (row.source_agent as KnowledgeCrystal['sourceAgent']) || undefined,
    crystalType: row.crystal_type as KnowledgeCrystal['crystalType'],
    content: row.content,
    summary: row.summary || '',
    confidence: row.confidence,
    domain: row.domain || undefined,
    tags: row.tags ? JSON.parse(row.tags) : [],
    embedding: row.embedding,
    relatedCrystals: row.related_crystals ? JSON.parse(row.related_crystals) : [],
    archivalMemoryId: row.archival_memory_id || undefined,
    graphNodeIds: row.graph_node_ids ? JSON.parse(row.graph_node_ids) : [],
    accessCount: row.access_count,
    reinforcementCount: row.reinforcement_count,
    createdAt: row.created_at,
    lastReinforcedAt: row.last_reinforced_at
  }
}

export function saveCrystal(crystal: KnowledgeCrystal): void {
  const db = getDb()
  db.prepare(`
    INSERT OR REPLACE INTO knowledge_crystals
    (id, project_id, source_response_id, source_agent, crystal_type, content, summary, confidence, domain, tags, embedding, related_crystals, archival_memory_id, graph_node_ids, access_count, reinforcement_count, created_at, last_reinforced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crystal.id,
    crystal.projectId,
    crystal.sourceResponseId || null,
    crystal.sourceAgent || null,
    crystal.crystalType,
    crystal.content,
    crystal.summary,
    crystal.confidence,
    crystal.domain || null,
    JSON.stringify(crystal.tags),
    crystal.embedding || null,
    JSON.stringify(crystal.relatedCrystals),
    crystal.archivalMemoryId || null,
    JSON.stringify(crystal.graphNodeIds),
    crystal.accessCount,
    crystal.reinforcementCount,
    crystal.createdAt,
    crystal.lastReinforcedAt
  )
}

export function saveCrystals(crystals: KnowledgeCrystal[]): void {
  if (crystals.length === 0) return
  const db = getDb()
  const insert = db.prepare(`
    INSERT OR REPLACE INTO knowledge_crystals
    (id, project_id, source_response_id, source_agent, crystal_type, content, summary, confidence, domain, tags, embedding, related_crystals, archival_memory_id, graph_node_ids, access_count, reinforcement_count, created_at, last_reinforced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const transaction = db.transaction(() => {
    for (const crystal of crystals) {
      insert.run(
        crystal.id,
        crystal.projectId,
        crystal.sourceResponseId || null,
        crystal.sourceAgent || null,
        crystal.crystalType,
        crystal.content,
        crystal.summary,
        crystal.confidence,
        crystal.domain || null,
        JSON.stringify(crystal.tags),
        crystal.embedding || null,
        JSON.stringify(crystal.relatedCrystals),
        crystal.archivalMemoryId || null,
        JSON.stringify(crystal.graphNodeIds),
        crystal.accessCount,
        crystal.reinforcementCount,
        crystal.createdAt,
        crystal.lastReinforcedAt
      )
    }
  })
  transaction()
  console.log(`[CrystalStore] Saved ${crystals.length} crystals`)
}

export function getCrystalById(id: string): KnowledgeCrystal | null {
  const db = getDb()
  const row = db.prepare('SELECT * FROM knowledge_crystals WHERE id = ?').get(id) as DbKnowledgeCrystal | undefined
  return row ? dbToKnowledgeCrystal(row) : null
}

export function getCrystalsByProject(projectId: string, limit = 100): KnowledgeCrystal[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM knowledge_crystals WHERE project_id = ? ORDER BY last_reinforced_at DESC LIMIT ?')
    .all(projectId, limit) as DbKnowledgeCrystal[]
  return rows.map(dbToKnowledgeCrystal)
}

export function searchCrystalsByTags(projectId: string, tags: string[], limit = 50): KnowledgeCrystal[] {
  const db = getDb()
  const conditions = tags.map(() => 'tags LIKE ?').join(' OR ')
  const params = tags.map(tag => `%"${tag}"%`)
  const rows = db
    .prepare(`SELECT * FROM knowledge_crystals WHERE project_id = ? AND (${conditions}) ORDER BY confidence DESC LIMIT ?`)
    .all(projectId, ...params, limit) as DbKnowledgeCrystal[]
  return rows.map(dbToKnowledgeCrystal)
}

export function searchCrystalsByDomain(projectId: string, domain: string, limit = 50): KnowledgeCrystal[] {
  const db = getDb()
  const rows = db
    .prepare('SELECT * FROM knowledge_crystals WHERE project_id = ? AND domain = ? ORDER BY confidence DESC LIMIT ?')
    .all(projectId, domain, limit) as DbKnowledgeCrystal[]
  return rows.map(dbToKnowledgeCrystal)
}

export function incrementAccess(id: string): void {
  const db = getDb()
  db.prepare('UPDATE knowledge_crystals SET access_count = access_count + 1 WHERE id = ?').run(id)
}

export function reinforceCrystal(id: string): void {
  const db = getDb()
  const now = Date.now()
  db.prepare(
    'UPDATE knowledge_crystals SET reinforcement_count = reinforcement_count + 1, last_reinforced_at = ? WHERE id = ?'
  ).run(now, id)
}

export function deleteCrystal(id: string): void {
  const db = getDb()
  db.prepare('DELETE FROM knowledge_crystals WHERE id = ?').run(id)
}

export function getCrystalStats(projectId: string): CrystalStats {
  const db = getDb()

  const total = (db.prepare('SELECT COUNT(*) as count FROM knowledge_crystals WHERE project_id = ?').get(projectId) as { count: number }).count

  const typeRows = db.prepare(
    'SELECT crystal_type, COUNT(*) as count FROM knowledge_crystals WHERE project_id = ? GROUP BY crystal_type'
  ).all(projectId) as Array<{ crystal_type: string; count: number }>

  const domainRows = db.prepare(
    'SELECT domain, COUNT(*) as count FROM knowledge_crystals WHERE project_id = ? AND domain IS NOT NULL GROUP BY domain'
  ).all(projectId) as Array<{ domain: string; count: number }>

  const avgRow = db.prepare(
    'SELECT AVG(confidence) as avg_conf, AVG(reinforcement_count) as avg_reinf FROM knowledge_crystals WHERE project_id = ?'
  ).get(projectId) as { avg_conf: number | null; avg_reinf: number | null }

  const byType: Record<string, number> = {}
  for (const row of typeRows) {
    byType[row.crystal_type] = row.count
  }

  const byDomain: Record<string, number> = {}
  for (const row of domainRows) {
    byDomain[row.domain] = row.count
  }

  return {
    totalCrystals: total,
    byType,
    byDomain,
    averageConfidence: avgRow.avg_conf || 0,
    averageReinforcementCount: avgRow.avg_reinf || 0
  }
}
