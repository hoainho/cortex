import { randomUUID } from 'crypto'
import {
  getDb,
  queryPatternQueries,
  promptVariantQueries,
  feedbackQueries,
  learningMetricsQueries,
  type DbFeedbackSignal,
  type DbPromptVariant,
  type DbQueryPattern
} from './db'

const STOP_WORDS = new Set([
  'the', 'and', 'for', 'are', 'was', 'were', 'been', 'have', 'has',
  'how', 'does', 'what', 'when', 'where', 'which', 'that', 'this',
  'with', 'from', 'into', 'about', 'than', 'they', 'them', 'their',
  'there', 'here', 'just', 'also', 'more', 'some', 'only', 'very',
  'can', 'will', 'should', 'would', 'could', 'may', 'might',
  'not', 'but', 'all', 'any', 'each', 'every', 'both', 'few',
  'là', 'của', 'và', 'trong', 'cho', 'với', 'này', 'đó', 'được',
  'các', 'những', 'một', 'hay', 'hoặc', 'khi', 'nào', 'thì',
  'làm', 'gì', 'sao', 'thế', 'nên', 'cần', 'phải', 'muốn'
])

function extractKeywords(text: string): string[] {
  return Array.from(new Set(
    text
      .toLowerCase()
      .replace(/[^\w\sàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ-]/g, ' ')
      .split(/\s+/)
      .filter(k => k.length >= 3 && !STOP_WORDS.has(k))
  ))
}

export function optimizeDecompositionPrompt(projectId: string, basePrompt: string): string {
  try {
    const db = getDb()

    const bestVariant = promptVariantQueries.getBest(db).get(projectId) as DbPromptVariant | undefined
    if (bestVariant && bestVariant.score > 0.5) {
      const examples: string[] = JSON.parse(bestVariant.few_shot_examples || '[]')
      if (examples.length > 0) {
        return bestVariant.template + '\n\n' + examples.join('\n')
      }
      return bestVariant.template
    }

    const enhancements: string[] = []

    const positiveSignals = feedbackQueries.getRecentPositive(db).all(projectId, 10) as DbFeedbackSignal[]
    if (positiveSignals.length > 0) {
      const fewShots = positiveSignals.slice(0, 3).map((signal) => {
        const keywords = extractKeywords(signal.query).slice(0, 3)
        return `Example: "${signal.query}" → ["${keywords.join('", "')}"]`
      })
      enhancements.push('Successful query examples from this project:\n' + fewShots.join('\n'))
    }

    const patterns = queryPatternQueries.getByProject(db).all(projectId, 10) as DbQueryPattern[]
    const frequentPatterns = patterns.filter(p => p.frequency >= 2).slice(0, 5)
    if (frequentPatterns.length > 0) {
      const hints = frequentPatterns.map((p) => {
        const paths: string[] = JSON.parse(p.matched_paths || '[]')
        return `  ${p.pattern} → ${paths.slice(0, 3).join(', ')}`
      })
      enhancements.push('Common patterns in this codebase:\n' + hints.join('\n'))
    }

    if (enhancements.length === 0) return basePrompt

    return basePrompt + '\n\n' + enhancements.join('\n\n')
  } catch (err) {
    console.error('[QueryOptimizer] Failed to optimize prompt:', err)
    return basePrompt
  }
}

export function recordQueryPattern(projectId: string, query: string, matchedPaths: string[]): void {
  try {
    const db = getDb()
    const keywords = extractKeywords(query).slice(0, 3)
    if (keywords.length === 0) return

    const pattern = keywords.sort().join(' ')
    const id = `${projectId}-${pattern}`

    queryPatternQueries.upsert(db).run(
      id,
      projectId,
      pattern,
      JSON.stringify(matchedPaths.slice(0, 10)),
      1,
      Date.now()
    )
  } catch (err) {
    console.error('[QueryOptimizer] Failed to record pattern:', err)
  }
}

export function recordQueryOutcome(projectId: string, query: string, wasSuccessful: boolean): void {
  try {
    const db = getDb()

    if (wasSuccessful) {
      const best = promptVariantQueries.getBest(db).get(projectId) as DbPromptVariant | undefined
      if (best) {
        const newScore = best.score + 0.01
        promptVariantQueries.updateScore(db).run(Math.min(1.0, newScore), best.id)
      }
    }

    learningMetricsQueries.insert(db).run(
      randomUUID(),
      projectId,
      'query_outcome',
      wasSuccessful ? 1.0 : 0.0,
      JSON.stringify({ query: query.slice(0, 200), timestamp: Date.now() })
    )
  } catch (err) {
    console.error('[QueryOptimizer] Failed to record outcome:', err)
  }
}

export function initDefaultVariant(projectId: string, defaultTemplate: string): void {
  try {
    const db = getDb()
    const existing = promptVariantQueries.getBest(db).get(projectId)
    if (existing) return

    promptVariantQueries.insert(db).run(
      randomUUID(),
      projectId,
      'default',
      defaultTemplate,
      '[]',
      0.5
    )
  } catch (err) {
    console.error('[QueryOptimizer] Failed to init default variant:', err)
  }
}
