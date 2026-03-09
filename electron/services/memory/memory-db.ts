/**
 * Memory Database — SQLite schema + query helpers for 3-tier memory
 */

import Database from 'better-sqlite3'
import { getDb } from '../db'

export function initMemorySchema(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS core_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      section TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      UNIQUE(project_id, section)
    );

    CREATE TABLE IF NOT EXISTS archival_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      metadata TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      accessed_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      access_count INTEGER DEFAULT 0,
      relevance_score REAL DEFAULT 1.0
    );
    CREATE INDEX IF NOT EXISTS idx_archival_project ON archival_memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_archival_relevance ON archival_memory(project_id, relevance_score);

    CREATE TABLE IF NOT EXISTS recall_memory (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding BLOB,
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_recall_project ON recall_memory(project_id);
    CREATE INDEX IF NOT EXISTS idx_recall_conv ON recall_memory(conversation_id);
    CREATE INDEX IF NOT EXISTS idx_recall_timestamp ON recall_memory(project_id, timestamp);

    CREATE TABLE IF NOT EXISTS memory_migration_status (
      project_id TEXT PRIMARY KEY,
      migrated_at INTEGER NOT NULL,
      recall_count INTEGER DEFAULT 0,
      archival_count INTEGER DEFAULT 0
    );
  `)
}

export const coreMemoryQueries = {
  upsert: (db: Database.Database) =>
    db.prepare(`
      INSERT INTO core_memory (id, project_id, section, content, updated_at)
      VALUES (?, ?, ?, ?, unixepoch() * 1000)
      ON CONFLICT(project_id, section) DO UPDATE SET
        content = excluded.content,
        updated_at = unixepoch() * 1000
    `),

  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM core_memory WHERE project_id = ? ORDER BY section'),

  getBySection: (db: Database.Database) =>
    db.prepare('SELECT * FROM core_memory WHERE project_id = ? AND section = ?'),

  delete: (db: Database.Database) =>
    db.prepare('DELETE FROM core_memory WHERE project_id = ? AND section = ?'),

  deleteAll: (db: Database.Database) =>
    db.prepare('DELETE FROM core_memory WHERE project_id = ?'),

  count: (db: Database.Database) =>
    db.prepare('SELECT COUNT(*) as count FROM core_memory WHERE project_id = ?')
}

export const archivalMemoryQueries = {
  insert: (db: Database.Database) =>
    db.prepare(`
      INSERT INTO archival_memory (id, project_id, content, embedding, metadata, created_at, accessed_at)
      VALUES (?, ?, ?, ?, ?, unixepoch() * 1000, unixepoch() * 1000)
    `),

  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM archival_memory WHERE project_id = ? ORDER BY relevance_score DESC, accessed_at DESC LIMIT ? OFFSET ?'),

  searchByContent: (db: Database.Database) =>
    db.prepare('SELECT * FROM archival_memory WHERE project_id = ? AND content LIKE ? ORDER BY relevance_score DESC LIMIT ?'),

  updateAccess: (db: Database.Database) =>
    db.prepare(`
      UPDATE archival_memory SET
        accessed_at = unixepoch() * 1000,
        access_count = access_count + 1
      WHERE id = ?
    `),

  updateRelevance: (db: Database.Database) =>
    db.prepare('UPDATE archival_memory SET relevance_score = ? WHERE id = ?'),

  decayRelevance: (db: Database.Database) =>
    db.prepare(`
      UPDATE archival_memory SET relevance_score = MAX(0.1, relevance_score * 0.95)
      WHERE project_id = ? AND accessed_at < ? AND relevance_score > 0.1
    `),

  delete: (db: Database.Database) =>
    db.prepare('DELETE FROM archival_memory WHERE id = ?'),

  deleteByProject: (db: Database.Database) =>
    db.prepare('DELETE FROM archival_memory WHERE project_id = ?'),

  count: (db: Database.Database) =>
    db.prepare('SELECT COUNT(*) as count FROM archival_memory WHERE project_id = ?'),

  getStats: (db: Database.Database) =>
    db.prepare(`
      SELECT
        COUNT(*) as total,
        MIN(created_at) as oldest,
        MAX(created_at) as newest,
        AVG(relevance_score) as avg_relevance
      FROM archival_memory WHERE project_id = ?
    `),

  getWithEmbeddings: (db: Database.Database) =>
    db.prepare('SELECT * FROM archival_memory WHERE project_id = ? AND embedding IS NOT NULL')
}

export const recallMemoryQueries = {
  insert: (db: Database.Database) =>
    db.prepare(`
      INSERT INTO recall_memory (id, project_id, conversation_id, role, content, embedding, timestamp)
      VALUES (?, ?, ?, ?, ?, ?, unixepoch() * 1000)
    `),

  getByConversation: (db: Database.Database) =>
    db.prepare('SELECT * FROM recall_memory WHERE conversation_id = ? ORDER BY timestamp ASC LIMIT ?'),

  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM recall_memory WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'),

  searchByContent: (db: Database.Database) =>
    db.prepare('SELECT * FROM recall_memory WHERE project_id = ? AND content LIKE ? ORDER BY timestamp DESC LIMIT ?'),

  delete: (db: Database.Database) =>
    db.prepare('DELETE FROM recall_memory WHERE id = ?'),

  deleteByConversation: (db: Database.Database) =>
    db.prepare('DELETE FROM recall_memory WHERE conversation_id = ?'),

  deleteByProject: (db: Database.Database) =>
    db.prepare('DELETE FROM recall_memory WHERE project_id = ?'),

  count: (db: Database.Database) =>
    db.prepare('SELECT COUNT(*) as count FROM recall_memory WHERE project_id = ?'),

  getRecent: (db: Database.Database) =>
    db.prepare('SELECT * FROM recall_memory WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'),

  getWithEmbeddings: (db: Database.Database) =>
    db.prepare('SELECT * FROM recall_memory WHERE project_id = ? AND embedding IS NOT NULL')
}

export const migrationStatusQueries = {
  get: (db: Database.Database) =>
    db.prepare('SELECT * FROM memory_migration_status WHERE project_id = ?'),

  upsert: (db: Database.Database) =>
    db.prepare(`
      INSERT INTO memory_migration_status (project_id, migrated_at, recall_count, archival_count)
      VALUES (?, unixepoch() * 1000, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        migrated_at = unixepoch() * 1000,
        recall_count = excluded.recall_count,
        archival_count = excluded.archival_count
    `)
}