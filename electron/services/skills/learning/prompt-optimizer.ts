import { getDb } from '../../db'
import { randomUUID } from 'crypto'
import { runDSPyOptimization, storeOptimizedPrompt, getActivePrompt, getOptimizationHistory, type OptimizationResult } from './dspy-bridge'
import { optimizationQueries } from './learning-db'
import { getSessionMetrics } from './event-collector'

const MIN_TRAINING_PAIRS = 5
const AUTO_OPTIMIZE_THRESHOLD = 50
let lastAutoOptimizeCount: Record<string, number> = {}

export interface OptimizeResult {
  template: string
  improvement: number
  method: string
  report: string
  pairsUsed: number
  version: number
}

export async function optimizePrompt(projectId: string, currentTemplate: string, skillName: string = 'default'): Promise<OptimizeResult> {
  const db = getDb()

  const positivePairs = db.prepare(
    'SELECT query, chunk_id, label, source FROM training_pairs WHERE project_id = ? AND label > 0 ORDER BY label DESC, created_at DESC LIMIT 30'
  ).all(projectId) as Array<{ query: string, chunk_id: string, label: number, source: string }>

  const negativePairs = db.prepare(
    'SELECT query, chunk_id, label, source FROM training_pairs WHERE project_id = ? AND label < 0 ORDER BY label ASC, created_at DESC LIMIT 20'
  ).all(projectId) as Array<{ query: string, chunk_id: string, label: number, source: string }>

  const totalPairs = positivePairs.length + negativePairs.length
  if (totalPairs < MIN_TRAINING_PAIRS) {
    return {
      template: currentTemplate,
      improvement: 0,
      method: 'none',
      report: `Insufficient training data: ${totalPairs}/${MIN_TRAINING_PAIRS} pairs. Keep using Cortex to generate more feedback.`,
      pairsUsed: totalPairs,
      version: 0
    }
  }

  const allExamples = [
    ...positivePairs.map(p => ({ input: p.query, output: p.chunk_id, score: p.label })),
    ...negativePairs.map(p => ({ input: p.query, output: p.chunk_id, score: p.label }))
  ]

  const result = await runDSPyOptimization({
    projectId,
    promptTemplate: currentTemplate,
    trainingExamples: allExamples,
    metric: 'relevance',
    maxTrials: 5
  })

  if (result && result.improvement > 0) {
    storeOptimizedPrompt(projectId, skillName, result.optimizedTemplate, {
      improvement: result.improvement,
      method: result.method,
      pairsUsed: totalPairs,
      variantsTrialed: result.variantsTrialed,
      timestamp: Date.now()
    })

    optimizationQueries.insert(db).run(
      randomUUID(), projectId, 'prompt_optimization',
      JSON.stringify({ template: currentTemplate }),
      JSON.stringify({ template: result.optimizedTemplate }),
      result.improvement
    )

    const history = getOptimizationHistory(projectId, skillName)
    return {
      template: result.optimizedTemplate,
      improvement: result.improvement,
      method: result.method,
      report: result.analysisReport,
      pairsUsed: totalPairs,
      version: history.length
    }
  }

  return {
    template: currentTemplate,
    improvement: 0,
    method: 'none',
    report: 'Optimization did not find improvements over current template.',
    pairsUsed: totalPairs,
    version: 0
  }
}

export function shouldAutoOptimize(projectId: string): boolean {
  const db = getDb()
  const totalPairs = (db.prepare('SELECT COUNT(*) as count FROM training_pairs WHERE project_id = ?').get(projectId) as { count: number })?.count || 0
  const lastCount = lastAutoOptimizeCount[projectId] || 0

  if (totalPairs - lastCount >= AUTO_OPTIMIZE_THRESHOLD) {
    return true
  }
  return false
}

export function markAutoOptimized(projectId: string): void {
  const db = getDb()
  const totalPairs = (db.prepare('SELECT COUNT(*) as count FROM training_pairs WHERE project_id = ?').get(projectId) as { count: number })?.count || 0
  lastAutoOptimizeCount[projectId] = totalPairs
}

export function getOptimizationStatus(projectId: string): {
  totalPairs: number
  readyToOptimize: boolean
  lastOptimization: { improvement: number, timestamp: number } | null
  activePromptVersions: Record<string, number>
} {
  const db = getDb()

  const totalPairs = (db.prepare('SELECT COUNT(*) as count FROM training_pairs WHERE project_id = ?').get(projectId) as { count: number })?.count || 0

  const lastOpt = db.prepare('SELECT improvement, created_at FROM optimization_runs WHERE project_id = ? ORDER BY created_at DESC LIMIT 1').get(projectId) as { improvement: number, created_at: number } | undefined

  const activePrompts = db.prepare('SELECT skill_name, version FROM optimized_prompts WHERE project_id = ? AND active = 1').all(projectId) as Array<{ skill_name: string, version: number }>
  const activePromptVersions: Record<string, number> = {}
  for (const p of activePrompts) activePromptVersions[p.skill_name] = p.version

  return {
    totalPairs,
    readyToOptimize: totalPairs >= MIN_TRAINING_PAIRS,
    lastOptimization: lastOpt ? { improvement: lastOpt.improvement, timestamp: lastOpt.created_at } : null,
    activePromptVersions
  }
}