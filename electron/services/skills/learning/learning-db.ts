/**
 * Learning Database — SQLite schema for self-learning pipeline
 */
import Database from 'better-sqlite3'
import { getDb } from '../../db'

export function initLearningSchema(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS behavioral_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      data TEXT DEFAULT '{}',
      timestamp INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_events_project ON behavioral_events(project_id);
    CREATE INDEX IF NOT EXISTS idx_events_type ON behavioral_events(project_id, event_type);

    CREATE TABLE IF NOT EXISTS optimization_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      run_type TEXT NOT NULL,
      input_config TEXT DEFAULT '{}',
      output_config TEXT DEFAULT '{}',
      improvement REAL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_optim_project ON optimization_runs(project_id);

    CREATE TABLE IF NOT EXISTS prompt_experiments (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      variant_a TEXT NOT NULL,
      variant_b TEXT NOT NULL,
      winner TEXT,
      metric TEXT,
      score_diff REAL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_experiments_project ON prompt_experiments(project_id);

    CREATE TABLE IF NOT EXISTS optimized_prompts (
      id TEXT PRIMARY KEY,
      skill_name TEXT NOT NULL,
      project_id TEXT NOT NULL,
      prompt_text TEXT NOT NULL,
      version INTEGER NOT NULL DEFAULT 1,
      metrics TEXT DEFAULT '{}',
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000),
      active INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_optprompts_project_skill ON optimized_prompts(project_id, skill_name);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_optprompts_version ON optimized_prompts(project_id, skill_name, version);
  `)
}

export const eventQueries = {
  insert: (db: Database.Database) =>
    db.prepare('INSERT INTO behavioral_events (id, project_id, event_type, data) VALUES (?, ?, ?, ?)'),
  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM behavioral_events WHERE project_id = ? ORDER BY timestamp DESC LIMIT ?'),
  getByType: (db: Database.Database) =>
    db.prepare('SELECT * FROM behavioral_events WHERE project_id = ? AND event_type = ? ORDER BY timestamp DESC LIMIT ?'),
  count: (db: Database.Database) =>
    db.prepare('SELECT COUNT(*) as count FROM behavioral_events WHERE project_id = ?'),
  countByType: (db: Database.Database) =>
    db.prepare('SELECT event_type, COUNT(*) as count FROM behavioral_events WHERE project_id = ? GROUP BY event_type')
}

export const optimizationQueries = {
  insert: (db: Database.Database) =>
    db.prepare('INSERT INTO optimization_runs (id, project_id, run_type, input_config, output_config, improvement) VALUES (?, ?, ?, ?, ?, ?)'),
  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM optimization_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
}

export const experimentQueries = {
  insert: (db: Database.Database) =>
    db.prepare('INSERT INTO prompt_experiments (id, project_id, variant_a, variant_b, winner, metric, score_diff) VALUES (?, ?, ?, ?, ?, ?, ?)'),
  getByProject: (db: Database.Database) =>
    db.prepare('SELECT * FROM prompt_experiments WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
}