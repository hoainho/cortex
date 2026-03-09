/**
 * Cost Tracker — Token usage and cost monitoring
 */
import Database from 'better-sqlite3'
import { getDb } from '../../db'
import { randomUUID } from 'crypto'
import { classifyComplexity } from './model-router'
import { getModel } from './model-registry'

export function initCostSchema(): void {
  const db = getDb()
  db.exec(`
    CREATE TABLE IF NOT EXISTS token_usage (
      id TEXT PRIMARY KEY,
      project_id TEXT,
      model TEXT NOT NULL,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cached_tokens INTEGER DEFAULT 0,
      cost REAL DEFAULT 0,
      created_at INTEGER NOT NULL DEFAULT (unixepoch() * 1000)
    );
    CREATE INDEX IF NOT EXISTS idx_usage_project ON token_usage(project_id);
    CREATE INDEX IF NOT EXISTS idx_usage_model ON token_usage(model);
    CREATE INDEX IF NOT EXISTS idx_usage_date ON token_usage(created_at);
  `)
}

export function estimateCost(model: string, inputTokens: number, outputTokens: number): number {
  const known = getModel(model)
  if (!known) return 0
  return ((inputTokens + outputTokens) / 1000) * known.costPer1kTokens
}

export function recordUsage(params: {
  projectId?: string
  model: string
  inputTokens: number
  outputTokens: number
  cachedTokens?: number
  cost: number
}): void {
  try {
    const db = getDb()
    const complexity = classifyComplexity(params.model)
    db.prepare('INSERT INTO token_usage (id, project_id, model, input_tokens, output_tokens, cached_tokens, cost) VALUES (?, ?, ?, ?, ?, ?, ?)').run(
      randomUUID(), params.projectId || null, params.model, params.inputTokens, params.outputTokens, params.cachedTokens || 0, params.cost
    )
    console.log(`[CostTracker] Recorded usage: model=${params.model}, complexity=${complexity}, cost=${params.cost}`)
  } catch (err) {
    console.error('[CostTracker] Record failed:', err)
  }
}

export function getCostByProject(projectId: string, days: number = 30): {
  totalCost: number
  totalInputTokens: number
  totalOutputTokens: number
  totalCachedTokens: number
  queryCount: number
} {
  try {
    const db = getDb()
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const result = db.prepare(`
      SELECT SUM(cost) as total_cost, SUM(input_tokens) as total_input,
        SUM(output_tokens) as total_output, SUM(cached_tokens) as total_cached, COUNT(*) as count
      FROM token_usage WHERE project_id = ? AND created_at > ?
    `).get(projectId, since) as { total_cost: number | null, total_input: number | null, total_output: number | null, total_cached: number | null, count: number }
    return {
      totalCost: result.total_cost || 0,
      totalInputTokens: result.total_input || 0,
      totalOutputTokens: result.total_output || 0,
      totalCachedTokens: result.total_cached || 0,
      queryCount: result.count
    }
  } catch (err) {
    console.error('[CostTracker] Query failed:', err)
    return { totalCost: 0, totalInputTokens: 0, totalOutputTokens: 0, totalCachedTokens: 0, queryCount: 0 }
  }
}

export function getCostByModel(projectId?: string): Array<{ model: string, totalCost: number, queryCount: number }> {
  try {
    const db = getDb()
    const query = projectId
      ? 'SELECT model, SUM(cost) as total_cost, COUNT(*) as count FROM token_usage WHERE project_id = ? GROUP BY model ORDER BY total_cost DESC'
      : 'SELECT model, SUM(cost) as total_cost, COUNT(*) as count FROM token_usage GROUP BY model ORDER BY total_cost DESC'
    const rows = projectId ? db.prepare(query).all(projectId) : db.prepare(query).all()
    return (rows as Array<{ model: string, total_cost: number, count: number }>).map(r => ({
      model: r.model, totalCost: r.total_cost, queryCount: r.count
    }))
  } catch (err) {
    console.error('[CostTracker] Model costs failed:', err)
    return []
  }
}

export function getDailyCosts(projectId: string, days: number = 7): Array<{ date: string, cost: number, queries: number }> {
  try {
    const db = getDb()
    const since = Date.now() - days * 24 * 60 * 60 * 1000
    const rows = db.prepare(`
      SELECT date(created_at / 1000, 'unixepoch') as day, SUM(cost) as cost, COUNT(*) as queries
      FROM token_usage WHERE project_id = ? AND created_at > ?
      GROUP BY day ORDER BY day
    `).all(projectId, since) as Array<{ day: string, cost: number, queries: number }>
    return rows.map(r => ({ date: r.day, cost: r.cost, queries: r.queries }))
  } catch (err) {
    console.error('[CostTracker] Daily costs failed:', err)
    return []
  }
}

export function getTotalSavings(projectId: string): { cachedTokens: number, estimatedSavings: number } {
  try {
    const db = getDb()
    const result = db.prepare('SELECT SUM(cached_tokens) as cached FROM token_usage WHERE project_id = ?').get(projectId) as { cached: number | null }
    const cached = result.cached || 0
    return { cachedTokens: cached, estimatedSavings: cached * 0.000002 }
  } catch (err) {
    console.error('[CostTracker] Savings calc failed:', err)
    return { cachedTokens: 0, estimatedSavings: 0 }
  }
}