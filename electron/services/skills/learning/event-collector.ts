import { getDb } from '../../db'
import { randomUUID } from 'crypto'
import { initLearningSchema, eventQueries } from './learning-db'
import { runDetectionPipeline } from './feedback-detector'

export type EventType = 'message_sent' | 'message_copied' | 'code_accepted' | 'code_rejected' | 'follow_up_quick' | 'follow_up_slow' | 'search_performed' | 'result_clicked' | 'session_duration' | 'response_rated' | 'preference_expressed'

export interface BehavioralEvent {
  type: EventType
  projectId: string
  data: Record<string, unknown>
  timestamp?: number
}

const DETECTION_INTERVAL = 10
const HIGH_PRIORITY_EVENTS: EventType[] = ['code_accepted', 'code_rejected', 'response_rated']

let schemaInitialized = false

function ensureSchema(): void {
  if (!schemaInitialized) {
    initLearningSchema()
    schemaInitialized = true
  }
}

export function recordEvent(event: BehavioralEvent): void {
  ensureSchema()
  try {
    const db = getDb()
    eventQueries.insert(db).run(randomUUID(), event.projectId, event.type, JSON.stringify(event.data))

    const isHighPriority = HIGH_PRIORITY_EVENTS.includes(event.type)
    const count = (eventQueries.count(db).get(event.projectId) as { count: number }).count
    const shouldRunDetection = isHighPriority || (count > 0 && count % DETECTION_INTERVAL === 0)

    if (shouldRunDetection) {
      try {
        const result = runDetectionPipeline(event.projectId)
        console.log(`[EventCollector] Detection: ${result.detected} detected, ${result.converted} signals, ${result.trainingPairs} pairs, reranker=${result.rerankerUpdated}, autoOptimize=${result.autoOptimizeTriggered}`)
      } catch (detErr) {
        console.error('[EventCollector] Feedback detection failed:', detErr)
      }
    }
  } catch (err) {
    console.error('[EventCollector] Failed to record:', err)
  }
}

export function getEventsByProject(projectId: string, limit: number = 100): BehavioralEvent[] {
  ensureSchema()
  try {
    const db = getDb()
    const rows = eventQueries.getByProject(db).all(projectId, limit) as Array<{ event_type: string, project_id: string, data: string, timestamp: number }>
    return rows.map(r => ({ type: r.event_type as EventType, projectId: r.project_id, data: JSON.parse(r.data || '{}'), timestamp: r.timestamp }))
  } catch (err) {
    console.error('[EventCollector] Failed to get events:', err)
    return []
  }
}

export function getEventsByType(projectId: string, type: EventType, limit: number = 50): BehavioralEvent[] {
  ensureSchema()
  try {
    const db = getDb()
    const rows = eventQueries.getByType(db).all(projectId, type, limit) as Array<{ event_type: string, project_id: string, data: string, timestamp: number }>
    return rows.map(r => ({ type: r.event_type as EventType, projectId: r.project_id, data: JSON.parse(r.data || '{}'), timestamp: r.timestamp }))
  } catch (err) {
    console.error('[EventCollector] Failed:', err)
    return []
  }
}

export function getSessionMetrics(projectId: string): { totalEvents: number, eventBreakdown: Record<string, number> } {
  ensureSchema()
  try {
    const db = getDb()
    const total = (eventQueries.count(db).get(projectId) as { count: number }).count
    const breakdown = eventQueries.countByType(db).all(projectId) as Array<{ event_type: string, count: number }>
    const eventBreakdown: Record<string, number> = {}
    for (const row of breakdown) eventBreakdown[row.event_type] = row.count
    return { totalEvents: total, eventBreakdown }
  } catch (err) {
    console.error('[EventCollector] Metrics failed:', err)
    return { totalEvents: 0, eventBreakdown: {} }
  }
}