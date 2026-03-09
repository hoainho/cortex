import type { BehavioralEvent } from './event-collector'
import { getEventsByProject } from './event-collector'
import { recordFeedbackSignal, convertSignalsToTrainingPairs } from '../../feedback-collector'
import { shouldAutoOptimize, markAutoOptimized } from './prompt-optimizer'
import { trainFromPairs } from '../../learned-reranker'

interface DetectedFeedback {
  type: 'positive' | 'negative' | 'mixed'
  confidence: number
  source: string
  projectId: string
  data: Record<string, unknown>
}

export function detectImplicitFeedback(events: BehavioralEvent[]): DetectedFeedback[] {
  const feedback: DetectedFeedback[] = []
  const sorted = [...events].sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0))
  const processedPairs = new Set<string>()

  for (let i = 0; i < sorted.length; i++) {
    const event = sorted[i]
    const next = sorted[i + 1]
    const pairKey = `${event.type}:${event.timestamp}`
    if (processedPairs.has(pairKey)) continue
    processedPairs.add(pairKey)

    if (event.type === 'message_sent' && next?.type === 'message_sent') {
      const gap = (next.timestamp || 0) - (event.timestamp || 0)
      if (gap < 10000) {
        feedback.push({ type: 'negative', confidence: 0.7, source: 'quick_followup', projectId: event.projectId, data: { gap, ...event.data } })
      } else if (gap > 60000) {
        feedback.push({ type: 'positive', confidence: 0.5, source: 'slow_followup', projectId: event.projectId, data: { gap, ...event.data } })
      }
    }

    if (event.type === 'message_copied' || event.type === 'code_accepted') {
      feedback.push({ type: 'positive', confidence: 0.85, source: event.type, projectId: event.projectId, data: event.data })
    }

    if (event.type === 'code_rejected') {
      feedback.push({ type: 'negative', confidence: 0.75, source: 'code_rejected', projectId: event.projectId, data: event.data })
    }

    if (event.type === 'result_clicked') {
      feedback.push({ type: 'positive', confidence: 0.6, source: 'result_clicked', projectId: event.projectId, data: event.data })
    }

    if (event.type === 'search_performed') {
      const hasNext = sorted.slice(i + 1, i + 4).some(e => e.type === 'result_clicked' || e.type === 'message_copied')
      if (!hasNext) {
        feedback.push({ type: 'negative', confidence: 0.4, source: 'search_no_action', projectId: event.projectId, data: event.data })
      }
    }

    if (event.type === 'session_duration') {
      const duration = (event.data.duration as number) || 0
      if (duration > 300000) {
        feedback.push({ type: 'positive', confidence: 0.4, source: 'long_session', projectId: event.projectId, data: { duration } })
      } else if (duration < 30000) {
        feedback.push({ type: 'negative', confidence: 0.3, source: 'short_session', projectId: event.projectId, data: { duration } })
      }
    }
  }

  return feedback
}

const SIGNAL_TYPE_MAP: Record<string, string> = {
  positive: 'no_follow_up',
  negative: 'follow_up_quick',
  mixed: 'follow_up_slow'
}

export function convertToSignals(detected: DetectedFeedback[]): number {
  let converted = 0
  for (const fb of detected) {
    const signalType = SIGNAL_TYPE_MAP[fb.type] || 'follow_up_slow'
    try {
      recordFeedbackSignal({
        projectId: fb.projectId,
        messageId: (fb.data.messageId as string) || 'implicit',
        conversationId: (fb.data.conversationId as string) || 'implicit',
        signalType: signalType as 'no_follow_up' | 'follow_up_quick' | 'follow_up_slow',
        query: (fb.data.query as string) || '',
        chunkIds: (fb.data.chunkIds as string[]) || [],
        metadata: { source: fb.source, confidence: fb.confidence }
      })
      converted++
    } catch (err) {
      console.error('[FeedbackDetector] Signal conversion failed:', err)
    }
  }
  return converted
}

export function runDetectionPipeline(projectId: string): { detected: number, converted: number, trainingPairs: number, rerankerUpdated: boolean, autoOptimizeTriggered: boolean } {
  const events = getEventsByProject(projectId, 500)
  const detected = detectImplicitFeedback(events)
  const converted = convertToSignals(detected)

  let trainingPairsConverted = 0
  try {
    const result = convertSignalsToTrainingPairs(projectId)
    trainingPairsConverted = result.converted
  } catch (err) {
    console.error('[FeedbackDetector] Training pair conversion failed:', err)
  }

  let rerankerUpdated = false
  try {
    const result = trainFromPairs(projectId)
    rerankerUpdated = result.weightsUpdated > 0
  } catch (err) {
    console.error('[FeedbackDetector] Reranker training failed:', err)
  }

  let autoOptimizeTriggered = false
  if (shouldAutoOptimize(projectId)) {
    autoOptimizeTriggered = true
    markAutoOptimized(projectId)
    console.log(`[FeedbackDetector] Auto-optimization threshold reached for project ${projectId}`)
  }

  return {
    detected: detected.length,
    converted,
    trainingPairs: trainingPairsConverted,
    rerankerUpdated,
    autoOptimizeTriggered
  }
}