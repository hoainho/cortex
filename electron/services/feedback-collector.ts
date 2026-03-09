import { randomUUID } from 'crypto'
import {
  getDb,
  feedbackQueries,
  trainingPairQueries,
  learningMetricsQueries,
  type DbFeedbackSignal
} from './db'

type SignalType = 'thumbs_up' | 'thumbs_down' | 'copy' | 'follow_up_quick' | 'follow_up_slow' | 'no_follow_up'

const SIGNAL_TO_LABEL: Record<SignalType, { label: number; source: string }> = {
  thumbs_up: { label: 1.0, source: 'thumbs_up' },
  thumbs_down: { label: -1.0, source: 'thumbs_down' },
  copy: { label: 0.7, source: 'copy' },
  follow_up_quick: { label: -0.5, source: 'implicit_negative' },
  follow_up_slow: { label: 0.5, source: 'implicit_positive' },
  no_follow_up: { label: 0.5, source: 'implicit_positive' }
}

export function recordFeedbackSignal(params: {
  projectId: string
  messageId: string
  conversationId: string
  signalType: SignalType
  query: string
  chunkIds: string[]
  metadata?: Record<string, unknown>
}): void {
  try {
    const db = getDb()
    const id = randomUUID()
    feedbackQueries.insert(db).run(
      id,
      params.projectId,
      params.messageId,
      params.conversationId,
      params.signalType,
      params.query,
      JSON.stringify(params.chunkIds),
      JSON.stringify(params.metadata || {})
    )
  } catch (err) {
    console.error('[FeedbackCollector] Failed to record signal:', err)
  }
}

export function convertSignalsToTrainingPairs(projectId: string): { converted: number } {
  const db = getDb()
  let converted = 0

  try {
    const signals = feedbackQueries.getByProject(db).all(projectId, 100) as DbFeedbackSignal[]

    for (const signal of signals) {
      const chunkIds: string[] = JSON.parse(signal.chunk_ids || '[]')
      if (chunkIds.length === 0) continue

      const mapping = SIGNAL_TO_LABEL[signal.signal_type as SignalType]
      if (!mapping) continue

      for (const chunkId of chunkIds) {
        try {
          trainingPairQueries.insert(db).run(
            randomUUID(),
            projectId,
            signal.query,
            chunkId,
            mapping.label,
            mapping.source,
            1.0
          )
          converted++
        } catch (err) {
          console.error('[FeedbackCollector] Failed to insert training pair:', err)
        }
      }
    }

    if (converted > 0) {
      learningMetricsQueries.insert(db).run(
        randomUUID(),
        projectId,
        'training_pairs_converted',
        converted,
        JSON.stringify({ fromSignals: signals.length, timestamp: Date.now() })
      )
    }
  } catch (err) {
    console.error('[FeedbackCollector] Failed to convert signals:', err)
  }

  return { converted }
}

export function getFeedbackStats(projectId: string): {
  totalFeedback: number
  positiveCount: number
  negativeCount: number
  totalTrainingPairs: number
} {
  const db = getDb()

  const totalFeedback = (feedbackQueries.countByProject(db).get(projectId) as { count: number })?.count || 0
  const totalTrainingPairs = (trainingPairQueries.countByProject(db).get(projectId) as { count: number })?.count || 0

  const positiveSignals = feedbackQueries.getRecentPositive(db).all(projectId, 10000) as DbFeedbackSignal[]
  const negativeSignals = feedbackQueries.getRecentNegative(db).all(projectId, 10000) as DbFeedbackSignal[]

  return {
    totalFeedback,
    positiveCount: positiveSignals.length,
    negativeCount: negativeSignals.length,
    totalTrainingPairs
  }
}

export function getRecentFeedback(projectId: string, limit: number = 50): DbFeedbackSignal[] {
  const db = getDb()
  return feedbackQueries.getByProject(db).all(projectId, limit) as DbFeedbackSignal[]
}
